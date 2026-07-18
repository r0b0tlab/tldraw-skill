/**
 * Minimal custom tool with a child idle state (StateNode).
 * Registered via tools prop for typecheck + runtime presence.
 */

import { StateNode, type TLEventHandlers, type TLStateNodeConstructor } from 'tldraw'
import { EVAL_BADGE_TYPE } from './EvalBadgeShapeUtil'

class EvalBadgeIdle extends StateNode {
	static override id = 'idle'

	override onPointerDown: TLEventHandlers['onPointerDown'] = (info) => {
		if (info.target === 'canvas') {
			const { currentPagePoint } = this.editor.inputs
			this.editor.createShape({
				type: EVAL_BADGE_TYPE,
				x: currentPagePoint.x,
				y: currentPagePoint.y,
				props: { w: 120, h: 32, label: 'NEW BADGE' },
			})
		}
	}

	override onCancel = () => {
		this.editor.setCurrentTool('select')
	}
}

export class EvalBadgeTool extends StateNode {
	static override id = 'eval-badge'
	static override initial = 'idle'
	static override children(): TLStateNodeConstructor[] {
		return [EvalBadgeIdle]
	}

	override onEnter = () => {
		this.editor.setCursor({ type: 'cross', rotation: 0 })
	}
}
