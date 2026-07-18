/**
 * Focused sanitization extract faithful to tldraw agent-template AgentHelpers
 * and action util sanitizeAction patterns.
 *
 * Pure functions — unit-testable without Editor / provider credentials.
 */

export const MAX_OPS_PER_BATCH = 64
export const MAX_COORD = 1_000_000
export const MAX_SIZE = 50_000
export const MIN_SIZE = 1
export const MAX_UNTRUSTED_TEXT = 4_000

export interface Vec2 {
	x: number
	y: number
}

export interface ShapeIdResolver {
	exists(id: string): boolean
	resolveMapped(id: string): string | null
	allocateUnique(id: string): string
}

export type RejectReason =
	| 'nonexistent_id'
	| 'duplicate_id_collision'
	| 'non_finite_numeric'
	| 'out_of_bounds'
	| 'excessive_operation_count'
	| 'not_allowlisted'
	| 'invalid_shape'
	| 'untrusted_text_blocked'

export interface SanitizeBatchOptions {
	resolver: ShapeIdResolver
	offset: Vec2
	allowedTypes: ReadonlySet<string>
}

export interface RejectedAction {
	action: unknown
	reason: RejectReason
	detail?: string
}

export interface SanitizeBatchResult {
	ok: boolean
	reason?: RejectReason
	accepted: unknown[]
	rejected: RejectedAction[]
}

export function ensureShapeIdExists(id: string, resolver: ShapeIdResolver): string | null {
	if (!id || typeof id !== 'string') return null
	const mapped = resolver.resolveMapped(id)
	if (mapped) return mapped
	if (resolver.exists(id)) return id
	return null
}

export function ensureShapeIdIsUnique(id: string, resolver: ShapeIdResolver): string {
	const base = id && typeof id === 'string' ? id : 'shape'
	return resolver.allocateUnique(base)
}

export function rejectNonFinite(value: unknown): number | null {
	if (typeof value !== 'number') return null
	if (!Number.isFinite(value)) return null
	return value
}

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n))
}

export function clampNumericFields<T extends Record<string, unknown>>(fields: T): T {
	const out = { ...fields } as Record<string, unknown>
	for (const key of ['x', 'y', 'x1', 'y1', 'x2', 'y2'] as const) {
		if (key in out && typeof out[key] === 'number') {
			const v = rejectNonFinite(out[key])
			if (v === null) continue
			out[key] = clamp(v, -MAX_COORD, MAX_COORD)
		}
	}
	for (const key of ['w', 'h'] as const) {
		if (key in out && typeof out[key] === 'number') {
			const v = rejectNonFinite(out[key])
			if (v === null) continue
			// sizes must be positive and bounded
			out[key] = clamp(Math.abs(v) || MIN_SIZE, MIN_SIZE, MAX_SIZE)
		}
	}
	return out as T
}

export function removeCoordinateOffset<T extends Record<string, unknown>>(
	shape: T,
	offset: Vec2
): T {
	const out = { ...shape } as Record<string, unknown>
	for (const key of ['x', 'x1', 'x2'] as const) {
		if (typeof out[key] === 'number') out[key] = (out[key] as number) - offset.x
	}
	for (const key of ['y', 'y1', 'y2'] as const) {
		if (typeof out[key] === 'number') out[key] = (out[key] as number) - offset.y
	}
	return out as T
}

const INJECTION_PATTERNS: RegExp[] = [
	/ignore\s+previous\s+instructions/gi,
	/ignore\s+all\s+prior\s+instructions/gi,
	/\bSYSTEM\s*:/gi,
	/\bDEVELOPER\s*:/gi,
	/\bANTHROPIC_API_KEY\b/gi,
	/\bOPENAI_API_KEY\b/gi,
	/\bGOOGLE_API_KEY\b/gi,
	/\bsk-[a-zA-Z0-9_-]{10,}/g,
]

export function sanitizeUntrustedText(raw: unknown): string {
	let text = typeof raw === 'string' ? raw : String(raw ?? '')
	text = text.replace(/\u0000/g, '')
	for (const re of INJECTION_PATTERNS) {
		text = text.replace(re, '[redacted]')
	}
	// Strip fenced code blocks that often smuggle secrets
	text = text.replace(/```[\s\S]*?```/g, '[code-block-redacted]')
	if (text.length > MAX_UNTRUSTED_TEXT) {
		text = text.slice(0, MAX_UNTRUSTED_TEXT) + '…[truncated]'
	}
	return `[untrusted-canvas-text] ${text}`
}

function shapeHasNonFinite(shape: Record<string, unknown>): boolean {
	for (const key of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'w', 'h', 'bend'] as const) {
		if (key in shape && shape[key] !== undefined && shape[key] !== null) {
			if (rejectNonFinite(shape[key]) === null) return true
		}
	}
	return false
}

function sanitizeCreate(
	action: Record<string, unknown>,
	opts: SanitizeBatchOptions
): { ok: true; action: unknown } | { ok: false; reason: RejectReason; detail?: string } {
	const shape = action.shape
	if (!shape || typeof shape !== 'object') {
		return { ok: false, reason: 'invalid_shape' }
	}
	const s = { ...(shape as Record<string, unknown>) }
	if (shapeHasNonFinite(s)) {
		return { ok: false, reason: 'non_finite_numeric' }
	}
	const shapeId = typeof s.shapeId === 'string' ? s.shapeId : 'shape'
	s.shapeId = ensureShapeIdIsUnique(shapeId, opts.resolver)
	let next = removeCoordinateOffset(s, opts.offset)
	next = clampNumericFields(next)
	if (typeof next.note === 'string') {
		next.note = sanitizeUntrustedText(next.note).replace(/^\[untrusted-canvas-text\]\s*/, '')
	}
	return { ok: true, action: { ...action, shape: next } }
}

function sanitizeDelete(
	action: Record<string, unknown>,
	opts: SanitizeBatchOptions
): { ok: true; action: unknown } | { ok: false; reason: RejectReason } {
	const id = ensureShapeIdExists(String(action.shapeId ?? ''), opts.resolver)
	if (!id) return { ok: false, reason: 'nonexistent_id' }
	return { ok: true, action: { ...action, shapeId: id } }
}

function sanitizeLabel(
	action: Record<string, unknown>,
	opts: SanitizeBatchOptions
): { ok: true; action: unknown } | { ok: false; reason: RejectReason } {
	const id = ensureShapeIdExists(String(action.shapeId ?? ''), opts.resolver)
	if (!id) return { ok: false, reason: 'nonexistent_id' }
	const text = sanitizeUntrustedText(action.text)
	return { ok: true, action: { ...action, shapeId: id, text } }
}

function sanitizeHighlightEval(
	action: Record<string, unknown>,
	opts: SanitizeBatchOptions
): { ok: true; action: unknown } | { ok: false; reason: RejectReason } {
	const id = ensureShapeIdExists(String(action.shapeId ?? ''), opts.resolver)
	if (!id) return { ok: false, reason: 'nonexistent_id' }
	const intent =
		typeof action.intent === 'string'
			? sanitizeUntrustedText(action.intent).replace(/^\[untrusted-canvas-text\]\s*/, '')
			: ''
	return { ok: true, action: { ...action, shapeId: id, intent } }
}

export function sanitizeActionBatch(
	actions: unknown[],
	opts: SanitizeBatchOptions
): SanitizeBatchResult {
	const rejected: RejectedAction[] = []
	const accepted: unknown[] = []

	if (!Array.isArray(actions)) {
		return { ok: false, reason: 'invalid_shape', accepted: [], rejected: [] }
	}

	if (actions.length > MAX_OPS_PER_BATCH) {
		// Accept only the first MAX_OPS; mark overall failure
		const head = actions.slice(0, MAX_OPS_PER_BATCH)
		const nested = sanitizeActionBatch(head, opts)
		return {
			ok: false,
			reason: 'excessive_operation_count',
			accepted: nested.accepted,
			rejected: [
				...nested.rejected,
				...actions.slice(MAX_OPS_PER_BATCH).map((action) => ({
					action,
					reason: 'excessive_operation_count' as const,
				})),
			],
		}
	}

	for (const raw of actions) {
		if (!raw || typeof raw !== 'object') {
			rejected.push({ action: raw, reason: 'invalid_shape' })
			continue
		}
		const action = raw as Record<string, unknown>
		const type = String(action._type ?? '')
		if (!opts.allowedTypes.has(type)) {
			rejected.push({ action, reason: 'not_allowlisted' })
			continue
		}

		let result:
			| { ok: true; action: unknown }
			| { ok: false; reason: RejectReason; detail?: string }

		switch (type) {
			case 'create':
				result = sanitizeCreate(action, opts)
				break
			case 'delete':
				result = sanitizeDelete(action, opts)
				break
			case 'label':
				result = sanitizeLabel(action, opts)
				break
			case 'highlight-eval':
				result = sanitizeHighlightEval(action, opts)
				break
			case 'message':
			case 'think':
				result = {
					ok: true,
					action: {
						...action,
						...(typeof action.text === 'string'
							? { text: sanitizeUntrustedText(action.text) }
							: {}),
						...(typeof action.intent === 'string'
							? {
									intent: sanitizeUntrustedText(action.intent).replace(
										/^\[untrusted-canvas-text\]\s*/,
										''
									),
								}
							: {}),
					},
				}
				break
			default:
				// Other allowlisted types: pass through with ID existence check if shapeId present
				if ('shapeId' in action) {
					const id = ensureShapeIdExists(String(action.shapeId), opts.resolver)
					if (!id) {
						result = { ok: false, reason: 'nonexistent_id' }
						break
					}
					result = { ok: true, action: { ...action, shapeId: id } }
				} else if ('shapeIds' in action && Array.isArray(action.shapeIds)) {
					const ids = (action.shapeIds as unknown[])
						.map((id) => ensureShapeIdExists(String(id), opts.resolver))
						.filter((id): id is string => id !== null)
					if (ids.length === 0) {
						result = { ok: false, reason: 'nonexistent_id' }
						break
					}
					result = { ok: true, action: { ...action, shapeIds: ids } }
				} else {
					result = { ok: true, action }
				}
		}

		if (result.ok) accepted.push(result.action)
		else rejected.push({ action, reason: result.reason, detail: result.detail })
	}

	return { ok: rejected.length === 0, accepted, rejected }
}
