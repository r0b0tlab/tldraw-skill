import assert from 'node:assert/strict'
import test from 'node:test'
import { cors } from 'itty-router'
import { isAllowedHarnessOrigin } from '../../worker/origin'

test('agent worker CORS allows loopback browser origins', () => {
	assert.equal(isAllowedHarnessOrigin('http://localhost:5173'), 'http://localhost:5173')
	assert.equal(isAllowedHarnessOrigin('http://127.0.0.1:5173'), 'http://127.0.0.1:5173')
	assert.equal(isAllowedHarnessOrigin('http://[::1]:5173'), 'http://[::1]:5173')
})

test('agent worker CORS rejects arbitrary and malformed origins', () => {
	assert.equal(isAllowedHarnessOrigin('https://attacker.example'), undefined)
	assert.equal(isAllowedHarnessOrigin('null'), undefined)
	assert.equal(isAllowedHarnessOrigin('javascript:alert(1)'), undefined)
})

test('agent stream responses echo only allowed origins and never wildcard', () => {
	const { corsify } = cors({ origin: isAllowedHarnessOrigin })
	const streamResponse = () =>
		new Response('data: ok\n\n', { headers: { 'Content-Type': 'text/event-stream' } })

	const allowed = corsify(
		streamResponse(),
		new Request('http://127.0.0.1:8787/stream', {
			headers: { Origin: 'http://localhost:5173' },
		})
	)
	assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173')

	const rejected = corsify(
		streamResponse(),
		new Request('http://127.0.0.1:8787/stream', {
			headers: { Origin: 'https://attacker.example' },
		})
	)
	assert.equal(rejected.headers.get('Access-Control-Allow-Origin'), null)
	assert.notEqual(allowed.headers.get('Access-Control-Allow-Origin'), '*')
})
