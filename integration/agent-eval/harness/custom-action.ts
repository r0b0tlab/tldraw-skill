/**
 * Custom highlight-eval action schema (zod-free pure parser + schema object).
 * Wired into the full starter via shared/schema + client action util.
 */

export type HighlightEvalColor = 'red' | 'yellow' | 'blue' | 'green'

export interface HighlightEvalAction {
	_type: 'highlight-eval'
	shapeId: string
	intent: string
	color: HighlightEvalColor
}

const COLORS = new Set<HighlightEvalColor>(['red', 'yellow', 'blue', 'green'])

export const HighlightEvalActionSchema = {
	type: 'highlight-eval' as const,
	title: 'Highlight Eval',
	description:
		'The agent marks an existing shape for evaluation review with a highlight color. Does not delete or create shapes.',
	meta: {
		title: 'Highlight Eval',
		description:
			'The agent marks an existing shape for evaluation review with a highlight color.',
	},
	parse(input: unknown): { ok: true; data: HighlightEvalAction } | { ok: false; error: string } {
		return parseHighlightEvalAction(input)
	},
}

export function parseHighlightEvalAction(
	input: unknown
): { ok: true; data: HighlightEvalAction } | { ok: false; error: string } {
	if (!input || typeof input !== 'object') {
		return { ok: false, error: 'not_object' }
	}
	const o = input as Record<string, unknown>
	if (o._type !== 'highlight-eval') {
		return { ok: false, error: 'wrong_type' }
	}
	if (typeof o.shapeId !== 'string' || o.shapeId.trim().length === 0) {
		return { ok: false, error: 'invalid_shapeId' }
	}
	if (typeof o.color !== 'string' || !COLORS.has(o.color as HighlightEvalColor)) {
		return { ok: false, error: 'invalid_color' }
	}
	const intent = typeof o.intent === 'string' ? o.intent : ''
	return {
		ok: true,
		data: {
			_type: 'highlight-eval',
			shapeId: o.shapeId.trim(),
			intent,
			color: o.color as HighlightEvalColor,
		},
	}
}
