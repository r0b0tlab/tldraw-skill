import {
	Tldraw,
	createShapeId,
	getSnapshot,
	toRichText,
	type Editor,
} from 'tldraw'

/**
 * Compiled counterpart to tests/fixtures/stale-api-before.txt.
 * Keeps repaired v5 public API families under TypeScript coverage.
 */
export async function exerciseRepairedApis(editor: Editor) {
	const snapshot = getSnapshot(editor.store)
	const shapeId = createShapeId('stale-repair-current')

	editor.run(() => {
		editor.createShape({
			id: shapeId,
			type: 'geo',
			x: 0,
			y: 0,
			props: {
				geo: 'rectangle',
				w: 160,
				h: 80,
				richText: toRichText('Current label'),
			},
		})
		editor.setSelectedShapes([shapeId])
	})

	const image = await editor.toImage([shapeId], { format: 'png' })
	return { snapshot, pngBytes: image.blob.size }
}

export function RepairedThemeExample() {
	return (
		<div style={{ position: 'fixed', inset: 0 }}>
			<Tldraw colorScheme="light" />
		</div>
	)
}
