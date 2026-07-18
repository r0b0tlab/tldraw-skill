/**
 * Scan source/bundle text for provider secrets that must never ship to the browser.
 */

export type SecretHitKind = 'literal_key_value' | 'provider_env_assignment' | 'sk_token'

export interface SecretHit {
	kind: SecretHitKind
	pattern: string
	sample: string
}

export const PROVIDER_SECRET_PATTERNS: RegExp[] = [
	/\bOPENAI_API_KEY\s*[=:]\s*['"]?sk-[A-Za-z0-9_\-]{8,}/g,
	/\bANTHROPIC_API_KEY\s*[=:]\s*['"]?sk-[A-Za-z0-9_\-]{8,}/g,
	/\bGOOGLE_API_KEY\s*[=:]\s*['"]?[A-Za-z0-9_\-]{16,}/g,
	/\bsk-(?:ant-api\d+-|proj-)?[A-Za-z0-9_\-]{16,}/g,
	/\bAIza[0-9A-Za-z\-_]{20,}/g,
]

export function scanTextForProviderSecrets(text: string): SecretHit[] {
	const hits: SecretHit[] = []
	if (!text) return hits

	const patterns: Array<{ re: RegExp; kind: SecretHitKind; name: string }> = [
		{
			re: /\bOPENAI_API_KEY\s*[=:]\s*['"]?sk-[A-Za-z0-9_\-]{8,}/g,
			kind: 'provider_env_assignment',
			name: 'OPENAI_API_KEY',
		},
		{
			re: /\bANTHROPIC_API_KEY\s*[=:]\s*['"]?sk-[A-Za-z0-9_\-]{8,}/g,
			kind: 'provider_env_assignment',
			name: 'ANTHROPIC_API_KEY',
		},
		{
			re: /\bGOOGLE_API_KEY\s*[=:]\s*['"]?[A-Za-z0-9_\-]{16,}/g,
			kind: 'provider_env_assignment',
			name: 'GOOGLE_API_KEY',
		},
		{
			re: /\bsk-(?:ant-api\d+-|proj-)?[A-Za-z0-9_\-]{16,}/g,
			kind: 'literal_key_value',
			name: 'sk_token',
		},
		{
			re: /\bAIza[0-9A-Za-z\-_]{20,}/g,
			kind: 'literal_key_value',
			name: 'google_api_token',
		},
	]

	for (const { re, kind, name } of patterns) {
		re.lastIndex = 0
		let m: RegExpExecArray | null
		while ((m = re.exec(text)) !== null) {
			hits.push({
				kind,
				pattern: name,
				sample: m[0].slice(0, 24) + '…',
			})
		}
	}
	return hits
}

export function scanFilesForProviderSecrets(
	files: Array<{ path: string; content: string }>
): Array<SecretHit & { path: string }> {
	const out: Array<SecretHit & { path: string }> = []
	for (const f of files) {
		for (const hit of scanTextForProviderSecrets(f.content)) {
			out.push({ ...hit, path: f.path })
		}
	}
	return out
}
