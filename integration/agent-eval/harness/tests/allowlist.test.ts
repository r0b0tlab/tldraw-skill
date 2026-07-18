import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	DEFAULT_SERVER_ACTION_ALLOWLIST,
	filterActionsByAllowlist,
	isActionTypeAllowed,
} from '../allowlist'

describe('server-side action allowlist', () => {
	it('exposes an explicit non-empty allowlist', () => {
		assert.ok(DEFAULT_SERVER_ACTION_ALLOWLIST.size > 0)
		assert.ok(DEFAULT_SERVER_ACTION_ALLOWLIST.has('create'))
		assert.ok(DEFAULT_SERVER_ACTION_ALLOWLIST.has('delete'))
		assert.ok(DEFAULT_SERVER_ACTION_ALLOWLIST.has('message'))
		// Custom eval action
		assert.ok(DEFAULT_SERVER_ACTION_ALLOWLIST.has('highlight-eval'))
	})

	it('rejects action types outside the allowlist', () => {
		assert.equal(isActionTypeAllowed('create'), true)
		assert.equal(isActionTypeAllowed('rm -rf'), false)
		assert.equal(isActionTypeAllowed('exec'), false)
		assert.equal(isActionTypeAllowed('__proto__'), false)
		assert.equal(isActionTypeAllowed('countryInfo'), false) // intentionally not allowlisted in eval
	})

	it('filters batches to allowed types only', () => {
		const { accepted, rejected } = filterActionsByAllowlist([
			{ _type: 'create' },
			{ _type: 'exec-shell' },
			{ _type: 'message' },
			{ _type: 'highlight-eval' },
		])
		assert.deepEqual(
			accepted.map((a) => a._type),
			['create', 'message', 'highlight-eval']
		)
		assert.equal(rejected.length, 1)
		assert.equal(rejected[0].action._type, 'exec-shell')
		assert.equal(rejected[0].reason, 'not_allowlisted')
	})
})
