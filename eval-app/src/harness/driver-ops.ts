/**
 * Real @tldraw/driver exercise: construct → create → select → transform → dispose.
 * Uses only public Driver + Editor APIs.
 */

import { Driver } from '@tldraw/driver'
import { createShapeId, type Editor, type TLShapeId } from 'tldraw'

export interface DriverOpsResult {
	ok: boolean
	constructed: boolean
	created: boolean
	selected: boolean
	transformed: boolean
	disposed: boolean
	createdShapeId?: string
	operations: string[]
	detail: string
}

export function runDriverOps(editor: Editor): DriverOpsResult {
	const operations: string[] = []
	const result: DriverOpsResult = {
		ok: false,
		constructed: false,
		created: false,
		selected: false,
		transformed: false,
		disposed: false,
		operations,
		detail: '',
	}

	let driver: Driver | null = null
	const shapeId: TLShapeId = createShapeId('eval-driver-geo')

	try {
		// Clean any leftover from a prior run (same fixed id).
		if (editor.getShape(shapeId)) {
			editor.deleteShapes([shapeId])
		}

		driver = new Driver(editor)
		result.constructed = true
		operations.push('construct')

		// Create via Editor while Driver side-effect tracker is live.
		editor.setCurrentTool('select')
		editor.createShape({
			id: shapeId,
			type: 'geo',
			x: 40,
			y: 40,
			props: {
				w: 100,
				h: 80,
				geo: 'rectangle',
				color: 'light-blue',
				fill: 'semi',
			},
		})
		const created = editor.getShape(shapeId)
		const tracked = driver.getLastCreatedShapes(5).some((s) => s.id === shapeId)
		result.created = Boolean(created) && tracked
		result.createdShapeId = shapeId
		operations.push(result.created ? 'create' : 'create-failed')

		// Select the created shape (public Editor selection API).
		editor.setSelectedShapes([shapeId])
		const selectedIds = editor.getSelectedShapeIds()
		result.selected = selectedIds.length === 1 && selectedIds[0] === shapeId
		operations.push(result.selected ? 'select' : 'select-failed')

		// Transform via Driver selection helpers (page space).
		const before = editor.getShape(shapeId)
		if (!before) {
			throw new Error('driver create shape missing before transform')
		}
		const beforeX = before.x
		const beforeY = before.y
		driver.translateSelection(36, 18)
		const after = editor.getShape(shapeId)
		result.transformed =
			Boolean(after) &&
			(Math.abs((after?.x ?? beforeX) - beforeX) > 0.5 ||
				Math.abs((after?.y ?? beforeY) - beforeY) > 0.5)
		operations.push(result.transformed ? 'transform' : 'transform-failed')

		driver.dispose()
		result.disposed = true
		driver = null
		operations.push('dispose')

		// Best-effort cleanup so diagram invariants stay clean.
		if (editor.getShape(shapeId)) {
			editor.deleteShapes([shapeId])
			operations.push('cleanup')
		}
		editor.setSelectedShapes([])
		editor.setCurrentTool('select')

		result.ok =
			result.constructed &&
			result.created &&
			result.selected &&
			result.transformed &&
			result.disposed
		result.detail = result.ok
			? `Driver ops: ${operations.join('→')}`
			: `Driver ops incomplete: ${operations.join('→')}`
	} catch (e) {
		result.detail = e instanceof Error ? e.message : String(e)
		try {
			driver?.dispose()
			result.disposed = true
			operations.push('dispose-on-error')
		} catch {
			/* ignore */
		}
		try {
			if (editor.getShape(shapeId)) editor.deleteShapes([shapeId])
		} catch {
			/* ignore */
		}
	}

	result.operations = operations
	return result
}
