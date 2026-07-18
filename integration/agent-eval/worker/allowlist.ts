/**
 * Server-side allowlist gate used by the worker stream path.
 * Re-exports harness allowlist so worker and unit tests share one source of truth.
 */
export {
	DEFAULT_SERVER_ACTION_ALLOWLIST,
	filterActionsByAllowlist,
	isActionTypeAllowed,
	listAllowlistedActions,
} from '../harness/allowlist'
