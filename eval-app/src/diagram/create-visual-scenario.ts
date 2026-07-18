import type { Editor, TLAssetId, TLShapeId } from 'tldraw'
import { AssetRecordType, createShapeId, toRichText } from 'tldraw'
import { createArchitectureDiagram, DIAGRAM_IDS } from './create-architecture-diagram'

export const VISUAL_SCENARIOS = [
	'flowchart',
	'architecture',
	'sequence',
	'mind-map',
	'annotated-image',
] as const
export type VisualScenarioName = (typeof VISUAL_SCENARIOS)[number]

export interface VisualScenarioResult {
	ok: boolean
	name: VisualScenarioName
	shapeCount: number
	bindingCount: number
	arrowCount: number
	allArrowsBound: boolean
	overlapPairs: string[]
	detail: string
}

type NodeSpec = {
	id: TLShapeId
	x: number
	y: number
	w: number
	h: number
	label: string
	geo?: 'rectangle' | 'ellipse' | 'diamond' | 'hexagon' | 'cloud'
	color?: 'blue' | 'green' | 'orange' | 'violet' | 'red' | 'grey' | 'yellow'
}

function id(scenario: string, suffix: string): TLShapeId {
	return createShapeId(`visual-${scenario}-${suffix}`)
}

function clearPage(editor: Editor) {
	const ids = [...editor.getCurrentPageShapeIds()]
	if (ids.length) editor.deleteShapes(ids)
}

function title(editor: Editor, scenario: string, label: string) {
	editor.createShape({
		id: id(scenario, 'title'),
		type: 'text',
		x: 80,
		y: 45,
		props: { richText: toRichText(label), size: 'xl', font: 'sans', color: 'black' },
	})
}

function node(editor: Editor, spec: NodeSpec) {
	editor.createShape({
		id: spec.id,
		type: 'geo',
		x: spec.x,
		y: spec.y,
		props: {
			w: spec.w,
			h: spec.h,
			geo: spec.geo ?? 'rectangle',
			color: spec.color ?? 'blue',
			fill: 'semi',
			richText: toRichText(spec.label),
			align: 'middle',
			verticalAlign: 'middle',
			size: 'm',
		},
	})
}

function connect(
	editor: Editor,
	scenario: string,
	suffix: string,
	from: NodeSpec,
	to: NodeSpec,
	label = ''
): TLShapeId {
	const arrowId = id(scenario, `arrow-${suffix}`)
	const start = { x: from.x + from.w / 2, y: from.y + from.h / 2 }
	const end = { x: to.x + to.w / 2, y: to.y + to.h / 2 }
	editor.createShape({
		id: arrowId,
		type: 'arrow',
		x: start.x,
		y: start.y,
		props: {
			start: { x: 0, y: 0 },
			end: { x: end.x - start.x, y: end.y - start.y },
			arrowheadEnd: 'arrow',
			color: 'grey',
			size: 'm',
			richText: toRichText(label),
		},
	})
	editor.createBindings([
		{
			type: 'arrow',
			fromId: arrowId,
			toId: from.id,
			props: {
				terminal: 'start',
				normalizedAnchor: { x: 0.5, y: 0.5 },
				isExact: false,
				isPrecise: true,
			},
		},
		{
			type: 'arrow',
			fromId: arrowId,
			toId: to.id,
			props: {
				terminal: 'end',
				normalizedAnchor: { x: 0.5, y: 0.5 },
				isExact: false,
				isPrecise: true,
			},
		},
	])
	return arrowId
}

function createFlowchart(editor: Editor): { nodes: TLShapeId[]; arrows: TLShapeId[] } {
	const scenario = 'flowchart'
	title(editor, scenario, 'Incident intake flow')
	const nodes: NodeSpec[] = [
		{ id: id(scenario, 'start'), x: 80, y: 260, w: 150, h: 78, label: 'Report', geo: 'ellipse', color: 'green' },
		{ id: id(scenario, 'triage'), x: 330, y: 260, w: 170, h: 78, label: 'Triage', color: 'blue' },
		{ id: id(scenario, 'decision'), x: 600, y: 245, w: 150, h: 108, label: 'Critical?', geo: 'diamond', color: 'orange' },
		{ id: id(scenario, 'resolve'), x: 850, y: 150, w: 180, h: 78, label: 'Page on-call', color: 'red' },
		{ id: id(scenario, 'queue'), x: 850, y: 370, w: 180, h: 78, label: 'Queue fix', color: 'violet' },
	]
	nodes.forEach((item) => node(editor, item))
	const arrows = [
		connect(editor, scenario, '1', nodes[0], nodes[1]),
		connect(editor, scenario, '2', nodes[1], nodes[2]),
		connect(editor, scenario, '3', nodes[2], nodes[3], 'yes'),
		connect(editor, scenario, '4', nodes[2], nodes[4], 'no'),
	]
	return { nodes: nodes.map((item) => item.id), arrows }
}

function createMindMap(editor: Editor): { nodes: TLShapeId[]; arrows: TLShapeId[] } {
	const scenario = 'mind-map'
	title(editor, scenario, 'Local AI system map')
	const center: NodeSpec = { id: id(scenario, 'center'), x: 485, y: 285, w: 190, h: 110, label: 'Local AI', geo: 'ellipse', color: 'violet' }
	const branches: NodeSpec[] = [
		{ id: id(scenario, 'models'), x: 110, y: 130, w: 200, h: 78, label: 'Models', color: 'blue' },
		{ id: id(scenario, 'runtime'), x: 850, y: 130, w: 200, h: 78, label: 'Runtime', color: 'green' },
		{ id: id(scenario, 'data'), x: 110, y: 490, w: 200, h: 78, label: 'Private data', color: 'orange' },
		{ id: id(scenario, 'evals'), x: 850, y: 490, w: 200, h: 78, label: 'Evaluation', color: 'red' },
	]
	;[center, ...branches].forEach((item) => node(editor, item))
	const arrows = branches.map((branch, index) => connect(editor, scenario, `${index + 1}`, center, branch))
	return { nodes: [center.id, ...branches.map((item) => item.id)], arrows }
}

function createSequence(editor: Editor): { nodes: TLShapeId[]; arrows: TLShapeId[] } {
	const scenario = 'sequence'
	title(editor, scenario, 'Authenticated sync sequence')
	const actors: NodeSpec[] = [
		{ id: id(scenario, 'client'), x: 100, y: 115, w: 180, h: 70, label: 'Client', color: 'blue' },
		{ id: id(scenario, 'auth'), x: 490, y: 115, w: 180, h: 70, label: 'Auth service', color: 'violet' },
		{ id: id(scenario, 'room'), x: 880, y: 115, w: 180, h: 70, label: 'Sync room', color: 'green' },
	]
	actors.forEach((item) => node(editor, item))
	// Slim lifelines are visual guides; message endpoints are bound event nodes.
	actors.forEach((actor, index) => {
		editor.createShape({
			id: id(scenario, `lifeline-${index}`),
			type: 'geo',
			x: actor.x + actor.w / 2 - 2,
			y: 205,
			props: { w: 4, h: 390, geo: 'rectangle', color: 'grey', fill: 'solid' },
		})
	})
	const event = (suffix: string, x: number, y: number): NodeSpec => ({
		id: id(scenario, suffix), x, y, w: 14, h: 14, label: '', geo: 'ellipse', color: 'grey',
	})
	const events = [
		event('e1a', 183, 270), event('e1b', 573, 270),
		event('e2a', 573, 370), event('e2b', 963, 370),
		event('e3a', 963, 470), event('e3b', 183, 470),
	]
	events.forEach((item) => node(editor, item))
	const arrows = [
		connect(editor, scenario, '1', events[0], events[1], 'authorize'),
		connect(editor, scenario, '2', events[2], events[3], 'join room'),
		connect(editor, scenario, '3', events[4], events[5], 'snapshot'),
	]
	return { nodes: [...actors.map((item) => item.id), ...events.map((item) => item.id)], arrows }
}

function createAnnotatedImage(editor: Editor): { nodes: TLShapeId[]; arrows: TLShapeId[] } {
	const scenario = 'annotated-image'
	title(editor, scenario, 'Annotated deployment dashboard')
	const assetId: TLAssetId = AssetRecordType.createId('visual-dashboard')
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="460" viewBox="0 0 800 460"><rect width="800" height="460" rx="22" fill="#f8fafc"/><rect x="30" y="30" width="740" height="70" rx="12" fill="#dbeafe"/><rect x="30" y="125" width="355" height="140" rx="12" fill="#dcfce7"/><rect x="415" y="125" width="355" height="140" rx="12" fill="#ffedd5"/><rect x="30" y="290" width="740" height="135" rx="12" fill="#ede9fe"/><text x="55" y="75" font-family="sans-serif" font-size="30" fill="#1e3a8a">Release health</text><text x="55" y="185" font-family="sans-serif" font-size="28" fill="#166534">99.98% availability</text><text x="440" y="185" font-family="sans-serif" font-size="28" fill="#9a3412">3 alerts</text><text x="55" y="350" font-family="sans-serif" font-size="28" fill="#5b21b6">Latency p95: 184 ms</text></svg>`
	if (!editor.getAsset(assetId)) {
		editor.createAssets([{
			id: assetId,
			typeName: 'asset',
			type: 'image',
			props: { w: 800, h: 460, name: 'deployment-dashboard.svg', isAnimated: false, mimeType: 'image/svg+xml', src: `data:image/svg+xml,${encodeURIComponent(svg)}` },
			meta: { trustedFixture: true },
		}])
	}
	const image: NodeSpec = { id: id(scenario, 'image'), x: 245, y: 135, w: 720, h: 414, label: '' }
	editor.createShape({
		id: image.id,
		type: 'image',
		x: image.x,
		y: image.y,
		props: { w: image.w, h: image.h, assetId, crop: null, flipX: false, flipY: false, playing: false, url: '', altText: 'Deployment dashboard with availability, alert, and latency panels' },
	})
	const notes: NodeSpec[] = [
		{ id: id(scenario, 'note-availability'), x: 20, y: 205, w: 180, h: 76, label: '1  Availability healthy', color: 'green' },
		{ id: id(scenario, 'note-alerts'), x: 1010, y: 230, w: 180, h: 76, label: '2  Alerts need review', color: 'orange' },
		{ id: id(scenario, 'note-latency'), x: 1010, y: 455, w: 180, h: 76, label: '3  Latency in budget', color: 'violet' },
	]
	notes.forEach((item) => node(editor, item))
	const arrows = notes.map((note, index) => connect(editor, scenario, `${index + 1}`, note, image))
	return { nodes: [image.id, ...notes.map((item) => item.id)], arrows }
}

function overlapPairs(editor: Editor, ids: TLShapeId[]): string[] {
	const pairs: string[] = []
	for (let a = 0; a < ids.length; a += 1) {
		const boundsA = editor.getShapePageBounds(ids[a])
		if (!boundsA) continue
		for (let b = a + 1; b < ids.length; b += 1) {
			const boundsB = editor.getShapePageBounds(ids[b])
			if (!boundsB) continue
			const overlaps = !(
				boundsA.maxX <= boundsB.minX || boundsB.maxX <= boundsA.minX ||
				boundsA.maxY <= boundsB.minY || boundsB.maxY <= boundsA.minY
			)
			if (overlaps) pairs.push(`${ids[a]}::${ids[b]}`)
		}
	}
	return pairs
}

export function parseVisualScenario(value: string | null): VisualScenarioName | null {
	return VISUAL_SCENARIOS.includes(value as VisualScenarioName) ? (value as VisualScenarioName) : null
}

export function createVisualScenario(editor: Editor, name: VisualScenarioName): VisualScenarioResult {
	clearPage(editor)
	let built: { nodes: TLShapeId[]; arrows: TLShapeId[] }
	if (name === 'architecture') {
		createArchitectureDiagram(editor)
		built = {
			nodes: [DIAGRAM_IDS.ingest, DIAGRAM_IDS.process, DIAGRAM_IDS.store, DIAGRAM_IDS.serve, DIAGRAM_IDS.note, DIAGRAM_IDS.image],
			arrows: [DIAGRAM_IDS.arrow1, DIAGRAM_IDS.arrow2, DIAGRAM_IDS.arrow3],
		}
	} else if (name === 'flowchart') {
		built = createFlowchart(editor)
	} else if (name === 'sequence') {
		built = createSequence(editor)
	} else if (name === 'mind-map') {
		built = createMindMap(editor)
	} else {
		built = createAnnotatedImage(editor)
	}
	const pairs = overlapPairs(editor, built.nodes)
	const allArrowsBound = built.arrows.every(
		(arrowId) => editor.getBindingsFromShape(arrowId, 'arrow').length === 2
	)
	const bindingCount = editor.store.allRecords().filter((record) => record.typeName === 'binding').length
	editor.setSelectedShapes([])
	editor.setCurrentTool('select')
	editor.zoomToFit({ animation: { duration: 0 } })
	const shapeCount = editor.getCurrentPageShapes().length
	const ok = shapeCount > built.nodes.length && allArrowsBound && pairs.length === 0
	return {
		ok,
		name,
		shapeCount,
		bindingCount,
		arrowCount: built.arrows.length,
		allArrowsBound,
		overlapPairs: pairs,
		detail: `shapes=${shapeCount} arrows=${built.arrows.length} bindings=${bindingCount} overlaps=${pairs.length}`,
	}
}
