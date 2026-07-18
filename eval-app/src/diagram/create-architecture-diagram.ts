/**
 * Deterministic architecture diagram using public Editor APIs only.
 * Built-in shapes: geo, arrow (bound), frame, group, note, text, draw, image asset.
 */

import type { Editor, TLShapeId } from 'tldraw'
import {
	AssetRecordType,
	b64Vecs,
	createShapeId,
	toRichText,
} from 'tldraw'

export interface DiagramIds {
	frame: TLShapeId
	ingest: TLShapeId
	process: TLShapeId
	store: TLShapeId
	serve: TLShapeId
	arrow1: TLShapeId
	arrow2: TLShapeId
	arrow3: TLShapeId
	note: TLShapeId
	title: TLShapeId
	draw: TLShapeId
	image: TLShapeId
	groupA: TLShapeId
	groupB: TLShapeId
	evalBadge: TLShapeId
}

export const DIAGRAM_IDS: DiagramIds = {
	frame: createShapeId('eval-frame'),
	ingest: createShapeId('eval-ingest'),
	process: createShapeId('eval-process'),
	store: createShapeId('eval-store'),
	serve: createShapeId('eval-serve'),
	arrow1: createShapeId('eval-arrow-1'),
	arrow2: createShapeId('eval-arrow-2'),
	arrow3: createShapeId('eval-arrow-3'),
	note: createShapeId('eval-note'),
	title: createShapeId('eval-title'),
	draw: createShapeId('eval-draw'),
	image: createShapeId('eval-image'),
	groupA: createShapeId('eval-group-a'),
	groupB: createShapeId('eval-group-b'),
	evalBadge: createShapeId('eval-badge'),
}

const BOX_W = 160
const BOX_H = 80
const GAP = 130
const ORIGIN_X = 120
const ORIGIN_Y = 160

function geoBox(
	id: TLShapeId,
	x: number,
	y: number,
	label: string,
	geo: 'rectangle' | 'ellipse' | 'diamond' | 'hexagon' = 'rectangle',
	color: 'blue' | 'green' | 'orange' | 'violet' | 'red' = 'blue'
) {
	return {
		id,
		type: 'geo' as const,
		x,
		y,
		props: {
			w: BOX_W,
			h: BOX_H,
			geo,
			color,
			fill: 'semi' as const,
			richText: toRichText(label),
			align: 'middle' as const,
			verticalAlign: 'middle' as const,
			size: 'm' as const,
		},
	}
}

/**
 * Create a polished, deterministic diagram. Idempotent for fixed IDs if shapes already exist.
 */
export function createArchitectureDiagram(editor: Editor): DiagramIds {
	const ids = DIAGRAM_IDS

	// Clear previous eval shapes if re-running
	const existing = Object.values(ids).filter((id) => editor.getShape(id))
	if (existing.length) {
		editor.deleteShapes(existing)
	}

	const x0 = ORIGIN_X
	const y0 = ORIGIN_Y
	const x1 = x0 + BOX_W + GAP
	const x2 = x1 + BOX_W + GAP
	const x3 = x2 + BOX_W + GAP

	// Inline SVG asset — deterministic, readable, and network-free.
	const assetId = AssetRecordType.createId('eval-check-icon')
	const dataUrl =
		'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"%3E%3Crect width="64" height="64" rx="14" fill="%23dbeafe"/%3E%3Cpath d="M17 33l10 10 21-24" fill="none" stroke="%232563eb" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/%3E%3C/svg%3E'

	editor.run(() => {
		if (!editor.getAsset(assetId)) {
			editor.createAssets([
				{
					id: assetId,
					typeName: 'asset',
					type: 'image',
					props: {
						w: 64,
						h: 64,
						name: 'eval-check.svg',
						isAnimated: false,
						mimeType: 'image/svg+xml',
						src: dataUrl,
					},
					meta: { provenance: 'eval-app-fixture' },
				},
			])
		}

		// Frame containing the pipeline
		editor.createShapes([
			{
				id: ids.frame,
				type: 'frame',
				x: x0 - 40,
				y: y0 - 100,
				props: {
					w: (BOX_W + GAP) * 3 + BOX_W + 80,
					h: BOX_H + 360,
					name: 'Data pipeline',
				},
			},
			{
				id: ids.title,
				type: 'text',
				x: x0,
				y: y0 - 70,
				props: {
					richText: toRichText('tldraw eval: architecture pipeline'),
					size: 'l',
					font: 'sans',
					color: 'black',
				},
			},
			geoBox(ids.ingest, x0, y0, 'Ingest', 'rectangle', 'blue'),
			geoBox(ids.process, x1, y0, 'Process', 'hexagon', 'violet'),
			geoBox(ids.store, x2, y0, 'Store', 'ellipse', 'green'),
			geoBox(ids.serve, x3, y0, 'Serve', 'diamond', 'orange'),
			// Bound arrows (created then bound via public createBindings)
			{
				id: ids.arrow1,
				type: 'arrow',
				x: x0 + BOX_W / 2,
				y: y0 + BOX_H / 2,
				props: {
					start: { x: 0, y: 0 },
					end: { x: GAP + BOX_W / 2, y: 0 },
					color: 'grey',
					size: 'm',
					arrowheadEnd: 'arrow',
					richText: toRichText('raw'),
				},
			},
			{
				id: ids.arrow2,
				type: 'arrow',
				x: x1 + BOX_W / 2,
				y: y0 + BOX_H / 2,
				props: {
					start: { x: 0, y: 0 },
					end: { x: GAP + BOX_W / 2, y: 0 },
					color: 'grey',
					size: 'm',
					arrowheadEnd: 'arrow',
					richText: toRichText('clean'),
				},
			},
			{
				id: ids.arrow3,
				type: 'arrow',
				x: x2 + BOX_W / 2,
				y: y0 + BOX_H / 2,
				props: {
					start: { x: 0, y: 0 },
					end: { x: GAP + BOX_W / 2, y: 0 },
					color: 'grey',
					size: 'm',
					arrowheadEnd: 'arrow',
					richText: toRichText('query'),
				},
			},
			{
				id: ids.note,
				type: 'note',
				x: x0,
				y: y0 + BOX_H + 40,
				props: {
					richText: toRichText('Note: arrows use public createBindings, not visual overlap.'),
					color: 'yellow',
					size: 's',
				},
			},
			{
				id: ids.draw,
				type: 'draw',
				x: x0 + 190,
				y: y0 + BOX_H + 75,
				props: {
					segments: [
						{
							type: 'free',
							path: b64Vecs.encodePoints([
								{ x: 0, y: 20, z: 0.5 },
								{ x: 22, y: 42, z: 0.5 },
								{ x: 70, y: 0, z: 0.5 },
							]),
						},
					],
					color: 'green',
					size: 'm',
					fill: 'none',
					isComplete: true,
					isClosed: false,
					isPen: false,
				},
			},
			{
				id: ids.image,
				type: 'image',
				x: x2,
				y: y0 + BOX_H + 40,
				props: {
					w: 48,
					h: 48,
					assetId,
					crop: null,
					flipX: false,
					flipY: false,
					playing: false,
					url: '',
					altText: 'Pipeline validation check icon',
				},
			},
		])

		// Parent pipeline nodes under the frame for hierarchy
		for (const id of [ids.ingest, ids.process, ids.store, ids.serve, ids.title, ids.arrow1, ids.arrow2, ids.arrow3]) {
			const shape = editor.getShape(id)
			if (shape) {
				editor.reparentShapes([id], ids.frame)
			}
		}

		editor.createBindings([
			{
				type: 'arrow',
				fromId: ids.arrow1,
				toId: ids.ingest,
				props: {
					terminal: 'start',
					normalizedAnchor: { x: 1, y: 0.5 },
					isExact: false,
					isPrecise: true,
				},
			},
			{
				type: 'arrow',
				fromId: ids.arrow1,
				toId: ids.process,
				props: {
					terminal: 'end',
					normalizedAnchor: { x: 0, y: 0.5 },
					isExact: false,
					isPrecise: true,
				},
			},
			{
				type: 'arrow',
				fromId: ids.arrow2,
				toId: ids.process,
				props: {
					terminal: 'start',
					normalizedAnchor: { x: 1, y: 0.5 },
					isExact: false,
					isPrecise: true,
				},
			},
			{
				type: 'arrow',
				fromId: ids.arrow2,
				toId: ids.store,
				props: {
					terminal: 'end',
					normalizedAnchor: { x: 0, y: 0.5 },
					isExact: false,
					isPrecise: true,
				},
			},
			{
				type: 'arrow',
				fromId: ids.arrow3,
				toId: ids.store,
				props: {
					terminal: 'start',
					normalizedAnchor: { x: 1, y: 0.5 },
					isExact: false,
					isPrecise: true,
				},
			},
			{
				type: 'arrow',
				fromId: ids.arrow3,
				toId: ids.serve,
				props: {
					terminal: 'end',
					normalizedAnchor: { x: 0, y: 0.5 },
					isExact: false,
					isPrecise: true,
				},
			},
		])

		// Group note + draw as annotation cluster
		editor.groupShapes([ids.note, ids.draw], { groupId: ids.groupA })

		// Custom eval badge if registered
		try {
			editor.createShape({
				id: ids.evalBadge,
				type: 'eval-badge',
				x: x3 + 40,
				y: y0 - 70,
				props: { w: 140, h: 36, label: 'EVAL 5.2.5' },
			})
		} catch {
			// custom shape not registered — skip
		}
	})

	editor.zoomToFit({ animation: { duration: 0 } })
	return ids
}

export function getDiagramSemanticInvariants(editor: Editor, ids: DiagramIds = DIAGRAM_IDS) {
	const shapes = {
		frame: editor.getShape(ids.frame),
		ingest: editor.getShape(ids.ingest),
		process: editor.getShape(ids.process),
		store: editor.getShape(ids.store),
		serve: editor.getShape(ids.serve),
		arrow1: editor.getShape(ids.arrow1),
		arrow2: editor.getShape(ids.arrow2),
		arrow3: editor.getShape(ids.arrow3),
		note: editor.getShape(ids.note),
		title: editor.getShape(ids.title),
	}

	const bindingsToProcess = editor.getBindingsToShape(ids.process, 'arrow')
	const bindingsFromArrow1 = editor.getBindingsFromShape(ids.arrow1, 'arrow')

	const missing = Object.entries(shapes)
		.filter(([, s]) => !s)
		.map(([k]) => k)

	return {
		ok: missing.length === 0 && bindingsFromArrow1.length >= 2 && bindingsToProcess.length >= 1,
		missing,
		types: Object.fromEntries(
			Object.entries(shapes).map(([k, s]) => [k, s?.type ?? null])
		),
		arrow1BindingCount: bindingsFromArrow1.length,
		processIncomingBindings: bindingsToProcess.length,
		pageShapeCount: editor.getCurrentPageShapes().length,
		assetCount: editor.getAssets().length,
	}
}
