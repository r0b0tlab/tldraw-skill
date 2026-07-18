/**
 * AI / agent starter-kit branch — COMPILE-TIME notes only.
 *
 * NOT runtime verified: no model provider credentials, no agent kit scaffolded live.
 * Do not label this path as runtime verified.
 */

export const AGENT_COMPILE_EXAMPLE = {
	runtimeVerified: false as const,
	docs: 'https://tldraw.dev/docs/ai',
	starters: [
		'agent',
		'chat',
		'branching-chat',
		'workflow',
		'image-pipeline',
		'multiplayer',
		'shader',
	],
	sanitizationChecklist: [
		'validate shape IDs exist and are unique',
		'clamp numeric/vector fields',
		'strip coordinate-offset injection',
		'bound operations and support cancel',
		'treat canvas/prompt text as untrusted',
	],
	credentialRule: 'API keys stay server-side; never ship in client bundles',
}

export function describeAgentBranch(): {
	ok: boolean
	runtime: boolean
	detail: string
} {
	return {
		ok: true,
		runtime: false,
		detail:
			'Agent/starter-kit guidance compiled as documentation constants; provider execution NOT runtime verified (no credentials).',
	}
}
