import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(root, 'artifacts', 'visual-scenarios')
const scenarios = ['flowchart', 'architecture', 'sequence', 'mind-map', 'annotated-image']
const server = await createServer({
	root,
	server: { host: '127.0.0.1', port: 5203, strictPort: true },
	logLevel: 'error',
})
let browser
const results = []
try {
	await mkdir(outputDir, { recursive: true })
	await server.listen()
	browser = await chromium.launch({ headless: true })
	for (const name of scenarios) {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
		const errors = []
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text())
		})
		page.on('pageerror', (error) => errors.push(error.message))
		await page.goto(`http://127.0.0.1:5203/?visual=${encodeURIComponent(name)}&pk=visual-${name}`, {
			waitUntil: 'domcontentloaded',
			timeout: 60_000,
		})
		await page.waitForFunction(
			(expected) => {
				const status = window.__hermesTldrawEvalStatus
				return Boolean(status?.finishedAt && status?.visualScenario?.name === expected)
			},
			name,
			{ timeout: 120_000 }
		)
		const status = await page.evaluate(() => window.__hermesTldrawEvalStatus)
		const visual = status?.visualScenario
		if (!status?.ok || !visual?.ok || !visual?.allArrowsBound || visual?.overlapPairs?.length) {
			throw new Error(`${name} failed deterministic gates: ${JSON.stringify({ ok: status?.ok, visual, errors })}`)
		}
		await page.getByRole('button', { name: 'Hide' }).click()
		await page.waitForTimeout(350)
		const screenshot = path.join(outputDir, `${name}.png`)
		await page.screenshot({ path: screenshot, fullPage: true })
		results.push({
			name,
			ok: true,
			shapeCount: visual.shapeCount,
			arrowCount: visual.arrowCount,
			bindingCount: visual.bindingCount,
			allArrowsBound: visual.allArrowsBound,
			overlapPairs: visual.overlapPairs,
			consoleErrors: errors,
			screenshot: path.relative(root, screenshot),
		})
		await page.close()
	}
	const report = {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		tldraw: '5.2.5',
		ok: results.length === scenarios.length && results.every((result) => result.ok),
		results,
	}
	await writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
	console.log(JSON.stringify(report, null, 2))
	if (!report.ok) process.exitCode = 1
} finally {
	if (browser) await browser.close().catch(() => {})
	await server.close().catch(() => {})
}
