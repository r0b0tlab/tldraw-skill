/**
 * persistenceKey reload/cross-tab marker using a fixed custom shape id.
 */

import { createShapeId, type Editor } from 'tldraw'
import { EVAL_BADGE_TYPE } from '../custom/EvalBadgeShapeUtil'

export const PERSIST_MARKER_ID = createShapeId('eval-persist-marker')
export const DEFAULT_PERSISTENCE_KEY = 'tldraw-skill-eval-verify'

export interface PersistenceMarkerResult {
	ok: boolean
	persistenceKey: string
	wroteMarker: boolean
	foundExistingMarker: boolean
	markerLabel: string
	detail: string
}

function readPersistenceKeyFromLocation(): string {
	if (typeof window === 'undefined') return DEFAULT_PERSISTENCE_KEY
	try {
		const params = new URLSearchParams(window.location.search)
		const fromQuery = params.get('pk')?.trim()
		if (fromQuery) return fromQuery
	} catch {
		/* ignore */
	}
	return DEFAULT_PERSISTENCE_KEY
}

export function getEvalPersistenceKey(): string {
	return readPersistenceKeyFromLocation()
}

/**
 * Ensure a durable marker shape exists. If it already exists (reload / other tab
 * seed), report foundExistingMarker so the harness can prove persistenceKey restore.
 */
export function ensurePersistenceMarker(
	editor: Editor,
	opts?: { token?: string }
): PersistenceMarkerResult {
	const persistenceKey = getEvalPersistenceKey()
	const existing = editor.getShape(PERSIST_MARKER_ID)

	if (existing && existing.type === EVAL_BADGE_TYPE) {
		const label =
			'props' in existing &&
			existing.props &&
			typeof (existing.props as { label?: unknown }).label === 'string'
				? (existing.props as { label: string }).label
				: 'unknown'
		return {
			ok: true,
			persistenceKey,
			wroteMarker: false,
			foundExistingMarker: true,
			markerLabel: label,
			detail: `restored marker label=${label} key=${persistenceKey}`,
		}
	}

	const token =
		opts?.token ??
		(typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID().slice(0, 8)
			: `t${Date.now().toString(36)}`)
	const label = `PERSISTED ${token.slice(0, 6)}`

	editor.createShape({
		id: PERSIST_MARKER_ID,
		type: EVAL_BADGE_TYPE,
		x: 500,
		y: 20,
		props: {
			w: 180,
			h: 36,
			label,
		},
	})

	const created = editor.getShape(PERSIST_MARKER_ID)
	return {
		ok: Boolean(created),
		persistenceKey,
		wroteMarker: Boolean(created),
		foundExistingMarker: false,
		markerLabel: label,
		detail: created
			? `wrote marker label=${label} key=${persistenceKey}`
			: `failed to write marker key=${persistenceKey}`,
	}
}

export function readPersistenceMarkerLabel(editor: Editor): string | null {
	const shape = editor.getShape(PERSIST_MARKER_ID)
	if (!shape || shape.type !== EVAL_BADGE_TYPE) return null
	const label = (shape.props as { label?: unknown }).label
	return typeof label === 'string' ? label : null
}
