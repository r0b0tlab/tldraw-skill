/**
 * Pure unit tests for hermes-dev-bridge host/dev gates (no browser DOM required).
 * Run: npx tsx scripts/test-bridge-gates.ts
 */
import assert from 'node:assert/strict'
import {
	canMountHermesDevBridge,
	isHermesBridgeAllowedHost,
	isHermesBridgeDevMode,
} from '../src/bridge/hermes-dev-bridge.ts'

// RED→GREEN: these assertions define the safety contract.
assert.equal(isHermesBridgeAllowedHost('localhost'), true)
assert.equal(isHermesBridgeAllowedHost('127.0.0.1'), true)
assert.equal(isHermesBridgeAllowedHost('[::1]'), true)
assert.equal(isHermesBridgeAllowedHost('::1'), true)
assert.equal(isHermesBridgeAllowedHost('evil.example'), false)
assert.equal(isHermesBridgeAllowedHost('tldraw.com'), false)

assert.equal(isHermesBridgeDevMode(true), true)
assert.equal(isHermesBridgeDevMode(false), false)

assert.equal(canMountHermesDevBridge('localhost', true), true)
assert.equal(canMountHermesDevBridge('localhost', false), false)
assert.equal(canMountHermesDevBridge('evil.example', true), false)
assert.equal(canMountHermesDevBridge('127.0.0.1', true), true)

console.log('PASS: bridge gate unit tests')
process.exit(0)
