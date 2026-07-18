/**
 * Sync collaboration branch — COMPILE-TIME example only.
 *
 * NOT runtime verified in this harness: no self-hosted sync server, no auth credentials.
 * Demonstrates public @tldraw/sync import surface so typecheck catches API drift.
 *
 * Do not label this path as runtime verified.
 */

import type { useSync, useSyncDemo } from '@tldraw/sync'

/** Type-only anchors so package exports stay linked without executing multiplayer. */
export type SyncClientHooks = {
	useSync: typeof useSync
	useSyncDemo: typeof useSyncDemo
}

/**
 * Example config object for a future self-hosted room.
 * Runtime use requires a real WebSocket server and matching client/server schemas.
 */
export const SYNC_COMPILE_EXAMPLE = {
	runtimeVerified: false as const,
	package: '@tldraw/sync',
	guidance: 'https://tldraw.dev/docs/sync',
	notes: [
		'useSyncDemo is for temporary demo rooms only',
		'production requires self-hosted TLSocketRoom + storage + auth',
		'two-client convergence is not exercised in this eval-app run',
	],
}

export function describeSyncBranch(): {
	ok: boolean
	runtime: boolean
	detail: string
} {
	return {
		ok: true,
		runtime: false,
		detail:
			'Compile-time @tldraw/sync surface present; multiplayer NOT runtime verified (no server/credentials).',
	}
}
