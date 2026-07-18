import { useCallback, useMemo, useRef, useState } from 'react'
import {
	Tldraw,
	type Editor,
	type TLComponents,
	type TLUiOverrides,
} from 'tldraw'
import 'tldraw/tldraw.css'
import type { HermesDevBridge } from './bridge/hermes-dev-bridge'
import { EvalBadgeShapeUtil } from './custom/EvalBadgeShapeUtil'
import { EvalLinkBindingUtil } from './custom/EvalLinkBindingUtil'
import { EvalBadgeTool } from './custom/EvalBadgeTool'
import { ensureDiagramAndRoundTrip, type EvalBrowserStatus } from './harness/roundtrip'
import { runDriverOps } from './harness/driver-ops'
import { runStoreApis } from './harness/store-apis'
import { checkCustomShapeMigrations } from './harness/migrations-check'
import {
	ensurePersistenceMarker,
	getEvalPersistenceKey,
} from './harness/persistence-marker'
import { runA11yCheck } from './harness/a11y-check'
import { runHideUiImpactCheck } from './harness/hide-ui-impact'
import { EvalErrorFallback, EvalErrorProbe } from './harness/error-boundary'
import {
	createVisualScenario,
	parseVisualScenario,
} from './diagram/create-visual-scenario'
import { runMermaidExample } from './examples/mermaid-example'
import { describeSyncBranch } from './examples/sync-compile-example'
import { describeAgentBranch } from './examples/agent-compile-example'
import './App.css'

const TLDRAW_VERSION = '5.2.5'

function publishStatus(status: EvalBrowserStatus) {
	if (typeof window !== 'undefined') {
		window.__hermesTldrawEvalStatus = status as unknown as Record<string, unknown>
		window.dispatchEvent(new CustomEvent('hermes-tldraw-eval', { detail: status }))
	}
}

function emptyDriver(): EvalBrowserStatus['driver'] {
	return {
		ok: false,
		constructed: false,
		created: false,
		selected: false,
		transformed: false,
		disposed: false,
		operations: [],
		detail: 'not run',
	}
}

function emptyStoreApis(): EvalBrowserStatus['storeApis'] {
	return {
		ok: false,
		standaloneSnapshot: false,
		storeListen: false,
		storeListenCleanup: false,
		editorRun: false,
		undoRedo: false,
		readonlyRejection: false,
		detail: 'not run',
		steps: {},
	}
}

function emptyA11y(): EvalBrowserStatus['a11y'] {
	return {
		ok: false,
		ariaDescriptor: false,
		ariaDescriptorText: null,
		shapeTextOk: false,
		shapeText: null,
		statusFontSizePx: null,
		statusFontSizeOk: false,
		statusContrastOk: false,
		reducedMotionRulePresent: false,
		panelAriaLabel: false,
		detail: 'not run',
	}
}

function emptyHideUiImpact(): EvalBrowserStatus['hideUiImpact'] {
	return {
		ok: false,
		uiVisibleBefore: false,
		uiHiddenWhenHideUi: false,
		shortcutToolBefore: null,
		shortcutToolAfterKeyD: null,
		shortcutsStillWorkWithHideUi: false,
		uiRestoredAfter: false,
		leftUiHidden: true,
		detail: 'not run',
	}
}

export default function App() {
	const bridgeRef = useRef<HermesDevBridge | null>(null)
	const ranRef = useRef(false)
	const [status, setStatus] = useState<EvalBrowserStatus | null>(null)
	const [panelOpen, setPanelOpen] = useState(true)
	const [hideUi, setHideUi] = useState(false)
	const persistenceKey = useMemo(() => getEvalPersistenceKey(), [])

	const shapeUtils = useMemo(() => [EvalBadgeShapeUtil], [])
	const bindingUtils = useMemo(() => [EvalLinkBindingUtil], [])
	const tools = useMemo(() => [EvalBadgeTool], [])

	const overrides: TLUiOverrides = useMemo(
		() => ({
			tools(editor, toolsMap) {
				toolsMap['eval-badge'] = {
					id: 'eval-badge',
					label: 'Eval badge',
					icon: 'tool-frame',
					kbd: 'b',
					onSelect() {
						editor.setCurrentTool('eval-badge')
					},
				}
				return toolsMap
			},
		}),
		[]
	)

	const components: TLComponents = useMemo(
		() => ({
			// Keep the functional default UI but omit the large floating style panel;
			// the eval status panel already occupies the right edge of this evidence app.
			StylePanel: null,
			InFrontOfTheCanvas: EvalErrorProbe,
			ErrorFallback: EvalErrorFallback,
		}),
		[]
	)

	const onMount = useCallback((editor: Editor) => {
		if (ranRef.current) return
		ranRef.current = true

		void (async () => {
			let bridge: HermesDevBridge | null = null
			if (import.meta.env.DEV) {
				const [{ createOptionalDriverAdapter, mountHermesDevBridge }, { Driver }] =
					await Promise.all([
						import('./bridge/hermes-dev-bridge'),
						import('@tldraw/driver'),
					])
				bridge = mountHermesDevBridge(editor, {
					driverFactory: (mountedEditor) =>
						createOptionalDriverAdapter(mountedEditor, Driver),
				})
				bridgeRef.current = bridge
			}

			const startedAt = new Date().toISOString()
			const errors: string[] = []
			const base: EvalBrowserStatus = {
				version: '1.0.0',
				tldraw: TLDRAW_VERSION,
				startedAt,
				bridgeMounted: Boolean(bridge),
				bridgeDisabledInProd: !import.meta.env.DEV,
				driver: emptyDriver(),
				diagram: { ok: false },
				roundTrip: { ok: false, steps: {}, errors: [] },
				mermaid: { ok: false, runtime: false },
				custom: {
					shapeUtil: true,
					migrations: false,
					bindingUtil: true,
					stateNode: true,
				},
				storeApis: emptyStoreApis(),
				persistence: {
					ok: false,
					persistenceKey,
					wroteMarker: false,
					foundExistingMarker: false,
					markerLabel: '',
					detail: 'not run',
				},
				a11y: emptyA11y(),
				hideUiImpact: emptyHideUiImpact(),
				sync: describeSyncBranch(),
				agent: describeAgentBranch(),
				export: { svg: false, png: false },
				errors,
				ok: false,
			}
			publishStatus(base)
			setStatus(base)

			try {
				// Persistence marker first so reload/cross-tab can observe restore before heavy work.
				const persistence = ensurePersistenceMarker(editor)
				base.persistence = persistence
				if (!persistence.ok) errors.push(`persistence: ${persistence.detail}`)

				const migrationsCheck = checkCustomShapeMigrations(editor)
				base.custom.migrations = migrationsCheck.ok
				base.custom.migrationsCheck = migrationsCheck
				if (!migrationsCheck.ok) errors.push(`migrations: ${migrationsCheck.detail}`)

				const { roundTrip } = await ensureDiagramAndRoundTrip(editor)
				base.diagram = {
					ok: Boolean(roundTrip.invariantsBefore?.ok),
					detail: roundTrip.invariantsBefore
						? JSON.stringify(roundTrip.invariantsBefore)
						: 'missing',
				}
				base.roundTrip = roundTrip
				base.export = {
					svg: Boolean(roundTrip.steps.exportSvg?.ok),
					png: Boolean(roundTrip.steps.exportPng?.ok),
				}
				if (!roundTrip.ok) errors.push(...roundTrip.errors)

				// Persist fixture JSON on window for the playwright harness to harvest
				if (roundTrip.tldrJson) {
					;(window as unknown as { __hermesTldrJson?: string }).__hermesTldrJson =
						roundTrip.tldrJson
				}
				if (roundTrip.svgLength) {
					const svgResult = await editor.getSvgString(
						[...editor.getCurrentPageShapeIds()],
						{ background: true }
					)
					if (svgResult?.svg) {
						;(window as unknown as { __hermesSvg?: string }).__hermesSvg = svgResult.svg
					}
				}

				const mermaid = await runMermaidExample(editor)
				base.mermaid = {
					ok: mermaid.ok,
					runtime: mermaid.runtime,
					detail: mermaid.detail,
				}
				if (!mermaid.ok) errors.push(`mermaid: ${mermaid.detail}`)

				// Real Driver create/select/transform/dispose (independent of bridge).
				const driverOps = runDriverOps(editor)
				base.driver = driverOps
				if (!driverOps.ok) errors.push(`driver: ${driverOps.detail}`)

				// Store/snapshot/listen/run/undo/redo/readonly public API suite.
				const storeApis = await runStoreApis(editor)
				base.storeApis = storeApis
				if (!storeApis.ok) errors.push(`storeApis: ${storeApis.detail}`)

				// Custom binding create exercise
				try {
					const shapes = editor.getCurrentPageShapes()
					const a = shapes.find((s) => s.type === 'geo')
					const b = shapes.find((s) => s.type === 'note')
					if (a && b) {
						editor.createBinding({
							type: 'eval-link',
							fromId: a.id,
							toId: b.id,
							props: { strength: 1, label: 'annotated' },
						})
						base.custom.bindingUtil = true
					}
				} catch (e) {
					errors.push(
						`custom binding: ${e instanceof Error ? e.message : String(e)}`
					)
					base.custom.bindingUtil = false
				}

				// Publish intermediate status so a11y can read painted panel styles.
				publishStatus(base)
				setStatus({ ...base })
				await new Promise<void>((resolve) => {
					requestAnimationFrame(() => resolve())
				})

				const a11y = runA11yCheck(editor)
				base.a11y = a11y
				if (!a11y.ok) errors.push(`a11y: ${a11y.detail}`)

				// hideUi impact: toggle chrome, measure shortcuts, always restore UI.
				const hideUiImpact = await runHideUiImpactCheck(editor, setHideUi)
				base.hideUiImpact = hideUiImpact
				if (!hideUiImpact.ok) errors.push(`hideUiImpact: ${hideUiImpact.detail}`)

				const requestedVisualScenario = parseVisualScenario(
					new URLSearchParams(window.location.search).get('visual')
				)
				if (requestedVisualScenario) {
					const visualScenario = createVisualScenario(editor, requestedVisualScenario)
					base.visualScenario = visualScenario
					if (!visualScenario.ok) errors.push(`visualScenario: ${visualScenario.detail}`)
				}

				// Leave the evidence canvas in a stable, presentation-ready state.
				editor.setSelectedShapes([])
				editor.setCurrentTool('select')
				editor.zoomToFit({ animation: { duration: 0 } })

				base.finishedAt = new Date().toISOString()
				base.errors = errors
				// Production has no bridge; dev requires bridge. Driver must pass in both.
				const bridgeOk = import.meta.env.DEV ? base.bridgeMounted : base.bridgeDisabledInProd
				base.ok =
					bridgeOk &&
					base.driver.ok &&
					base.diagram.ok &&
					base.roundTrip.ok &&
					base.export.svg &&
					base.export.png &&
					base.mermaid.ok &&
					base.custom.shapeUtil &&
					base.custom.migrations &&
					base.custom.bindingUtil &&
					base.custom.stateNode &&
					base.storeApis.ok &&
					base.persistence.ok &&
					base.a11y.ok &&
					base.hideUiImpact.ok &&
					!base.hideUiImpact.leftUiHidden &&
					errors.length === 0

				publishStatus(base)
				setStatus({ ...base })
			} catch (e) {
				errors.push(e instanceof Error ? e.message : String(e))
				base.errors = errors
				base.ok = false
				base.finishedAt = new Date().toISOString()
				// Never leave UI hidden after a failed probe.
				setHideUi(false)
				publishStatus(base)
				setStatus({ ...base })
			}
		})()

		return () => {
			bridgeRef.current?.dispose()
			bridgeRef.current = null
		}
	}, [persistenceKey])

	return (
		<div className="eval-root">
			<div className="eval-canvas">
				<Tldraw
					shapeUtils={shapeUtils}
					bindingUtils={bindingUtils}
					tools={tools}
					overrides={overrides}
					components={components}
					persistenceKey={persistenceKey}
					hideUi={hideUi}
					onMount={onMount}
				/>
			</div>
			{panelOpen && (
				<aside
					className="eval-panel"
					aria-label="Evaluation status"
					data-eval-panel="true"
				>
					<header>
						<strong id="eval-panel-title">tldraw eval-app</strong>
						<span>v{TLDRAW_VERSION}</span>
						<button type="button" onClick={() => setPanelOpen(false)}>
							Hide
						</button>
					</header>
					<pre
						className="eval-status"
						tabIndex={0}
						role="status"
						aria-labelledby="eval-panel-title"
						aria-live="polite"
					>
						{status
							? JSON.stringify(
									{
										ok: status.ok,
										bridgeMounted: status.bridgeMounted,
										bridgeDisabledInProd: status.bridgeDisabledInProd,
										driver: {
											ok: status.driver.ok,
											operations: status.driver.operations,
										},
										diagram: status.diagram.ok,
										roundTrip: {
											ok: status.roundTrip.ok,
											parseStoreSemantics: status.roundTrip.parseStoreSemantics?.ok,
											cleanSnapshotSemantics: status.roundTrip.cleanSnapshotSemantics?.ok,
											cleanEditorSemantics: status.roundTrip.cleanEditorSemantics?.ok,
											imageAltText: status.roundTrip.cleanSnapshotSemantics?.imageAltText,
										},
										export: status.export,
										mermaid: status.mermaid,
										storeApis: {
											ok: status.storeApis.ok,
											undoRedo: status.storeApis.undoRedo,
											readonlyRejection: status.storeApis.readonlyRejection,
										},
										persistence: {
											ok: status.persistence.ok,
											key: status.persistence.persistenceKey,
											foundExistingMarker: status.persistence.foundExistingMarker,
											markerLabel: status.persistence.markerLabel,
										},
										a11y: {
											ok: status.a11y.ok,
											fontSize: status.a11y.statusFontSizePx,
										},
										hideUiImpact: {
											ok: status.hideUiImpact.ok,
											uiHiddenWhenHideUi: status.hideUiImpact.uiHiddenWhenHideUi,
											shortcutsStillWorkWithHideUi:
												status.hideUiImpact.shortcutsStillWorkWithHideUi,
											uiRestoredAfter: status.hideUiImpact.uiRestoredAfter,
											leftUiHidden: status.hideUiImpact.leftUiHidden,
										},
										visualScenario: status.visualScenario ?? null,
										sync: status.sync,
										agent: status.agent,
										custom: {
											shapeUtil: status.custom.shapeUtil,
											migrations: status.custom.migrations,
											migrationExercised: status.custom.migrationsCheck?.migrationExercised,
											legacyNameMigratedToLabel:
												status.custom.migrationsCheck?.legacyNameMigratedToLabel,
											bindingUtil: status.custom.bindingUtil,
											stateNode: status.custom.stateNode,
										},
										errors: status.errors,
									},
									null,
									2
								)
							: 'Running verification…'}
					</pre>
					<p className="eval-hint">
						Bridge mounts only in DEV on localhost. Production build disables it.
						Sync/agent branches are compile-time only unless credentials/server exist.
						persistenceKey={persistenceKey}
					</p>
				</aside>
			)}
			{!panelOpen && (
				<button
					type="button"
					className="eval-panel-toggle"
					onClick={() => setPanelOpen(true)}
				>
					Show eval status
				</button>
			)}
		</div>
	)
}
