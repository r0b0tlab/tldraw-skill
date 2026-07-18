/**
 * Unit tests for sync-eval harness security helpers (TDD).
 * Run: npx tsx tests/security.unit.test.ts
 */
import assert from 'node:assert/strict'
import {
	DEFAULT_HARNESS_TOKEN,
	MAX_UPLOAD_BYTES,
	ALLOWED_UPLOAD_MIME_TYPES,
	isLoopbackHost,
	isDefaultHarnessToken,
	assertSafeListenConfig,
	isAllowedCorsOrigin,
	getCorsAllowlistFromEnv,
	isAllowedUploadMime,
	extractRequestToken,
	resolveAllowedSyncHttp,
	detectAllowedImageMime,
	uploadMimeMatchesBytes,
} from '../shared/security'
import { sanitizeRoomId } from '../src/server/rooms'

let failed = 0
function test(name: string, fn: () => void) {
	try {
		fn()
		console.log('PASS', name)
	} catch (e) {
		failed++
		console.error('FAIL', name, e)
	}
}

test('DEFAULT_HARNESS_TOKEN is the known demo value', () => {
	assert.equal(DEFAULT_HARNESS_TOKEN, 'harness-ok')
})

test('isLoopbackHost accepts 127.0.0.1, ::1, localhost', () => {
	assert.equal(isLoopbackHost('127.0.0.1'), true)
	assert.equal(isLoopbackHost('::1'), true)
	assert.equal(isLoopbackHost('localhost'), true)
	assert.equal(isLoopbackHost('LOCALHOST'), true)
})

test('isLoopbackHost rejects non-loopback binds', () => {
	assert.equal(isLoopbackHost('0.0.0.0'), false)
	assert.equal(isLoopbackHost('::'), false)
	assert.equal(isLoopbackHost('192.168.1.10'), false)
	assert.equal(isLoopbackHost('10.0.0.5'), false)
	assert.equal(isLoopbackHost('example.com'), false)
})

test('isDefaultHarnessToken detects unset and default demo token', () => {
	assert.equal(isDefaultHarnessToken(undefined), true)
	assert.equal(isDefaultHarnessToken(''), true)
	assert.equal(isDefaultHarnessToken(DEFAULT_HARNESS_TOKEN), true)
	assert.equal(isDefaultHarnessToken('custom-secret-token'), false)
})

test('assertSafeListenConfig allows loopback with default token', () => {
	assert.doesNotThrow(() =>
		assertSafeListenConfig({ host: '127.0.0.1', token: DEFAULT_HARNESS_TOKEN })
	)
	assert.doesNotThrow(() => assertSafeListenConfig({ host: 'localhost', token: undefined }))
})

test('assertSafeListenConfig rejects non-loopback + default token', () => {
	assert.throws(
		() => assertSafeListenConfig({ host: '0.0.0.0', token: DEFAULT_HARNESS_TOKEN }),
		/non-loopback|default token|SYNC_AUTH_TOKEN/i
	)
	assert.throws(
		() => assertSafeListenConfig({ host: '0.0.0.0', token: undefined }),
		/non-loopback|default token|SYNC_AUTH_TOKEN/i
	)
})

test('assertSafeListenConfig allows non-loopback only with non-default token', () => {
	assert.doesNotThrow(() =>
		assertSafeListenConfig({ host: '0.0.0.0', token: 'custom-not-default-token' })
	)
})

test('isAllowedCorsOrigin allows missing origin (non-browser)', () => {
	assert.equal(isAllowedCorsOrigin(undefined, []), true)
	assert.equal(isAllowedCorsOrigin('', []), true)
})

test('isAllowedCorsOrigin allows loopback browser origins by default', () => {
	assert.equal(isAllowedCorsOrigin('http://127.0.0.1:5757', []), true)
	assert.equal(isAllowedCorsOrigin('http://localhost:5173', []), true)
})

test('isAllowedCorsOrigin rejects arbitrary remote origins by default', () => {
	assert.equal(isAllowedCorsOrigin('https://evil.example', []), false)
	assert.equal(isAllowedCorsOrigin('http://192.168.1.50:3000', []), false)
})

test('isAllowedCorsOrigin honors explicit allowlist', () => {
	assert.equal(
		isAllowedCorsOrigin('https://app.example', ['https://app.example']),
		true
	)
	assert.equal(
		isAllowedCorsOrigin('https://other.example', ['https://app.example']),
		false
	)
})

test('getCorsAllowlistFromEnv parses comma-separated SYNC_CORS_ORIGINS', () => {
	assert.deepEqual(getCorsAllowlistFromEnv(undefined), [])
	assert.deepEqual(getCorsAllowlistFromEnv(''), [])
	assert.deepEqual(getCorsAllowlistFromEnv('https://a.example, https://b.example'), [
		'https://a.example',
		'https://b.example',
	])
})

test('resolveAllowedSyncHttp accepts loopback and strips trailing slash', () => {
	assert.equal(
		resolveAllowedSyncHttp('http://localhost:5858/', 'http://127.0.0.1:5858'),
		'http://localhost:5858'
	)
})

test('resolveAllowedSyncHttp rejects remote and non-http query overrides', () => {
	const fallback = 'http://127.0.0.1:5858'
	assert.equal(resolveAllowedSyncHttp('https://attacker.example', fallback), fallback)
	assert.equal(resolveAllowedSyncHttp('javascript:alert(1)', fallback), fallback)
})

test('resolveAllowedSyncHttp honors explicit remote origin allowlist', () => {
	assert.equal(
		resolveAllowedSyncHttp(
			'https://sync.example/ignored-path',
			'http://127.0.0.1:5858',
			['https://sync.example']
		),
		'https://sync.example/ignored-path'
	)
})

test('isAllowedUploadMime allowlists common image types only', () => {
	assert.equal(isAllowedUploadMime('image/png'), true)
	assert.equal(isAllowedUploadMime('image/jpeg'), true)
	assert.equal(isAllowedUploadMime('image/gif'), true)
	assert.equal(isAllowedUploadMime('image/webp'), true)
	assert.equal(isAllowedUploadMime('image/png; charset=binary'), true)
	assert.equal(isAllowedUploadMime('application/octet-stream'), false)
	assert.equal(isAllowedUploadMime('text/html'), false)
	assert.equal(isAllowedUploadMime('image/svg+xml'), false)
	assert.equal(isAllowedUploadMime(undefined), false)
	assert.equal(isAllowedUploadMime(''), false)
})

test('upload MIME detection validates magic bytes rather than trusting headers', () => {
	const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
	const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])
	const gif = new TextEncoder().encode('GIF89a')
	const webp = new TextEncoder().encode('RIFF0000WEBP')
	assert.equal(detectAllowedImageMime(png), 'image/png')
	assert.equal(detectAllowedImageMime(jpeg), 'image/jpeg')
	assert.equal(detectAllowedImageMime(gif), 'image/gif')
	assert.equal(detectAllowedImageMime(webp), 'image/webp')
	assert.equal(detectAllowedImageMime(new TextEncoder().encode('<svg>')), null)
	assert.equal(uploadMimeMatchesBytes('image/png', png), true)
	assert.equal(uploadMimeMatchesBytes('image/jpeg', png), false)
})

test('sanitizeRoomId is path-safe and collision-resistant', () => {
	const slash = sanitizeRoomId('a/b')
	const underscore = sanitizeRoomId('a_b')
	assert.notEqual(slash, underscore)
	assert.match(slash, /^[A-Za-z0-9_-]+$/)
	assert.match(underscore, /^[A-Za-z0-9_-]+$/)
})

test('MAX_UPLOAD_BYTES is a small explicit harness limit', () => {
	assert.ok(MAX_UPLOAD_BYTES > 0)
	assert.ok(MAX_UPLOAD_BYTES <= 1024 * 1024, 'harness limit must stay <= 1 MiB')
	assert.ok(ALLOWED_UPLOAD_MIME_TYPES.has('image/png'))
})

test('extractRequestToken reads query token and Authorization Bearer', () => {
	assert.equal(
		extractRequestToken({ query: { token: 'abc' }, headers: {} }),
		'abc'
	)
	assert.equal(
		extractRequestToken({
			query: {},
			headers: { authorization: 'Bearer secret-xyz' },
		}),
		'secret-xyz'
	)
	assert.equal(
		extractRequestToken({
			query: { token: 'from-query' },
			headers: { authorization: 'Bearer from-header' },
		}),
		'from-query',
		'query token takes precedence for harness parity with /connect'
	)
	assert.equal(extractRequestToken({ query: {}, headers: {} }), undefined)
})

if (failed) {
	console.error(`\n${failed} unit test(s) failed`)
	process.exit(1)
}
console.log('\nAll security unit tests passed')
