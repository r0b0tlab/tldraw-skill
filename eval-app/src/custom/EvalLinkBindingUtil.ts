/**
 * Custom eval-link binding: keeps a lightweight meta link between two shapes.
 * Demonstrates TLGlobalBindingPropsMap + BindingUtil registration.
 */

import { BindingUtil, T, type TLBinding } from 'tldraw'

export const EVAL_LINK_TYPE = 'eval-link' as const

declare module 'tldraw' {
	export interface TLGlobalBindingPropsMap {
		[EVAL_LINK_TYPE]: { strength: number; label: string }
	}
}

export type EvalLinkBinding = TLBinding<typeof EVAL_LINK_TYPE>

export class EvalLinkBindingUtil extends BindingUtil<EvalLinkBinding> {
	static override type = EVAL_LINK_TYPE

	static override props = {
		strength: T.number,
		label: T.string,
	}

	override getDefaultProps(): EvalLinkBinding['props'] {
		return { strength: 1, label: 'related' }
	}

	override onAfterChangeToShape({ binding, shapeAfter }: { binding: EvalLinkBinding; shapeAfter: { id: string; x: number; y: number } }) {
		// Intentionally light: custom link does not drag the from-shape; lifecycle is still exercised.
		void binding
		void shapeAfter
	}
}
