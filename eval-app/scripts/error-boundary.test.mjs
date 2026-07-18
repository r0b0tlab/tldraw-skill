import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const server = await createServer({
	root,
	server: { host: '127.0.0.1', port: 5202, strictPort: true },
	logLevel: 'error',
})
let browser
try {
	await server.listen()
	browser = await chromium.launch({ headless: true })
	const page = await browser.newPage()
	await page.goto('http://127.0.0.1:5202/?forceError=1&pk=error-boundary', {
		waitUntil: 'domcontentloaded',
		timeout: 60_000,
	})
	const fallback = page.locator('[data-testid="eval-error-fallback"]')
	await fallback.waitFor({ state: 'visible', timeout: 15_000 })
	const text = (await fallback.textContent()) || ''
	if (!text.includes('Canvas recovery boundary')) {
		throw new Error(`unexpected fallback text: ${text}`)
	}
	const report = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		ok: true,
		fallbackRendered: true,
		text,
	}
	const artifacts = path.join(root, 'artifacts')
	await mkdir(artifacts, { recursive: true })
	await writeFile(path.join(artifacts, 'error-boundary.json'), `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify(report))
} finally {
	if (browser) await browser.close().catch(() => {})
	await server.close().catch(() => {})
}
