import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { scanTextForProviderSecrets, PROVIDER_SECRET_PATTERNS } from '../secrets-scan'

describe('provider secret bundle scan', () => {
	it('defines patterns for common provider env keys', () => {
		assert.ok(PROVIDER_SECRET_PATTERNS.some((p) => p.source.includes('OPENAI_API_KEY')))
		assert.ok(PROVIDER_SECRET_PATTERNS.some((p) => p.source.includes('ANTHROPIC_API_KEY')))
		assert.ok(PROVIDER_SECRET_PATTERNS.some((p) => p.source.includes('GOOGLE_API_KEY')))
	})

	it('flags literal API key assignments in client-like text', () => {
		const dirty = 'const k = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV"; ANTHROPIC_API_KEY=sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV'
		const hits = scanTextForProviderSecrets(dirty)
		assert.ok(hits.length > 0)
	})

	it('allows env.KEY references without literal secret values (server pattern)', () => {
		const clean = 'createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })'
		const hits = scanTextForProviderSecrets(clean)
		// Reference to env var name alone is OK; no sk- literal
		assert.equal(
			hits.filter((h) => h.kind === 'literal_key_value').length,
			0
		)
	})
})
