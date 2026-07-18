/**
 * Production build smoke: bridge must not activate when DEV is false.
 * Scans dist bundle for the safety gate and ensures mount is DEV-gated in source.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bridgeSrc = fs.readFileSync(path.join(root, 'src/bridge/hermes-dev-bridge.ts'), 'utf8')
const appSrc = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')

assert.match(bridgeSrc, /import\.meta\.env\?\.DEV|import\.meta\.env\.DEV/)
assert.match(bridgeSrc, /localhost/)
assert.match(bridgeSrc, /canMountHermesDevBridge/)
assert.doesNotMatch(bridgeSrc, /\beval\s*\(/)
assert.doesNotMatch(bridgeSrc, /process\.env\.(API|SECRET|TOKEN)/i)

// App only mounts bridge via mountHermesDevBridge (which gates)
assert.match(appSrc, /mountHermesDevBridge/)

const distDir = path.join(root, 'dist')
assert.ok(fs.existsSync(distDir), 'dist/ missing — run npm run build before this check')
const files = fs.readdirSync(path.join(distDir, 'assets')).filter((f) => f.endsWith('.js'))
assert.ok(files.length > 0, 'expected built js assets')
const productionJs = files
	.map((file) => fs.readFileSync(path.join(distDir, 'assets', file), 'utf8'))
	.join('\n')
for (const marker of [
	'__hermesTldrawBridge',
	'mountHermesDevBridge',
	'canMountHermesDevBridge',
	'hermes-tldraw-bridge',
]) {
	assert.ok(!productionJs.includes(marker), `production bundle retained bridge marker: ${marker}`)
}
console.log('dist assets:', files.length)
console.log('PASS: production bridge implementation absent from built assets')
