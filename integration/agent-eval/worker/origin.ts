const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

/** Local evaluation CORS policy. Return the origin only for HTTP(S) loopback. */
export function isAllowedHarnessOrigin(origin: string): string | undefined {
	try {
		const url = new URL(origin)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
		const hostname = url.hostname.startsWith('[') && url.hostname.endsWith(']')
			? url.hostname.slice(1, -1)
			: url.hostname
		return LOOPBACK_HOSTS.has(hostname) ? origin : undefined
	} catch {
		return undefined
	}
}
