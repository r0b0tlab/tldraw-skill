/**
 * Harness security helpers for sync-eval.
 *
 * Still NOT production authZ — these controls reduce foot-guns when the local
 * harness is misconfigured (open CORS, unauthenticated uploads, LAN bind with
 * the demo token).
 */

/** Demo token used by local Playwright tests. Never ship as production auth. */
export const DEFAULT_HARNESS_TOKEN = 'harness-ok'

/** Hard cap for asset PUT bodies in this harness (512 KiB). */
export const MAX_UPLOAD_BYTES = 512 * 1024

/** Explicit MIME allowlist for asset uploads (images only; no SVG). */
export const ALLOWED_UPLOAD_MIME_TYPES: ReadonlySet<string> = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
])

export function isLoopbackHost(host: string): boolean {
	const h = host.trim().toLowerCase()
	if (!h) return false
	// Strip IPv6 brackets if present
	const bare = h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h
	if (bare === 'localhost' || bare === '127.0.0.1' || bare === '::1') return true
	// 127.0.0.0/8
	if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare)) return true
	return false
}

export function isDefaultHarnessToken(token: string | undefined | null): boolean {
	if (token == null || token === '') return true
	return token === DEFAULT_HARNESS_TOKEN
}

/**
 * Fail closed when binding off-loopback while still using the demo token.
 * Non-loopback requires an explicit non-default SYNC_AUTH_TOKEN.
 */
export function assertSafeListenConfig(opts: {
	host: string
	token: string | undefined | null
}): void {
	const host = opts.host || '127.0.0.1'
	if (isLoopbackHost(host)) return
	if (isDefaultHarnessToken(opts.token)) {
		throw new Error(
			`Refusing to listen on non-loopback host "${host}" with the default harness token. ` +
				`Set SYNC_AUTH_TOKEN to a non-default secret, or bind SYNC_HOST to 127.0.0.1.`
		)
	}
}

export function getCorsAllowlistFromEnv(raw: string | undefined): string[] {
	if (!raw || !raw.trim()) return []
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
}

/**
 * Resolve a browser-supplied sync endpoint without allowing arbitrary token exfiltration.
 * Loopback HTTP(S) is accepted for the local harness. Remote origins require an
 * exact operator-provided allowlist entry; other values fail back to the configured URL.
 */
export function resolveAllowedSyncHttp(
	candidate: string | undefined | null,
	fallback: string,
	allowlist: readonly string[] = []
): string {
	const cleanFallback = fallback.replace(/\/$/, '')
	if (!candidate) return cleanFallback
	try {
		const url = new URL(candidate)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return cleanFallback
		const allowed = isLoopbackHost(url.hostname) || allowlist.includes(url.origin)
		return allowed ? url.toString().replace(/\/$/, '') : cleanFallback
	} catch {
		return cleanFallback
	}
}

/**
 * Explicit CORS decision — never "reflect any Origin".
 * Missing Origin (curl / same-origin / non-browser) is allowed.
 * Loopback browser origins are allowed by default for local Vite/Playwright.
 * Additional origins come from SYNC_CORS_ORIGINS allowlist only.
 */
export function isAllowedCorsOrigin(
	origin: string | undefined | null,
	allowlist: readonly string[] = []
): boolean {
	if (origin == null || origin === '') return true
	if (allowlist.includes(origin)) return true
	try {
		const u = new URL(origin)
		return isLoopbackHost(u.hostname)
	} catch {
		return false
	}
}

export function isAllowedUploadMime(contentType: string | undefined | null): boolean {
	if (!contentType) return false
	const base = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
	return ALLOWED_UPLOAD_MIME_TYPES.has(base)
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
	return prefix.every((value, index) => bytes[index] === value)
}

/** Detect only the four image formats accepted by this harness from magic bytes. */
export function detectAllowedImageMime(bytes: Uint8Array): string | null {
	if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return 'image/png'
	}
	if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
	if (
		hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
		hasPrefix(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
	) {
		return 'image/gif'
	}
	if (
		hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		bytes.length >= 12 &&
		hasPrefix(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
	) {
		return 'image/webp'
	}
	return null
}

export function uploadMimeMatchesBytes(
	declaredContentType: string | undefined | null,
	bytes: Uint8Array
): boolean {
	if (!declaredContentType) return false
	const declared = declaredContentType.split(';')[0]?.trim().toLowerCase() ?? ''
	return ALLOWED_UPLOAD_MIME_TYPES.has(declared) && detectAllowedImageMime(bytes) === declared
}

/**
 * Token extraction matching /connect query semantics, plus optional Bearer header.
 * Query `token` wins when both are present (parity with WebSocket connect URLs).
 */
export function extractRequestToken(req: {
	query?: unknown
	headers?: { authorization?: string | string[] | undefined; [key: string]: unknown }
}): string | undefined {
	const q = req.query as { token?: unknown } | undefined
	if (typeof q?.token === 'string' && q.token.length > 0) return q.token

	const raw = req.headers?.authorization
	const header = Array.isArray(raw) ? raw[0] : raw
	if (typeof header === 'string') {
		const m = /^Bearer\s+(.+)$/i.exec(header.trim())
		if (m?.[1]) return m[1].trim()
	}
	return undefined
}
