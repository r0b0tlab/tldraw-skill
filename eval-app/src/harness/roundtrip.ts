/**
 * Official .tldr round-trip + export harness.
 *
 * Full bar: serialize → parse → load into a **clean** store with the app schema,
 * then assert semantic IDs/types/bindings there. Live-editor invariants are named
 * honestly (not "afterReload").
 */

import type { TLRecord, TLShapeId, TLStore } from 'tldraw'
import {
	createTLStore,
	defaultAssetUtils,
	defaultBindingUtils,
	defaultShapeUtils,
	defaultTools,
	Editor,
	getSnapshot,
	loadSnapshot,
	parseTldrawJsonFile,
	serializeTldrawJson,
} from 'tldraw'
import {
	createArchitectureDiagram,
	DIAGRAM_IDS,
	getDiagramSemanticInvariants,
	type DiagramIds,
} from '../diagram/create-architecture-diagram'
import { EvalBadgeShapeUtil } from '../custom/EvalBadgeShapeUtil'
import { EvalLinkBindingUtil } from '../custom/EvalLinkBindingUtil'
import type { VisualScenarioResult } from '../diagram/create-visual-scenario'
import type { DriverOpsResult } from './driver-ops'
import type { StoreApisResult } from './store-apis'
import type { MigrationsCheckResult } from './migrations-check'
import type { PersistenceMarkerResult } from './persistence-marker'
import type { A11yCheckResult } from './a11y-check'
import type { HideUiImpactResult } from './hide-ui-impact'

export interface StoreSemanticsResult {
	ok: boolean
	trackedShapeCount: number
	shapeIdsAndTypesPreserved: boolean
	bindingCount: number
	bindingsPreserved: boolean
	bindingEndpointsPreserved: boolean
	imageAltText: string | null
	imageAltTextOk: boolean
	detail: string
}

export interface RoundTripResult {
	ok: boolean
	steps: Record<string, { ok: boolean; detail?: string }>
	invariantsBefore?: ReturnType<typeof getDiagramSemanticInvariants>
	/** Invariants on the original live editor after export (not a clean reload). */
	liveEditorInvariants?: ReturnType<typeof getDiagramSemanticInvariants>
	/** @deprecated alias — prefer liveEditorInvariants (honest naming). */
	invariantsAfterReload?: ReturnType<typeof getDiagramSemanticInvariants>
	parseStoreSemantics?: StoreSemanticsResult
	cleanSnapshotSemantics?: StoreSemanticsResult
	cleanEditorSemantics?: StoreSemanticsResult
	tldrJson?: string
	svgLength?: number
	pngBytes?: number
	snapshotKeys?: string[]
	errors: string[]
}

export interface EvalBrowserStatus {
	version: string
	tldraw: string
	startedAt: string
	finishedAt?: string
	bridgeMounted: boolean
	bridgeDisabledInProd: boolean
	driver: DriverOpsResult
	diagram: { ok: boolean; detail?: string }
	roundTrip: RoundTripResult
	mermaid: { ok: boolean; runtime: boolean; detail?: string }
	custom: {
		shapeUtil: boolean
		migrations: boolean
		migrationsCheck?: MigrationsCheckResult
		bindingUtil: boolean
		stateNode: boolean
	}
	storeApis: StoreApisResult
	persistence: PersistenceMarkerResult & {
		reloadSurvived?: boolean
		crossTabLoaded?: boolean
	}
	a11y: A11yCheckResult
	hideUiImpact: HideUiImpactResult
	visualScenario?: VisualScenarioResult
	sync: { ok: boolean; runtime: boolean; detail: string }
	agent: { ok: boolean; runtime: boolean; detail: string }
	export: { svg: boolean; png: boolean }
	errors: string[]
	ok: boolean
}

type BindingLike = TLRecord & {
	typeName: 'binding'
	id: string
	type?: string
	fromId?: string
	toId?: string
}

type ShapeLike = TLRecord & {
	typeName: 'shape'
	id: string
	type?: string
	props?: Record<string, unknown>
}

function isShape(record: TLRecord): record is ShapeLike {
	return record.typeName === 'shape'
}

function isBinding(record: TLRecord): record is BindingLike {
	return record.typeName === 'binding'
}

function bindingEndpointKey(b: BindingLike): string {
	return `${b.id}|${b.type ?? ''}|${b.fromId ?? ''}|${b.toId ?? ''}`
}

/**
 * Compare tracked diagram shape ids/types and binding endpoints between a source
 * editor/store and a target store (parsed or clean snapshot load).
 */
export function assertStoreSemantics(
	sourceRecords: TLRecord[],
	targetRecords: TLRecord[],
	ids: DiagramIds,
	imageId: TLShapeId
): StoreSemanticsResult {
	const sourceById = new Map(sourceRecords.map((r) => [r.id as string, r]))
	const targetById = new Map(targetRecords.map((r) => [r.id as string, r]))

	const trackedShapeIds = Object.values(ids).filter((id) => sourceById.get(id)?.typeName === 'shape')

	const shapeIdsAndTypesPreserved = trackedShapeIds.every((id) => {
		const before = sourceById.get(id)
		const after = targetById.get(id)
		return Boolean(
			before &&
				after &&
				isShape(before) &&
				isShape(after) &&
				before.type === after.type
		)
	})

	const sourceBindings = sourceRecords.filter(isBinding)
	const targetBindings = targetRecords.filter(isBinding)
	const sourceKeys = sourceBindings.map(bindingEndpointKey).sort()
	const targetKeys = targetBindings.map(bindingEndpointKey).sort()
	const bindingsPreserved =
		sourceKeys.length > 0 && JSON.stringify(sourceKeys) === JSON.stringify(targetKeys)

	// Endpoint pairs for tracked arrows (stronger than id-only).
	const trackedArrowIds = [ids.arrow1, ids.arrow2, ids.arrow3]
	let bindingEndpointsPreserved = true
	for (const arrowId of trackedArrowIds) {
		const before = sourceBindings
			.filter((b) => b.fromId === arrowId)
			.map((b) => `${b.toId}`)
			.sort()
		const after = targetBindings
			.filter((b) => b.fromId === arrowId)
			.map((b) => `${b.toId}`)
			.sort()
		if (JSON.stringify(before) !== JSON.stringify(after) || before.length === 0) {
			bindingEndpointsPreserved = false
			break
		}
	}

	const imageBefore = sourceById.get(imageId)
	const imageAfter = targetById.get(imageId)
	let imageAltText: string | null = null
	if (imageAfter && isShape(imageAfter) && imageAfter.props) {
		const alt = imageAfter.props.altText
		imageAltText = typeof alt === 'string' ? alt : null
	} else if (imageBefore && isShape(imageBefore) && imageBefore.props) {
		const alt = imageBefore.props.altText
		imageAltText = typeof alt === 'string' ? alt : null
	}
	const imageAltTextOk = typeof imageAltText === 'string' && imageAltText.trim().length > 0

	const ok =
		shapeIdsAndTypesPreserved &&
		bindingsPreserved &&
		bindingEndpointsPreserved &&
		imageAltTextOk &&
		trackedShapeIds.length >= 10

	return {
		ok,
		trackedShapeCount: trackedShapeIds.length,
		shapeIdsAndTypesPreserved,
		bindingCount: targetBindings.length,
		bindingsPreserved,
		bindingEndpointsPreserved,
		imageAltText,
		imageAltTextOk,
		detail: ok
			? `shapes=${trackedShapeIds.length} bindings=${targetBindings.length} alt=${JSON.stringify(imageAltText)}`
			: `shapesOk=${shapeIdsAndTypesPreserved}(${trackedShapeIds.length}) bindOk=${bindingsPreserved} epOk=${bindingEndpointsPreserved} altOk=${imageAltTextOk}(${JSON.stringify(imageAltText)})`,
	}
}

function recordsFromStore(store: TLStore): TLRecord[] {
	return store.allRecords()
}

export async function runRoundTrip(editor: Editor, ids: DiagramIds = DIAGRAM_IDS): Promise<RoundTripResult> {
	const errors: string[] = []
	const steps: RoundTripResult['steps'] = {}
	const result: RoundTripResult = { ok: false, steps, errors }

	try {
		const invariantsBefore = getDiagramSemanticInvariants(editor, ids)
		result.invariantsBefore = invariantsBefore
		steps.invariantsBefore = {
			ok: invariantsBefore.ok,
			detail: JSON.stringify(invariantsBefore),
		}
		if (!invariantsBefore.ok) errors.push('pre-serialize invariants failed')

		const tldrJson = await serializeTldrawJson(editor)
		result.tldrJson = tldrJson
		steps.serialize = { ok: tldrJson.length > 0, detail: `bytes=${tldrJson.length}` }

		const sourceRecords = editor.store.allRecords()
		const parsed = parseTldrawJsonFile({
			json: tldrJson,
			schema: editor.store.schema,
		})
		if (parsed.ok === true) {
			steps.parse = { ok: true, detail: 'ok' }

			// Semantics on the store produced by parseTldrawJsonFile (clean parse path).
			const parseSemantics = assertStoreSemantics(
				sourceRecords,
				recordsFromStore(parsed.value),
				ids,
				ids.image
			)
			result.parseStoreSemantics = parseSemantics
			steps.parseStoreSemantics = {
				ok: parseSemantics.ok,
				detail: parseSemantics.detail,
			}
			if (!parseSemantics.ok) {
				errors.push('parsed store did not preserve tracked shape ids/types/bindings/altText')
			}

			// Also load parsed document snapshot into a brand-new store with the same schema.
			const cleanFromParse = createTLStore({ schema: editor.store.schema })
			const parsedSnap = getSnapshot(parsed.value)
			loadSnapshot(cleanFromParse, { document: parsedSnap.document })
			const cleanParseSemantics = assertStoreSemantics(
				sourceRecords,
				recordsFromStore(cleanFromParse),
				ids,
				ids.image
			)
			steps.cleanParseLoadSemantics = {
				ok: cleanParseSemantics.ok,
				detail: cleanParseSemantics.detail,
			}
			if (!cleanParseSemantics.ok) {
				errors.push('clean store from parsed snapshot failed semantic id/type/binding checks')
			}

			// Instantiate a brand-new public Editor around the clean parsed store.
			// This closes the gap between store-only validation and editor-readable semantics.
			const cleanContainer = document.createElement('div')
			cleanContainer.style.cssText =
				'position:fixed;left:-10000px;top:-10000px;width:800px;height:600px'
			document.body.appendChild(cleanContainer)
			let cleanEditor: Editor | null = null
			try {
				cleanEditor = new Editor({
					store: cleanFromParse,
					shapeUtils: [...defaultShapeUtils, EvalBadgeShapeUtil],
					bindingUtils: [...defaultBindingUtils, EvalLinkBindingUtil],
					assetUtils: defaultAssetUtils,
					tools: defaultTools,
					getContainer: () => cleanContainer,
					autoFocus: false,
				})
				const cleanEditorSemantics = assertStoreSemantics(
					sourceRecords,
					cleanEditor.store.allRecords(),
					ids,
					ids.image
				)
				result.cleanEditorSemantics = cleanEditorSemantics
				steps.cleanEditorSemantics = {
					ok: cleanEditorSemantics.ok,
					detail: cleanEditorSemantics.detail,
				}
				if (!cleanEditorSemantics.ok) {
					errors.push('fresh Editor failed semantic id/type/binding/altText checks')
				}
			} finally {
				cleanEditor?.dispose()
				cleanContainer.remove()
			}
		} else {
			const failure = parsed as { ok: false; error: unknown }
			steps.parse = { ok: false, detail: JSON.stringify(failure.error) }
			errors.push('parseTldrawJsonFile failed')
			result.errors = errors
			return result
		}

		// Snapshot APIs on the live editor store.
		const snap = getSnapshot(editor.store)
		result.snapshotKeys = Object.keys(snap)
		steps.snapshot = {
			ok: 'document' in snap,
			detail: result.snapshotKeys.join(','),
		}

		// Load the official snapshot into a clean store configured with the same custom schema.
		const cleanStore = createTLStore({ schema: editor.store.schema })
		loadSnapshot(cleanStore, snap)
		const recordCountOk = cleanStore.allRecords().length === editor.store.allRecords().length
		steps.cleanStoreRecordCount = {
			ok: recordCountOk,
			detail: `records=${cleanStore.allRecords().length}`,
		}
		if (!recordCountOk) errors.push('clean store record count mismatch')

		const cleanSnapshotSemantics = assertStoreSemantics(
			sourceRecords,
			recordsFromStore(cleanStore),
			ids,
			ids.image
		)
		result.cleanSnapshotSemantics = cleanSnapshotSemantics
		steps.cleanSnapshotSemantics = {
			ok: cleanSnapshotSemantics.ok,
			detail: cleanSnapshotSemantics.detail,
		}
		if (!cleanSnapshotSemantics.ok) {
			errors.push('clean snapshot store failed semantic id/type/binding/altText checks')
		}

		// Envelope structural checks (not a substitute for clean-store semantics).
		const envelope = JSON.parse(tldrJson) as {
			tldrawFileFormatVersion: number
			schema: unknown
			records: Array<{ typeName: string; type?: string; id: string; props?: { altText?: string } }>
		}
		const shapeRecords = envelope.records.filter((r) => r.typeName === 'shape')
		const bindingRecords = envelope.records.filter((r) => r.typeName === 'binding')
		const assetRecords = envelope.records.filter((r) => r.typeName === 'asset')
		const hasPipeline = ['eval-ingest', 'eval-process', 'eval-store', 'eval-serve'].every((suffix) =>
			shapeRecords.some((r) => r.id.includes(suffix))
		)
		const imageEnvelope = envelope.records.find((r) => r.id === ids.image)
		const envelopeAltOk =
			typeof imageEnvelope?.props?.altText === 'string' && imageEnvelope.props.altText.trim().length > 0
		steps.semanticEnvelope = {
			ok:
				typeof envelope.tldrawFileFormatVersion === 'number' &&
				!!envelope.schema &&
				Array.isArray(envelope.records) &&
				hasPipeline &&
				bindingRecords.length >= 6 &&
				assetRecords.length >= 1 &&
				envelopeAltOk,
			detail: `shapes=${shapeRecords.length} bindings=${bindingRecords.length} assets=${assetRecords.length} version=${envelope.tldrawFileFormatVersion} alt=${JSON.stringify(imageEnvelope?.props?.altText ?? null)}`,
		}
		if (!steps.semanticEnvelope.ok) errors.push('semantic envelope checks failed')

		// Export SVG / PNG from live editor
		const pageIds = [...editor.getCurrentPageShapeIds()]
		const svg = await editor.getSvgString(pageIds, { background: true })
		steps.exportSvg = {
			ok: Boolean(svg?.svg && svg.svg.includes('<svg')),
			detail: svg ? `len=${svg.svg.length}` : 'undefined',
		}
		result.svgLength = svg?.svg.length

		try {
			const png = await editor.toImage(pageIds, {
				format: 'png',
				background: true,
				pixelRatio: 1,
			})
			result.pngBytes = png.blob.size
			steps.exportPng = { ok: png.blob.size > 0, detail: `bytes=${png.blob.size}` }
		} catch (e) {
			steps.exportPng = {
				ok: false,
				detail: e instanceof Error ? e.message : String(e),
			}
			errors.push('png export failed')
		}

		// Live editor still holds the diagram; name this honestly (not a clean reload).
		const liveInvariants = getDiagramSemanticInvariants(editor, ids)
		result.liveEditorInvariants = liveInvariants
		result.invariantsAfterReload = liveInvariants
		steps.liveEditorInvariants = {
			ok: liveInvariants.ok,
			detail: JSON.stringify(liveInvariants),
		}

		result.ok = Object.values(steps).every((s) => s.ok) && errors.length === 0
	} catch (e) {
		errors.push(e instanceof Error ? e.message : String(e))
		result.ok = false
	}

	result.errors = errors
	return result
}

export async function ensureDiagramAndRoundTrip(editor: Editor): Promise<{
	ids: DiagramIds
	roundTrip: RoundTripResult
}> {
	const ids = createArchitectureDiagram(editor)
	const roundTrip = await runRoundTrip(editor, ids)
	return { ids, roundTrip }
}
