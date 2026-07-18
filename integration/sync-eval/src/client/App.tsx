import { useSync } from '@tldraw/sync'
import { useEffect, useMemo, useRef } from 'react'
import { resolveAllowedSyncHttp } from '../../shared/security'
import {
	AssetRecordType,
	atom,
	computed,
	createShapeId,
	createUserId,
	getDefaultUserPresence,
	getHashForString,
	Tldraw,
	type TLAssetStore,
	type TLBookmarkAsset,
	type TLShapeId,
	type TLUserPreferences,
	type TLUserStore,
	uniqueId,
	UserRecordType,
	type Editor,
} from 'tldraw'

type HarnessApi = {
	ready: boolean
	status: string
	error?: string | null
	roomId: string
	userName: string
	clientLabel: string
	tldrawVersion: string
	syncVersion: string
	createGeoShape: (input: {
		idSuffix: string
		x: number
		y: number
		w?: number
		h?: number
		meta?: Record<string, unknown>
	}) => string
	updateShapePosition: (shapeId: string, x: number, y: number) => void
	getShapeSnapshot: (shapeId: string) => null | {
		id: string
		type: string
		x: number
		y: number
		meta: Record<string, unknown>
	}
	listShapeIds: () => string[]
	listPresence: () => Array<{ userId: string; userName: string; hasCursor: boolean }>
	getDocumentClockHint: () => number
}

function qs(): URLSearchParams {
	return new URLSearchParams(window.location.search)
}

function defaultSyncHttp(): string {
	const fromQuery = qs().get('syncUrl')
	const fromEnv = import.meta.env.VITE_SYNC_HTTP_URL as string | undefined
	const localDefault = 'http://127.0.0.1:5858'
	const configuredAllowlist = (import.meta.env.VITE_SYNC_ORIGINS as string | undefined)
		?.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean) ?? []
	if (fromEnv) {
		try {
			const configuredUrl = new URL(fromEnv)
			if (configuredUrl.protocol === 'http:' || configuredUrl.protocol === 'https:') {
				configuredAllowlist.push(configuredUrl.origin)
			}
		} catch {
			// Invalid configured values fail back to the local harness endpoint.
		}
	}
	const fallback = resolveAllowedSyncHttp(fromEnv, localDefault, configuredAllowlist)
	return resolveAllowedSyncHttp(fromQuery, fallback, configuredAllowlist)
}

function toWsBase(httpUrl: string): string {
	const u = new URL(httpUrl)
	u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
	return u.toString().replace(/\/$/, '')
}

function createMultiplayerAssets(token: string): TLAssetStore {
	return {
		async upload(_asset, file) {
			const id = uniqueId()
			const objectName = `${id}-${file.name}`
			const base = `${defaultSyncHttp()}/uploads/${encodeURIComponent(objectName)}`
			const url = `${base}?token=${encodeURIComponent(token)}`
			const response = await fetch(url, {
				method: 'PUT',
				headers: {
					'content-type': file.type || 'application/octet-stream',
				},
				body: file,
			})
			if (!response.ok) throw new Error(`Failed to upload asset: ${response.statusText}`)
			// Include token so GET /uploads also authorizes (harness-only; not production).
			return { src: url }
		},
		resolve(asset) {
			return asset.props.src
		},
	}
}

async function unfurlBookmarkUrl({ url }: { url: string }): Promise<TLBookmarkAsset> {
	return {
		id: AssetRecordType.createId(getHashForString(url)),
		typeName: 'asset',
		type: 'bookmark',
		meta: {},
		props: {
			src: url,
			description: '',
			image: '',
			favicon: '',
			title: '',
		},
	}
}

function installHarness(
	editor: Editor,
	meta: {
		roomId: string
		userName: string
		clientLabel: string
		status: string
		error?: string | null
	}
) {
	const api: HarnessApi = {
		ready: true,
		status: meta.status,
		error: meta.error ?? null,
		roomId: meta.roomId,
		userName: meta.userName,
		clientLabel: meta.clientLabel,
		tldrawVersion: __TLDRAW_VERSION__,
		syncVersion: __TLDRAW_SYNC_VERSION__,
		createGeoShape(input) {
			const id = createShapeId(`sync-eval-${input.idSuffix}`)
			editor.createShapes([
				{
					id,
					type: 'geo',
					x: input.x,
					y: input.y,
					meta: (input.meta ?? {}) as Record<string, string | number | boolean | null>,
					props: {
						geo: 'rectangle',
						w: input.w ?? 160,
						h: input.h ?? 100,
					},
				},
			])
			return id
		},
		updateShapePosition(shapeId, x, y) {
			editor.updateShapes([{ id: shapeId as TLShapeId, type: 'geo', x, y }])
		},
		getShapeSnapshot(shapeId) {
			const shape = editor.store.get(shapeId as TLShapeId)
			if (!shape || shape.typeName !== 'shape') return null
			return {
				id: shape.id,
				type: shape.type,
				x: shape.x,
				y: shape.y,
				meta: { ...(shape.meta as Record<string, unknown>) },
			}
		},
		listShapeIds() {
			return editor
				.getCurrentPageShapes()
				.map((s) => s.id)
				.sort()
		},
		listPresence() {
			const records = editor.store.allRecords()
			const out: Array<{ userId: string; userName: string; hasCursor: boolean }> = []
			for (const r of records) {
				if (r.typeName !== 'instance_presence') continue
				out.push({
					userId: String((r as { userId?: string }).userId ?? ''),
					userName: String((r as { userName?: string }).userName ?? ''),
					hasCursor: Boolean((r as { cursor?: unknown }).cursor),
				})
			}
			return out
		},
		getDocumentClockHint() {
			return editor.store.allRecords().length
		},
	}
	;(window as unknown as { __syncEval: HarnessApi }).__syncEval = api
	;(window as unknown as { editor: Editor }).editor = editor
}

function App() {
	const params = qs()
	const roomId = params.get('roomId') || 'test-room'
	const token = params.get('token') || ''
	const userName = params.get('user') || 'Anonymous'
	const clientLabel = params.get('label') || 'client'
	const color = params.get('color') || '#4465E9'
	const userId = params.get('userId') || `user-${clientLabel}`

	const userPreferences: TLUserPreferences = useMemo(
		() => ({
			id: userId,
			name: userName,
			color,
			colorScheme: 'light',
		}),
		[userId, userName, color]
	)

	const userPrefsAtom = useRef(atom<TLUserPreferences>('userPrefs', userPreferences)).current
	useEffect(() => {
		userPrefsAtom.set(userPreferences)
	}, [userPreferences, userPrefsAtom])

	const users: TLUserStore = useMemo(() => {
		const currentUser = computed('currentUser', () => {
			const p = userPrefsAtom.get()
			return UserRecordType.create({
				id: createUserId(p.id ?? userId),
				name: p.name ?? userName,
				color: p.color ?? color,
			})
		})
		return { currentUser }
	}, [userPrefsAtom, userId, userName, color])

	const wsUri = `${toWsBase(defaultSyncHttp())}/connect/${encodeURIComponent(roomId)}?token=${encodeURIComponent(token)}`
	const multiplayerAssets = useMemo(() => createMultiplayerAssets(token), [token])

	const store = useSync({
		uri: wsUri,
		assets: multiplayerAssets,
		users,
		getUserPresence(storeApi, user) {
			const defaults = getDefaultUserPresence(storeApi, user)
			if (!defaults) return null
			return {
				...defaults,
			}
		},
	})

	// useSync reports 'synced-remote' when connected; harness normalizes to 'synced'
	const harnessStatus =
		store.status === 'synced-remote' ? 'synced' : store.status === 'error' ? 'error' : 'loading'

	useEffect(() => {
		const existing = (window as unknown as { __syncEval?: HarnessApi }).__syncEval
		if (store.status === 'error') {
			const err =
				'error' in store && store.error
					? String((store.error as Error)?.message || store.error)
					: 'sync_error'
			;(window as unknown as { __syncEval: HarnessApi }).__syncEval = {
				ready: true,
				status: 'error',
				error: err,
				roomId,
				userName,
				clientLabel,
				tldrawVersion: __TLDRAW_VERSION__,
				syncVersion: __TLDRAW_SYNC_VERSION__,
				createGeoShape: () => {
					throw new Error('not synced')
				},
				updateShapePosition: () => {
					throw new Error('not synced')
				},
				getShapeSnapshot: () => null,
				listShapeIds: () => [],
				listPresence: () => [],
				getDocumentClockHint: () => 0,
			}
			return
		}
		if (existing && store.status === 'synced-remote') {
			existing.status = 'synced'
			existing.ready = true
			existing.error = null
		} else if (!existing) {
			;(window as unknown as { __syncEval: Partial<HarnessApi> }).__syncEval = {
				ready: false,
				status: harnessStatus,
				error: null,
				roomId,
				userName,
				clientLabel,
				tldrawVersion: __TLDRAW_VERSION__,
				syncVersion: __TLDRAW_SYNC_VERSION__,
			}
		} else {
			existing.status = harnessStatus
		}
	}, [store, harnessStatus, roomId, userName, clientLabel])

	if (store.status === 'error') {
		return (
			<div data-testid="sync-error" style={{ padding: 24, fontFamily: 'sans-serif' }}>
				<h1>Sync error</h1>
				<pre>{String('error' in store ? store.error : 'unknown')}</pre>
				<p>
					room={roomId} user={userName} label={clientLabel}
				</p>
			</div>
		)
	}

	if (store.status !== 'synced-remote') {
		return (
			<div data-testid="sync-loading" style={{ padding: 24, fontFamily: 'sans-serif' }}>
				Connecting to room <code>{roomId}</code>…
			</div>
		)
	}

	return (
		<div style={{ position: 'fixed', inset: 0 }} data-testid="sync-editor">
			<Tldraw
				store={store.store}
				onMount={(editor) => {
					editor.registerExternalAssetHandler('url', unfurlBookmarkUrl)
					installHarness(editor, {
						roomId,
						userName,
						clientLabel,
						status: 'synced',
					})
				}}
			/>
		</div>
	)
}

export default App
