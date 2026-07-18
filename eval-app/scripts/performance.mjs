/**
 * Reproducible large-page baseline against the mounted tldraw 5.2.5 Editor.
 * This records measurements; it does not impose hardware-specific timing claims.
 */
import { chromium } from 'playwright'
import { createServer } from 'vite'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const repoRoot = path.resolve(root, '..')
const outputDir = path.join(repoRoot, 'tests', 'results', 'performance')
const outputPath = path.join(outputDir, 'latest.json')
const shapeTarget = 3999

const server = await createServer({
	root,
	server: { host: '127.0.0.1', port: 5201, strictPort: true },
	logLevel: 'error',
})
let browser

try {
	await server.listen()
	browser = await chromium.launch({ headless: true })
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
	await page.goto(`http://127.0.0.1:5201/?pk=perf-${Date.now()}`, {
		waitUntil: 'networkidle',
		timeout: 120_000,
	})
	await page.waitForFunction(
		() => Boolean(window.__hermesTldrawEvalStatus?.finishedAt && window.__hermesTldrawBridge),
		null,
		{ timeout: 120_000 }
	)

	const browserResult = await page.evaluate(async ({ shapeTarget }) => {
		const bridge = window.__hermesTldrawBridge
		if (!bridge) throw new Error('development bridge unavailable')
		const editor = bridge.editor
		const originalPageId = editor.getCurrentPageId()
		const pageId = `page:performance-${Date.now()}`
		editor.createPage({ id: pageId, name: 'Performance baseline' })
		editor.setCurrentPage(pageId)

		try {
			const partials = Array.from({ length: shapeTarget }, (_, index) => ({
				type: 'geo',
				x: (index % 80) * 24,
				y: Math.floor(index / 80) * 24,
				props: { w: 16, h: 16, geo: 'rectangle', fill: 'solid' },
			}))
			const createStarted = performance.now()
			editor.createShapes(partials)
			const createMs = performance.now() - createStarted
			const ids = [...editor.getCurrentPageShapeIds()]

			const updateStarted = performance.now()
			editor.updateShapes(
				ids.slice(0, 100).map((id, index) => ({
					id,
					type: 'geo',
					x: 20 + index,
					y: 40 + index,
				}))
			)
			const update100Ms = performance.now() - updateStarted

			const framesStarted = performance.now()
			await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
			const twoFramesMs = performance.now() - framesStarted

			return {
				ok: ids.length === shapeTarget,
				shapeTarget,
				shapeCount: ids.length,
				createMs,
				update100Ms,
				twoFramesMs,
				maxShapesPerPage: editor.options.maxShapesPerPage,
				userAgent: navigator.userAgent,
			}
		} finally {
			editor.setCurrentPage(originalPageId)
			editor.deletePage(pageId)
		}
	}, { shapeTarget })

	const report = {
		schemaVersion: 1,
		timestamp: new Date().toISOString(),
		tldrawVersion: '5.2.5',
		note: 'Local headless Chromium baseline; timings are machine-specific and must be re-measured on target hardware.',
		...browserResult,
	}
	await fs.mkdir(outputDir, { recursive: true })
	await fs.writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8')
	console.log(JSON.stringify(report, null, 2))
	if (!report.ok) process.exitCode = 1
} finally {
	if (browser) await browser.close().catch(() => {})
	await server.close().catch(() => {})
}
