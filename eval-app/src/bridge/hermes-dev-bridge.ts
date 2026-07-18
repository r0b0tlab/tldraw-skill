/**
 * Hermes dev-only bridge for tldraw Editor automation.
 *
 * Safety contract:
 * - Activates only when import.meta.env.DEV is true AND host is localhost/127.0.0.1/[::1]
 * - Never exposes secrets, network credentials, or arbitrary eval
 * - Accepts an already-mounted Editor; does not create a parallel store
 * - Cleanup removes globals on unmount
 *
 * Optional: @tldraw/driver may be wrapped via createOptionalDriverAdapter when the package
 * is available and compiles in the target environment.
 *
 * Copy this template into an app and call mountHermesDevBridge(editor) from Tldraw onMount.
 * Production builds must not mount the bridge (import.meta.env.DEV is false under Vite).
 */

import type { Editor, TLShape, TLShapeId, TLShapePartial } from 'tldraw'
import {
	createShapeId,
	parseTldrawJsonFile,
	serializeTldrawJson,
	toRichText,
} from 'tldraw'

export type HermesBridgeShapeCreate = TLShapePartial

export interface HermesBridgeCameraState {
	x: number
	y: number
	z: number
}

export interface HermesBridgeExportResult {
	svg?: string
	pngBlob?: Blob
	width?: number
	height?: number
}

export interface HermesBridgeStatus {
	ok: boolean
	bridgeMounted: boolean
	devOnly: boolean
	localhostOnly: boolean
	shapeCount: number
	selectedIds: string[]
	camera: HermesBridgeCameraState
	errors: string[]
	notes: string[]
}

/**
 * Narrow, typed surface for agent automation. Prefer this over raw Editor access from window.
 */
export interface HermesDevBridge {
	readonly editor: Editor
	readonly version: '1.0.0'
	createShapes(partials: HermesBridgeShapeCreate[]): TLShapeId[]
	updateShapes(partials: TLShapePartial[]): void
	deleteShapes(ids: TLShapeId[]): void
	getShape(id: TLShapeId): TLShape | undefined
	getCurrentPageShapes(): TLShape[]
	select(ids: TLShapeId[]): void
	selectAll(): void
	selectNone(): void
	getSelectedShapeIds(): TLShapeId[]
	setCamera(camera: Partial<HermesBridgeCameraState>): void
	getCamera(): HermesBridgeCameraState
	zoomToFit(opts?: { animation?: { duration: number } }): void
	serializeTldr(): Promise<string>
	parseTldr(json: string): { ok: true; store: unknown } | { ok: false; error: unknown }
	exportSvg(ids?: TLShapeId[]): Promise<HermesBridgeExportResult>
	exportPng(ids?: TLShapeId[]): Promise<HermesBridgeExportResult>
	run(fn: (editor: Editor) => void): void
	getStatus(): HermesBridgeStatus
	/** Optional Driver adapter; null when not constructed. */
	getDriverAdapter(): HermesDriverAdapter | null
	dispose(): void
}

export interface HermesDriverAdapter {
	readonly kind: 'tldraw-driver'
	/** Dispose the underlying Driver if present. */
	dispose(): void
	/** Best-effort note when Driver could not be constructed. */
	readonly note: string
}

export interface MountHermesDevBridgeOptions {
	/**
	 * Optional factory for @tldraw/driver. Kept injectable so browser bundles
	 * can omit Driver if the package fails to resolve in a given environment.
	 */
	driverFactory?: (editor: Editor) => HermesDriverAdapter | null
	/** Global name (default: __hermesTldrawBridge). */
	globalName?: string
}

const DEFAULT_GLOBAL = '__hermesTldrawBridge'

declare global {
	interface Window {
		__hermesTldrawBridge?: HermesDevBridge
		__hermesTldrawEvalStatus?: Record<string, unknown>
	}
}

export function isHermesBridgeAllowedHost(hostname: string = getHostname()): boolean {
	return (
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '[::1]' ||
		hostname === '::1'
	)
}

export function isHermesBridgeDevMode(devFlag: boolean = getDevFlag()): boolean {
	return devFlag === true
}

export function canMountHermesDevBridge(
	hostname: string = getHostname(),
	devFlag: boolean = getDevFlag()
): boolean {
	return isHermesBridgeDevMode(devFlag) && isHermesBridgeAllowedHost(hostname)
}

function getHostname(): string {
	if (typeof window === 'undefined' || !window.location) return ''
	return window.location.hostname
}

function getDevFlag(): boolean {
	try {
		// Vite injects this; false in production builds.
		return Boolean(import.meta.env?.DEV)
	} catch {
		return false
	}
}

/**
 * Create a typed bridge over a mounted Editor. Returns null when the host/dev gate fails.
 */
export function createHermesDevBridge(
	editor: Editor,
	options: MountHermesDevBridgeOptions = {}
): HermesDevBridge | null {
	if (!canMountHermesDevBridge()) {
		return null
	}

	let disposed = false
	let driverAdapter: HermesDriverAdapter | null = null

	if (options.driverFactory) {
		try {
			driverAdapter = options.driverFactory(editor)
		} catch (err) {
			driverAdapter = {
				kind: 'tldraw-driver',
				note: `Driver factory failed: ${err instanceof Error ? err.message : String(err)}`,
				dispose() {},
			}
		}
	}

	const assertAlive = () => {
		if (disposed) throw new Error('HermesDevBridge has been disposed')
	}

	const bridge: HermesDevBridge = {
		editor,
		version: '1.0.0',

		createShapes(partials) {
			assertAlive()
			const withIds = partials.map((p) => ({
				...p,
				id: p.id ?? createShapeId(),
			}))
			editor.run(() => {
				editor.createShapes(withIds)
			})
			return withIds.map((p) => p.id as TLShapeId)
		},

		updateShapes(partials) {
			assertAlive()
			editor.run(() => {
				editor.updateShapes(partials)
			})
		},

		deleteShapes(ids) {
			assertAlive()
			editor.run(() => {
				editor.deleteShapes(ids)
			})
		},

		getShape(id) {
			assertAlive()
			return editor.getShape(id)
		},

		getCurrentPageShapes() {
			assertAlive()
			return editor.getCurrentPageShapes()
		},

		select(ids) {
			assertAlive()
			editor.setSelectedShapes(ids)
		},

		selectAll() {
			assertAlive()
			editor.selectAll()
		},

		selectNone() {
			assertAlive()
			editor.selectNone()
		},

		getSelectedShapeIds() {
			assertAlive()
			return [...editor.getSelectedShapeIds()]
		},

		setCamera(camera) {
			assertAlive()
			const current = editor.getCamera()
			editor.setCamera({
				x: camera.x ?? current.x,
				y: camera.y ?? current.y,
				z: camera.z ?? current.z,
			})
		},

		getCamera() {
			assertAlive()
			const c = editor.getCamera()
			return { x: c.x, y: c.y, z: c.z }
		},

		zoomToFit(opts) {
			assertAlive()
			editor.zoomToFit(opts)
		},

		async serializeTldr() {
			assertAlive()
			return serializeTldrawJson(editor)
		},

		parseTldr(json) {
			assertAlive()
			const result = parseTldrawJsonFile({
				json,
				schema: editor.store.schema,
			})
			if (result.ok === true) {
				return { ok: true as const, store: result.value }
			}
			const failure = result as { ok: false; error: unknown }
			return { ok: false as const, error: failure.error }
		},

		async exportSvg(ids) {
			assertAlive()
			const shapes = ids ?? editor.getCurrentPageShapeIds()
			const result = await editor.getSvgString([...shapes], { background: true })
			if (!result) return {}
			return { svg: result.svg, width: result.width, height: result.height }
		},

		async exportPng(ids) {
			assertAlive()
			const shapes = ids ?? [...editor.getCurrentPageShapeIds()]
			const result = await editor.toImage(shapes, {
				format: 'png',
				background: true,
				pixelRatio: 2,
			})
			return {
				pngBlob: result.blob,
				width: result.width,
				height: result.height,
			}
		},

		run(fn) {
			assertAlive()
			editor.run(() => fn(editor))
		},

		getStatus() {
			const errors: string[] = []
			const notes: string[] = []
			if (disposed) errors.push('bridge disposed')
			if (driverAdapter) {
				notes.push(driverAdapter.note || 'Driver adapter present')
			} else {
				notes.push(
					'Driver adapter not mounted; Editor APIs only. See createOptionalDriverAdapter.'
				)
			}
			return {
				ok: !disposed && errors.length === 0,
				bridgeMounted: !disposed,
				devOnly: true,
				localhostOnly: true,
				shapeCount: disposed ? 0 : editor.getCurrentPageShapes().length,
				selectedIds: disposed
					? []
					: [...editor.getSelectedShapeIds()].map(String),
				camera: disposed ? { x: 0, y: 0, z: 1 } : bridge.getCamera(),
				errors,
				notes,
			}
		},

		getDriverAdapter() {
			return driverAdapter
		},

		dispose() {
			if (disposed) return
			disposed = true
			try {
				driverAdapter?.dispose()
			} catch {
				// ignore cleanup errors
			}
			driverAdapter = null
			const globalName = options.globalName ?? DEFAULT_GLOBAL
			if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>)[globalName] === bridge) {
				delete (window as unknown as Record<string, unknown>)[globalName]
			}
		},
	}

	return bridge
}

/**
 * Mount bridge on window when allowed. Returns the bridge or null.
 */
export function mountHermesDevBridge(
	editor: Editor,
	options: MountHermesDevBridgeOptions = {}
): HermesDevBridge | null {
	const bridge = createHermesDevBridge(editor, options)
	if (!bridge) return null

	const globalName = options.globalName ?? DEFAULT_GLOBAL
	if (typeof window !== 'undefined') {
		const previous = (window as unknown as Record<string, unknown>)[globalName] as
			| HermesDevBridge
			| undefined
		previous?.dispose()
		;(window as unknown as Record<string, unknown>)[globalName] = bridge
	}
	return bridge
}

/**
 * Optional @tldraw/driver adapter. Import Driver dynamically or pass via factory
 * so apps that cannot resolve the package still compile Editor-only bridges.
 *
 * Usage:
 * ```ts
 * import { Driver } from '@tldraw/driver'
 * mountHermesDevBridge(editor, {
 *   driverFactory: (ed) => createOptionalDriverAdapter(ed, Driver),
 * })
 * ```
 */
export function createOptionalDriverAdapter(
	editor: Editor,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	DriverCtor: new (editor: Editor) => { dispose(): void }
): HermesDriverAdapter {
	const driver = new DriverCtor(editor)
	return {
		kind: 'tldraw-driver',
		note: 'Driver adapter constructed via createOptionalDriverAdapter',
		dispose() {
			driver.dispose()
		},
	}
}

/** Helpers re-exported for template consumers writing rich text labels. */
export { createShapeId, toRichText, serializeTldrawJson, parseTldrawJsonFile }
