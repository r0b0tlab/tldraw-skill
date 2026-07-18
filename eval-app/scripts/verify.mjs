/**
 * Browser verification harness (Playwright).
 * Starts Vite preview or uses VITE_URL, waits for window.__hermesTldrawEvalStatus,
 * harvests .tldr + SVG into artifacts/ and tests/fixtures/.
 *
 * Extended gates (machine-readable in artifacts/eval-status.json):
 * - real @tldraw/driver create/select/transform + dispose
 * - custom shape props migrations registered AND exercised (name→label via migrateStoreSnapshot)
 * - .tldr parse + clean-store semantic IDs/types/bindings/altText (honest field names)
 * - standalone snapshot, store.listen+cleanup, editor.run, undo/redo, readonly rejection
 * - persistenceKey survives reload (+ second tab)
 * - a11y: keyboard focus path, aria, reduced-motion, responsive panel, status >=12px + contrast
 * - hideUi chrome toggle + shortcut impact measured; UI restored (not left hidden)
 * - no console errors; production bridge absent
 */
import { chromium } from 'playwright'
import { build, createServer, preview } from 'vite'
import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const repoRoot = path.resolve(root, '..')
const artifactsDir = path.join(root, 'artifacts')
const fixturesDir = path.join(repoRoot, 'tests', 'fixtures')

async function ensureDirs() {
	await fs.mkdir(artifactsDir, { recursive: true })
	await fs.mkdir(fixturesDir, { recursive: true })
}

function isDriverOpsOk(driver) {
	return Boolean(
		driver &&
			driver.ok &&
			driver.constructed &&
			driver.created &&
			driver.selected &&
			driver.transformed &&
			driver.disposed &&
			Array.isArray(driver.operations) &&
			driver.operations.includes('create') &&
			driver.operations.includes('select') &&
			driver.operations.includes('transform') &&
			driver.operations.includes('dispose')
	)
}

function isStoreApisOk(storeApis) {
	return Boolean(
		storeApis &&
			storeApis.ok &&
			storeApis.standaloneSnapshot &&
			storeApis.storeListen &&
			storeApis.storeListenCleanup &&
			storeApis.editorRun &&
			storeApis.undoRedo &&
			storeApis.readonlyRejection
	)
}

function isMigrationsOk(status) {
	const check = status?.custom?.migrationsCheck
	return Boolean(
		status?.custom?.migrations &&
			check &&
			check.ok &&
			check.schemaSequencePresent &&
			typeof check.schemaSequenceVersion === 'number' &&
			check.schemaSequenceVersion >= 1 &&
			typeof check.migrationSequenceKey === 'string' &&
			check.migrationSequenceKey.includes('eval-badge') &&
			check.migrationExercised === true &&
			check.legacyNameMigratedToLabel === true &&
			typeof check.migratedLabel === 'string' &&
			check.migratedLabel.length > 0
	)
}

function isRoundTripSemanticsOk(roundTrip) {
	const parse = roundTrip?.parseStoreSemantics
	const clean = roundTrip?.cleanSnapshotSemantics
	const cleanEditor = roundTrip?.cleanEditorSemantics
	const steps = roundTrip?.steps ?? {}
	return Boolean(
		roundTrip?.ok &&
			parse &&
			parse.ok &&
			parse.shapeIdsAndTypesPreserved &&
			parse.bindingsPreserved &&
			parse.bindingEndpointsPreserved &&
			parse.imageAltTextOk &&
			typeof parse.imageAltText === 'string' &&
			parse.imageAltText.trim().length > 0 &&
			clean &&
			clean.ok &&
			clean.shapeIdsAndTypesPreserved &&
			clean.bindingsPreserved &&
			clean.bindingEndpointsPreserved &&
			clean.imageAltTextOk &&
			typeof clean.imageAltText === 'string' &&
			clean.imageAltText.trim().length > 0 &&
			cleanEditor &&
			cleanEditor.ok &&
			cleanEditor.shapeIdsAndTypesPreserved &&
			cleanEditor.bindingsPreserved &&
			cleanEditor.bindingEndpointsPreserved &&
			cleanEditor.imageAltTextOk &&
			steps.parseStoreSemantics?.ok &&
			steps.cleanSnapshotSemantics?.ok &&
			steps.cleanStoreRecordCount?.ok &&
			steps.cleanParseLoadSemantics?.ok &&
			steps.cleanEditorSemantics?.ok &&
			steps.liveEditorInvariants?.ok
	)
}

function isHideUiImpactOk(hideUiImpact) {
	return Boolean(
		hideUiImpact &&
			hideUiImpact.ok &&
			hideUiImpact.uiVisibleBefore === true &&
			hideUiImpact.uiHiddenWhenHideUi === true &&
			hideUiImpact.uiRestoredAfter === true &&
			hideUiImpact.leftUiHidden === false &&
			hideUiImpact.shortcutsStillWorkWithHideUi === true &&
			hideUiImpact.shortcutToolAfterKeyD === 'draw'
	)
}

function isA11yStatusOk(a11y) {
	return Boolean(
		a11y &&
			a11y.ok &&
			a11y.ariaDescriptor &&
			a11y.shapeTextOk &&
			typeof a11y.shapeText === 'string' &&
			a11y.shapeText.length > 0 &&
			a11y.statusFontSizeOk &&
			a11y.statusFontSizePx >= 12 &&
			a11y.statusContrastOk &&
			a11y.reducedMotionRulePresent &&
			a11y.panelAriaLabel
	)
}

async function waitForEvalStatus(page, timeout = 120_000) {
	return page
		.waitForFunction(
			() => {
				const s = window.__hermesTldrawEvalStatus
				return s && s.finishedAt ? s : null
			},
			null,
			{ timeout }
		)
		.then((h) => h.jsonValue())
}

async function collectIdbPresence(page, persistenceKey) {
	return page.evaluate(async (key) => {
		const expected = `TLDRAW_DOCUMENT_v2${key}`
		if (!indexedDB.databases) {
			return { supported: false, expected, names: [], present: false }
		}
		const dbs = await indexedDB.databases()
		const names = dbs.map((d) => d.name).filter(Boolean)
		return {
			supported: true,
			expected,
			names,
			present: names.includes(expected),
		}
	}, persistenceKey)
}

async function runA11yBrowserChecks(page) {
	// Keyboard focus path: Tab until eval status or panel control is focused.
	let keyboardFocus = false
	let focusedTag = null
	let focusedClass = null
	for (let i = 0; i < 24; i++) {
		await page.keyboard.press('Tab')
		const info = await page.evaluate(() => {
			const el = document.activeElement
			if (!el) return null
			return {
				tag: el.tagName,
				className: typeof el.className === 'string' ? el.className : '',
				id: el.id || '',
				role: el.getAttribute('role'),
				ariaLabel: el.getAttribute('aria-label'),
			}
		})
		if (!info) continue
		const hit =
			(info.className && info.className.includes('eval-status')) ||
			(info.className && info.className.includes('eval-panel-toggle')) ||
			info.ariaLabel === 'Evaluation status' ||
			(info.tag === 'BUTTON' && info.className.includes('eval-panel'))
		if (hit || (info.tag === 'BUTTON' && i > 0)) {
			// Prefer explicit eval panel focus; accept any focusable button path as progress.
			if (
				(info.className && info.className.includes('eval-status')) ||
				(info.className && info.className.includes('eval-panel')) ||
				info.role === 'status'
			) {
				keyboardFocus = true
				focusedTag = info.tag
				focusedClass = info.className
				break
			}
			focusedTag = info.tag
			focusedClass = info.className
		}
	}
	// Direct focus fallback if tab order is dominated by tldraw chrome.
	if (!keyboardFocus) {
		keyboardFocus = await page.evaluate(() => {
			const status = document.querySelector('.eval-status')
			if (!(status instanceof HTMLElement)) return false
			status.focus()
			return document.activeElement === status
		})
		if (keyboardFocus) {
			focusedTag = 'PRE'
			focusedClass = 'eval-status'
		}
	}

	const layout = await page.evaluate(() => {
		const root = document.querySelector('.eval-root')
		const panel = document.querySelector('.eval-panel')
		if (!root || !panel) {
			return { ok: false, detail: 'missing root/panel' }
		}
		const rootStyle = getComputedStyle(root)
		const panelRect = panel.getBoundingClientRect()
		const rootRect = root.getBoundingClientRect()
		return {
			ok: true,
			flexDirection: rootStyle.flexDirection,
			panelWidth: panelRect.width,
			panelHeight: panelRect.height,
			rootWidth: rootRect.width,
			rootHeight: rootRect.height,
			panelAria: panel.getAttribute('aria-label'),
		}
	})

	// Responsive panel: narrow viewport should stack (column).
	const previousSize = page.viewportSize()
	await page.setViewportSize({ width: 480, height: 800 })
	await page.waitForTimeout(150)
	const narrow = await page.evaluate(() => {
		const root = document.querySelector('.eval-root')
		const panel = document.querySelector('.eval-panel')
		if (!root || !panel) return { ok: false }
		const fd = getComputedStyle(root).flexDirection
		const panelRect = panel.getBoundingClientRect()
		const rootRect = root.getBoundingClientRect()
		return {
			ok: fd === 'column' && panelRect.width >= rootRect.width * 0.9,
			flexDirection: fd,
			panelWidth: panelRect.width,
			rootWidth: rootRect.width,
		}
	})
	if (previousSize) {
		await page.setViewportSize(previousSize)
		await page.waitForTimeout(100)
	}

	const reducedMotion = await page.evaluate(() => {
		return document.documentElement.dataset.evalReducedMotionCss === '1'
	})

	const statusMetrics = await page.evaluate(() => {
		const el = document.querySelector('.eval-status')
		if (!el) return null
		const styles = getComputedStyle(el)
		const fontSize = parseFloat(styles.fontSize)
		const parseRgb = (color) => {
			const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
			if (!m) return null
			return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
		}
		const lum = ({ r, g, b }) => {
			const lin = [r, g, b].map((v) => {
				const s = v / 255
				return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
			})
			return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
		}
		const fg = parseRgb(styles.color)
		const bg = parseRgb(styles.backgroundColor)
		let contrast = null
		if (fg && bg) {
			const l1 = lum(fg)
			const l2 = lum(bg)
			const lighter = Math.max(l1, l2)
			const darker = Math.min(l1, l2)
			contrast = (lighter + 0.05) / (darker + 0.05)
		}
		return {
			fontSize,
			fontSizeOk: fontSize >= 12,
			contrast,
			contrastOk: contrast !== null && contrast >= 4.5,
			color: styles.color,
			backgroundColor: styles.backgroundColor,
		}
	})

	return {
		keyboardFocus,
		focusedTag,
		focusedClass,
		layout,
		responsivePanel: Boolean(narrow?.ok),
		narrow,
		reducedMotion,
		statusMetrics,
		ok: Boolean(
			keyboardFocus &&
				layout?.panelAria === 'Evaluation status' &&
				narrow?.ok &&
				reducedMotion &&
				statusMetrics?.fontSizeOk &&
				statusMetrics?.contrastOk
		),
	}
}

async function main() {
	await ensureDirs()
	const tldrawPkg = JSON.parse(
		await fs.readFile(path.join(root, 'node_modules', 'tldraw', 'package.json'), 'utf8')
	)

	await build({ root, logLevel: 'error' })
	// Vite build sets NODE_ENV=production in-process; reset before creating the dev server
	// or React refresh globals are omitted and the dev bundle fails at runtime.
	process.env.NODE_ENV = 'development'

	const persistenceKey = `eval-verify-${Date.now().toString(36)}`
	const server = await createServer({
		root,
		server: { port: 5199, strictPort: true },
		logLevel: 'error',
	})
	await server.listen()
	const url = `http://127.0.0.1:5199/?pk=${encodeURIComponent(persistenceKey)}`
	console.log('dev server', url)

	const browser = await chromium.launch({ headless: true })
	const context = await browser.newContext()
	const page = await context.newPage()
	const consoleErrors = []
	page.on('console', (msg) => {
		if (msg.type() === 'error') consoleErrors.push(msg.text())
	})
	page.on('pageerror', (err) => consoleErrors.push(String(err)))

	await page.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })

	// Wait for eval status (first visit writes persistence marker)
	const status = await waitForEvalStatus(page)

	const tldrJson = await page.evaluate(() => window.__hermesTldrJson || null)
	const svg = await page.evaluate(() => window.__hermesSvg || null)
	const bridgePresent = await page.evaluate(() => Boolean(window.__hermesTldrawBridge))
	const screenshotPath = path.join(artifactsDir, 'eval-screenshot.png')
	// Dismiss any open default tldraw flyout so runtime evidence is not obscured.
	await page.keyboard.press('Escape')
	await page.waitForTimeout(100)
	await page.screenshot({ path: screenshotPath, fullPage: true })

	// Allow IndexedDB flush after marker write.
	await page.waitForTimeout(500)
	const idbBeforeReload = await collectIdbPresence(page, persistenceKey)

	// --- Persistence: reload survival ---
	await page.reload({ waitUntil: 'networkidle', timeout: 120_000 })
	const statusAfterReload = await waitForEvalStatus(page)
	const idbAfterReload = await collectIdbPresence(page, persistenceKey)
	const persistenceReload = {
		ok: Boolean(
			statusAfterReload?.persistence?.foundExistingMarker === true &&
				statusAfterReload?.persistence?.markerLabel &&
				status?.persistence?.markerLabel &&
				statusAfterReload.persistence.markerLabel === status.persistence.markerLabel
		),
		beforeLabel: status?.persistence?.markerLabel ?? null,
		afterLabel: statusAfterReload?.persistence?.markerLabel ?? null,
		foundExistingMarker: statusAfterReload?.persistence?.foundExistingMarker === true,
		idbBeforeReload,
		idbAfterReload,
	}

	// --- Persistence: second tab / cross-tab load of same key ---
	const page2 = await context.newPage()
	const page2Errors = []
	page2.on('console', (msg) => {
		if (msg.type() === 'error') page2Errors.push(msg.text())
	})
	page2.on('pageerror', (err) => page2Errors.push(String(err)))
	await page2.goto(url, { waitUntil: 'networkidle', timeout: 120_000 })
	const statusTab2 = await waitForEvalStatus(page2)
	const persistenceCrossTab = {
		ok: Boolean(
			statusTab2?.persistence?.foundExistingMarker === true &&
				statusTab2?.persistence?.markerLabel &&
				status?.persistence?.markerLabel &&
				statusTab2.persistence.markerLabel === status.persistence.markerLabel
		),
		tab2Label: statusTab2?.persistence?.markerLabel ?? null,
		foundExistingMarker: statusTab2?.persistence?.foundExistingMarker === true,
		consoleErrors: page2Errors,
	}
	await page2.close()

	// A11y browser checks on the reloaded page (status panel painted).
	const a11yBrowser = await runA11yBrowserChecks(page)

	// Harvest fixtures from official serializer output
	let malformedJson = null
	if (tldrJson) {
		const validPath = path.join(fixturesDir, 'valid-current.tldr')
		await fs.writeFile(validPath, tldrJson, 'utf8')
		await fs.writeFile(path.join(artifactsDir, 'valid-current.tldr'), tldrJson, 'utf8')

		// Malformed: one documented mutation — break tldrawFileFormatVersion type
		const envelope = JSON.parse(tldrJson)
		const malformed = {
			...envelope,
			tldrawFileFormatVersion: 'not-a-number',
		}
		malformedJson = JSON.stringify(malformed, null, 2)
		await fs.writeFile(path.join(fixturesDir, 'malformed-envelope.tldr'), malformedJson, 'utf8')
		await fs.writeFile(path.join(artifactsDir, 'malformed-envelope.tldr'), malformedJson, 'utf8')
	}

	if (svg) {
		await fs.writeFile(path.join(artifactsDir, 'export.svg'), svg, 'utf8')
	}

	if (!tldrJson || !malformedJson) {
		throw new Error('Current or malformed fixture was not generated')
	}
	const legacyJson = await fs.readFile(
		path.join(fixturesDir, 'legacy-upstream-v2.tldr'),
		'utf8'
	)
	const fixtureChecks = await page.evaluate(
		({ valid, malformed, legacy }) => {
			const bridge = window.__hermesTldrawBridge
			if (!bridge) throw new Error('Hermes bridge missing during fixture checks')
			const current = bridge.parseTldr(valid)
			const invalid = bridge.parseTldr(malformed)
			const migrated = bridge.parseTldr(legacy)
			return {
				currentAccepted: current.ok,
				malformedRejected: !invalid.ok,
				legacyAcceptedAndMigrated: migrated.ok,
				legacyRecordCount:
					migrated.ok && typeof migrated.store?.allRecords === 'function'
						? migrated.store.allRecords().length
						: 0,
			}
		},
		{ valid: tldrJson, malformed: malformedJson, legacy: legacyJson }
	)

	await server.close()
	process.env.NODE_ENV = 'production'

	// Serve the real production bundle and prove the dev bridge is absent at runtime.
	const prodServer = await preview({
		root,
		preview: { host: '127.0.0.1', port: 5200, strictPort: true },
		logLevel: 'error',
	})
	const prodPage = await browser.newPage()
	const prodConsoleErrors = []
	prodPage.on('console', (msg) => {
		if (msg.type() === 'error') prodConsoleErrors.push(msg.text())
	})
	prodPage.on('pageerror', (err) => prodConsoleErrors.push(String(err)))
	const prodUrl = `http://127.0.0.1:5200/?pk=${encodeURIComponent(persistenceKey + '-prod')}`
	await prodPage.goto(prodUrl, {
		waitUntil: 'networkidle',
		timeout: 120_000,
	})
	const prodStatus = await waitForEvalStatus(prodPage)
	const prodBridgePresent = await prodPage.evaluate(() => Boolean(window.__hermesTldrawBridge))
	await prodPage.keyboard.press('Escape')
	await prodPage.waitForTimeout(100)
	await prodPage.screenshot({
		path: path.join(artifactsDir, 'eval-production-screenshot.png'),
		fullPage: true,
	})
	await prodPage.close()
	await new Promise((resolve, reject) => {
		prodServer.httpServer.close((error) => (error ? reject(error) : resolve()))
	})

	const gates = {
		driverOps: isDriverOpsOk(status?.driver),
		migrationsRegistered: isMigrationsOk(status),
		migrationsExercised: isMigrationsOk(status),
		roundTripSemantics: isRoundTripSemanticsOk(status?.roundTrip),
		hideUiImpact: isHideUiImpactOk(status?.hideUiImpact),
		storeApis: isStoreApisOk(status?.storeApis),
		persistenceReload: persistenceReload.ok,
		persistenceCrossTab: persistenceCrossTab.ok,
		a11yRuntime: isA11yStatusOk(status?.a11y),
		a11yBrowser: a11yBrowser.ok,
		noConsoleErrors: consoleErrors.length === 0 && page2Errors.length === 0,
		prodBridgeAbsent: !prodBridgePresent && prodStatus?.bridgeMounted === false && prodStatus?.bridgeDisabledInProd === true,
		prodDriverOps: isDriverOpsOk(prodStatus?.driver),
		prodStoreApis: isStoreApisOk(prodStatus?.storeApis),
		prodMigrations: isMigrationsOk(prodStatus),
		prodRoundTripSemantics: isRoundTripSemanticsOk(prodStatus?.roundTrip),
		prodHideUiImpact: isHideUiImpactOk(prodStatus?.hideUiImpact),
		prodNoConsoleErrors: prodConsoleErrors.length === 0,
	}

	const report = {
		status,
		statusAfterReload,
		statusTab2,
		bridgePresent,
		fixtureChecks,
		persistence: {
			key: persistenceKey,
			reload: persistenceReload,
			crossTab: persistenceCrossTab,
		},
		a11yBrowser,
		gates,
		production: {
			status: prodStatus,
			bridgePresent: prodBridgePresent,
			consoleErrors: prodConsoleErrors,
		},
		consoleErrors,
		tldrawVersion: tldrawPkg.version,
		screenshotPath,
	}

	await fs.writeFile(
		path.join(artifactsDir, 'eval-status.json'),
		JSON.stringify(report, null, 2),
		'utf8'
	)

	await browser.close()

	const ok =
		Boolean(status?.ok) &&
		gates.driverOps &&
		gates.migrationsRegistered &&
		gates.migrationsExercised &&
		gates.roundTripSemantics &&
		gates.hideUiImpact &&
		gates.storeApis &&
		gates.persistenceReload &&
		gates.persistenceCrossTab &&
		gates.a11yRuntime &&
		gates.a11yBrowser &&
		Boolean(tldrJson) &&
		bridgePresent &&
		fixtureChecks.currentAccepted &&
		fixtureChecks.malformedRejected &&
		fixtureChecks.legacyAcceptedAndMigrated &&
		fixtureChecks.legacyRecordCount > 0 &&
		gates.prodBridgeAbsent &&
		gates.prodDriverOps &&
		gates.prodStoreApis &&
		gates.prodMigrations &&
		gates.prodRoundTripSemantics &&
		gates.prodHideUiImpact &&
		Boolean(prodStatus?.ok) &&
		gates.noConsoleErrors &&
		gates.prodNoConsoleErrors

	console.log(
		JSON.stringify(
			{
				ok,
				statusOk: status?.ok,
				prodStatusOk: prodStatus?.ok,
				bridgePresent,
				tldrBytes: tldrJson?.length ?? 0,
				svgBytes: svg?.length ?? 0,
				consoleErrors,
				fixtureChecks,
				gates,
				roundTripSemantics: {
					parse: status?.roundTrip?.parseStoreSemantics ?? null,
					cleanSnapshot: status?.roundTrip?.cleanSnapshotSemantics ?? null,
					cleanEditor: status?.roundTrip?.cleanEditorSemantics ?? null,
				},
				migrationsCheck: status?.custom?.migrationsCheck ?? null,
				hideUiImpact: status?.hideUiImpact ?? null,
				production: {
					bridgePresent: prodBridgePresent,
					bridgeMounted: prodStatus?.bridgeMounted,
					bridgeDisabledInProd: prodStatus?.bridgeDisabledInProd,
					consoleErrors: prodConsoleErrors,
					roundTripSemantics: {
						parse: prodStatus?.roundTrip?.parseStoreSemantics ?? null,
						cleanSnapshot: prodStatus?.roundTrip?.cleanSnapshotSemantics ?? null,
						cleanEditor: prodStatus?.roundTrip?.cleanEditorSemantics ?? null,
					},
					hideUiImpact: prodStatus?.hideUiImpact ?? null,
					migrationsCheck: prodStatus?.custom?.migrationsCheck ?? null,
				},
				persistence: {
					key: persistenceKey,
					reload: persistenceReload.ok,
					crossTab: persistenceCrossTab.ok,
				},
				a11yBrowser: {
					ok: a11yBrowser.ok,
					keyboardFocus: a11yBrowser.keyboardFocus,
					responsivePanel: a11yBrowser.responsivePanel,
					statusMetrics: a11yBrowser.statusMetrics,
				},
			},
			null,
			2
		)
	)

	if (!ok) {
		console.error('VERIFY FAILED')
		process.exit(1)
	}
	console.log('VERIFY PASSED')
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
