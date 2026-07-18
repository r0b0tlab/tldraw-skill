/**
 * Explicit server-side action/tool allowlist for the agent-eval harness.
 * Independent of model prompts — untrusted canvas text must not expand this set.
 */

/** Least-privilege allowlist used by the eval worker path. */
export const DEFAULT_SERVER_ACTION_ALLOWLIST: ReadonlySet<string> = new Set([
	// Communication / planning
	'message',
	'think',
	// Core shape ops
	'create',
	'delete',
	'update',
	'label',
	'move',
	// View
	'setMyView',
	// Custom eval action
	'highlight-eval',
	// Internal catch-all (never executes side effects beyond logging)
	'unknown',
])

export function isActionTypeAllowed(
	type: string,
	allowlist: ReadonlySet<string> = DEFAULT_SERVER_ACTION_ALLOWLIST
): boolean {
	if (!type || typeof type !== 'string') return false
	if (type.includes(' ') || type.includes('/') || type.includes('\\')) return false
	return allowlist.has(type)
}

export interface AllowlistFilterResult {
	accepted: Array<{ _type: string; [k: string]: unknown }>
	rejected: Array<{ action: { _type: string; [k: string]: unknown }; reason: 'not_allowlisted' }>
}

export function filterActionsByAllowlist(
	actions: Array<{ _type: string; [k: string]: unknown }>,
	allowlist: ReadonlySet<string> = DEFAULT_SERVER_ACTION_ALLOWLIST
): AllowlistFilterResult {
	const accepted: AllowlistFilterResult['accepted'] = []
	const rejected: AllowlistFilterResult['rejected'] = []
	for (const action of actions) {
		if (isActionTypeAllowed(action._type, allowlist)) {
			accepted.push(action)
		} else {
			rejected.push({ action, reason: 'not_allowlisted' })
		}
	}
	return { accepted, rejected }
}

/** Serialize allowlist for worker responses / evidence. */
export function listAllowlistedActions(
	allowlist: ReadonlySet<string> = DEFAULT_SERVER_ACTION_ALLOWLIST
): string[] {
	return [...allowlist].sort()
}
