/**
 * Mermaid branch — runtime verified when @tldraw/mermaid loads in the browser.
 */

import type { Editor } from 'tldraw'

export async function runMermaidExample(editor: Editor): Promise<{
	ok: boolean
	runtime: boolean
	detail: string
	createdShapeCountDelta: number
}> {
	const before = editor.getCurrentPageShapes().length
	try {
		const { createMermaidDiagram } = await import('@tldraw/mermaid')
		await createMermaidDiagram(
			editor,
			`
flowchart LR
  A[Client] --> B[API]
  B --> C[(DB)]
`,
			{
				blueprintRender: {
					position: { x: 120, y: 520 },
					centerOnPosition: false,
				},
			}
		)
		const after = editor.getCurrentPageShapes().length
		return {
			ok: after > before,
			runtime: true,
			detail: `mermaid shapes delta=${after - before}`,
			createdShapeCountDelta: after - before,
		}
	} catch (e) {
		return {
			ok: false,
			runtime: false,
			detail: e instanceof Error ? e.message : String(e),
			createdShapeCountDelta: 0,
		}
	}
}
