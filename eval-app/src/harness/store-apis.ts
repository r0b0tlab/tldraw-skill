/**
 * Standalone snapshot/listen/run/undo-redo + readonly rejection (public APIs).
 */

import {
	createShapeId,
	createTLStore,
	getSnapshot,
	loadSnapshot,
	type Editor,
	type TLShapeId,
} from 'tldraw'

export interface StoreApisResult {
	ok: boolean
	standaloneSnapshot: boolean
	storeListen: boolean
	storeListenCleanup: boolean
	editorRun: boolean
	undoRedo: boolean
	readonlyRejection: boolean
	detail: string
	steps: Record<string, { ok: boolean; detail?: string }>
}

function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestAnimationFrame === 'function') {
			requestAnimationFrame(() => resolve())
		} else {
			setTimeout(resolve, 16)
		}
	})
}

export async function runStoreApis(editor: Editor): Promise<StoreApisResult> {
	const steps: StoreApisResult['steps'] = {}
	const errors: string[] = []
	const tempId: TLShapeId = createShapeId('eval-store-api-temp')

	const cleanupTemp = () => {
		if (editor.getShape(tempId)) {
			editor.deleteShapes([tempId])
		}
	}

	try {
		// 1) Standalone getSnapshot / loadSnapshot (not editor.getSnapshot).
		const snap = getSnapshot(editor.store)
		const clean = createTLStore({ schema: editor.store.schema })
		loadSnapshot(clean, snap)
		const standaloneOk =
			'document' in snap &&
			clean.allRecords().length === editor.store.allRecords().length
		steps.standaloneSnapshot = {
			ok: standaloneOk,
			detail: `keys=${Object.keys(snap).join(',')} records=${clean.allRecords().length}`,
		}
		if (!standaloneOk) errors.push('standalone snapshot failed')

		// 2) store.listen event + cleanup unsubscribe.
		// Listeners flush on the next animation frame (store history reactor).
		if (editor.getShape(tempId)) {
			editor.deleteShapes([tempId])
			await nextFrame()
		}
		let listenCount = 0
		const unlisten = editor.store.listen(
			() => {
				listenCount += 1
			},
			{ source: 'all', scope: 'all' }
		)
		editor.createShape({
			id: tempId,
			type: 'geo',
			x: 8,
			y: 8,
			props: { w: 40, h: 40, geo: 'rectangle' },
		})
		// Force a second user mutation in case create was coalesced oddly.
		editor.updateShapes([
			{
				id: tempId,
				type: 'geo',
				x: 9,
			},
		])
		await nextFrame()
		await nextFrame()
		const heard = listenCount > 0
		steps.storeListen = { ok: heard, detail: `events=${listenCount}` }
		if (!heard) errors.push('store.listen did not fire')

		const countAfterListen = listenCount
		unlisten()
		// Mutate again; cleaned listener must not fire.
		editor.updateShape({
			id: tempId,
			type: 'geo',
			props: { w: 48, h: 48 },
		})
		await nextFrame()
		await nextFrame()
		const cleaned = listenCount === countAfterListen
		steps.storeListenCleanup = {
			ok: cleaned,
			detail: `before=${countAfterListen} after=${listenCount}`,
		}
		if (!cleaned) errors.push('store.listen cleanup failed')

		// 3) editor.run mutation batch.
		const runId = createShapeId('eval-store-run')
		editor.run(() => {
			editor.createShape({
				id: runId,
				type: 'geo',
				x: 16,
				y: 16,
				props: { w: 32, h: 32, geo: 'ellipse', color: 'green' },
			})
			editor.setSelectedShapes([runId])
		})
		const runOk = Boolean(editor.getShape(runId)) && editor.getSelectedShapeIds()[0] === runId
		steps.editorRun = { ok: runOk, detail: runOk ? 'batched create+select' : 'missing' }
		if (!runOk) errors.push('editor.run failed')
		if (editor.getShape(runId)) editor.deleteShapes([runId])
		editor.setSelectedShapes([])

		// 4) undo / redo
		const undoId = createShapeId('eval-store-undo')
		editor.markHistoryStoppingPoint('eval-undo-start')
		editor.createShape({
			id: undoId,
			type: 'geo',
			x: 24,
			y: 24,
			props: { w: 36, h: 36, geo: 'diamond', color: 'orange' },
		})
		const createdForUndo = Boolean(editor.getShape(undoId))
		editor.undo()
		const afterUndo = !editor.getShape(undoId)
		editor.redo()
		const afterRedo = Boolean(editor.getShape(undoId))
		const undoRedoOk = createdForUndo && afterUndo && afterRedo
		steps.undoRedo = {
			ok: undoRedoOk,
			detail: `created=${createdForUndo} undo=${afterUndo} redo=${afterRedo}`,
		}
		if (!undoRedoOk) errors.push('undo/redo failed')
		if (editor.getShape(undoId)) editor.deleteShapes([undoId])

		// 5) Readonly rejection: document mutations must not apply.
		cleanupTemp()
		const beforeIds = new Set(editor.getCurrentPageShapeIds())
		editor.updateInstanceState({ isReadonly: true })
		const readonlyFlag = editor.getIsReadonly() === true
		let threw = false
		try {
			editor.createShape({
				id: tempId,
				type: 'geo',
				x: 4,
				y: 4,
				props: { w: 20, h: 20, geo: 'rectangle' },
			})
		} catch {
			threw = true
		}
		const afterIds = new Set(editor.getCurrentPageShapeIds())
		const shapeNotCreated = !editor.getShape(tempId) && afterIds.size === beforeIds.size
		// Public capability scoped: getIsReadonly + blocked create (throw or no-op).
		const readonlyOk = readonlyFlag && (threw || shapeNotCreated)
		steps.readonlyRejection = {
			ok: readonlyOk,
			detail: `isReadonly=${readonlyFlag} threw=${threw} blocked=${shapeNotCreated}`,
		}
		if (!readonlyOk) errors.push('readonly rejection failed')
		editor.updateInstanceState({ isReadonly: false })
		cleanupTemp()

		const ok = Object.values(steps).every((s) => s.ok) && errors.length === 0
		return {
			ok,
			standaloneSnapshot: Boolean(steps.standaloneSnapshot?.ok),
			storeListen: Boolean(steps.storeListen?.ok),
			storeListenCleanup: Boolean(steps.storeListenCleanup?.ok),
			editorRun: Boolean(steps.editorRun?.ok),
			undoRedo: Boolean(steps.undoRedo?.ok),
			readonlyRejection: Boolean(steps.readonlyRejection?.ok),
			detail: ok ? 'store APIs exercised' : errors.join('; '),
			steps,
		}
	} catch (e) {
		try {
			editor.updateInstanceState({ isReadonly: false })
		} catch {
			/* ignore */
		}
		cleanupTemp()
		const msg = e instanceof Error ? e.message : String(e)
		return {
			ok: false,
			standaloneSnapshot: Boolean(steps.standaloneSnapshot?.ok),
			storeListen: Boolean(steps.storeListen?.ok),
			storeListenCleanup: Boolean(steps.storeListenCleanup?.ok),
			editorRun: Boolean(steps.editorRun?.ok),
			undoRedo: Boolean(steps.undoRedo?.ok),
			readonlyRejection: Boolean(steps.readonlyRejection?.ok),
			detail: msg,
			steps,
		}
	}
}
