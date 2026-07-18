/**
 * Dev-only room token gate for the sync-eval harness.
 *
 * NOT production auth:
 * - single shared bearer token (env SYNC_AUTH_TOKEN)
 * - no user identity binding, no expiry, no mTLS
 * - CORS is explicit/configurable (see shared/security.ts), not open reflection
 *
 * Production systems should authenticate the WebSocket upgrade (session cookie /
 * short-lived room JWT), authorize per-room ACLs, and terminate TLS at the edge.
 */
import { DEFAULT_HARNESS_TOKEN } from './security'

export function getExpectedToken(): string {
	return process.env.SYNC_AUTH_TOKEN || DEFAULT_HARNESS_TOKEN
}

export function isAuthorizedToken(token: unknown): token is string {
	if (typeof token !== 'string' || token.length === 0) return false
	// Constant-time-ish compare for the harness secret
	const expected = getExpectedToken()
	if (token.length !== expected.length) return false
	let mismatch = 0
	for (let i = 0; i < token.length; i++) {
		mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i)
	}
	return mismatch === 0
}

export function unauthorizedReason(token: unknown): string {
	if (token == null || token === '') return 'missing_token'
	if (typeof token !== 'string') return 'invalid_token_type'
	return 'invalid_token'
}
