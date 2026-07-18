import { TLShapeId } from 'tldraw'
import { HighlightEvalAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * Custom action: mark an existing shape for evaluation review via meta flag.
 * Sanitizes shape IDs through AgentHelpers (nonexistent → drop).
 */
export const HighlightEvalActionUtil = registerActionUtil(
	class HighlightEvalActionUtil extends AgentActionUtil<HighlightEvalAction> {
		static override type = 'highlight-eval' as const

		override getInfo(action: Streaming<HighlightEvalAction>) {
			return {
				icon: 'target' as const,
				description: action.intent ?? `highlight ${action.color ?? ''}`.trim(),
			}
		}

		override sanitizeAction(action: Streaming<HighlightEvalAction>, helpers: AgentHelpers) {
			if (!action.complete) return action
			if (!action.shapeId) return null
			const shapeId = helpers.ensureShapeIdExists(action.shapeId)
			if (!shapeId) return null
			action.shapeId = shapeId
			return action
		}

		override applyAction(action: Streaming<HighlightEvalAction>) {
			if (!action.complete) return
			const { editor } = this
			const id = `shape:${action.shapeId}` as TLShapeId
			const shape = editor.getShape(id)
			if (!shape) return
			editor.updateShape({
				id,
				type: shape.type,
				meta: {
					...shape.meta,
					evalHighlight: action.color ?? 'yellow',
					evalIntent: action.intent ?? '',
				},
			})
		}
	}
)
