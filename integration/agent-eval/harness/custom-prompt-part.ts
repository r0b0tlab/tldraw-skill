/**
 * Custom prompt-part representation for agent-eval sessions.
 * Faithful to starter PromptPartDefinition pattern (type + buildContent).
 */

import { sanitizeUntrustedText } from './sanitize'

export interface EvalSessionPart {
	type: 'evalSession'
	sessionId: string
	harnessVersion: string
	providerMode: 'unverified' | 'live'
	notes: string
	generatedAt: string
}

export interface EvalSessionPartDefinitionLike {
	type: 'evalSession'
	priority: number
	buildContent(part: EvalSessionPart): string[]
}

export function buildEvalSessionPart(input: {
	sessionId: string
	harnessVersion: string
	providerMode: 'unverified' | 'live'
	notes?: string
}): EvalSessionPart {
	const notesRaw = input.notes ?? ''
	const notes = sanitizeUntrustedText(notesRaw).replace(/^\[untrusted-canvas-text\]\s*/, '')
	return {
		type: 'evalSession',
		sessionId: String(input.sessionId).slice(0, 128),
		harnessVersion: String(input.harnessVersion).slice(0, 32),
		providerMode: input.providerMode === 'live' ? 'live' : 'unverified',
		notes,
		generatedAt: new Date().toISOString(),
	}
}

export const EvalSessionPartDefinition: EvalSessionPartDefinitionLike = {
	type: 'evalSession',
	priority: -120,
	buildContent(part: EvalSessionPart): string[] {
		return [
			'[evalSession] Evaluation harness metadata (not user intent):',
			JSON.stringify({
				type: part.type,
				sessionId: part.sessionId,
				harnessVersion: part.harnessVersion,
				providerMode: part.providerMode,
				notes: part.notes,
				generatedAt: part.generatedAt,
			}),
			'Provider-backed model execution is labeled unverified unless credentials and a live call are confirmed.',
		]
	},
}
