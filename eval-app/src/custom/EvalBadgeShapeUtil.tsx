/**
 * Custom eval-badge shape for Stage C evaluation (typed ShapeUtil registration).
 */

import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	T,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	resizeBox,
	type Geometry2d,
	type RecordProps,
	type TLResizeInfo,
	type TLShape,
} from 'tldraw'

export const EVAL_BADGE_TYPE = 'eval-badge' as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[EVAL_BADGE_TYPE]: { w: number; h: number; label: string }
	}
}

export type EvalBadgeShape = TLShape<typeof EVAL_BADGE_TYPE>

const EvalBadgeVersions = createShapePropsMigrationIds(EVAL_BADGE_TYPE, {
	AddLabel: 1,
})

export const evalBadgeShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: EvalBadgeVersions.AddLabel,
			up: (props) => {
				props.label = typeof props.name === 'string' ? props.name : 'EVAL'
				delete props.name
			},
			down: (props) => {
				props.name = props.label
				delete props.label
			},
		},
	],
})

export class EvalBadgeShapeUtil extends ShapeUtil<EvalBadgeShape> {
	static override type = EVAL_BADGE_TYPE
	static override props: RecordProps<EvalBadgeShape> = {
		w: T.number,
		h: T.number,
		label: T.string,
	}
	static override migrations = evalBadgeShapeMigrations

	getDefaultProps(): EvalBadgeShape['props'] {
		return { w: 120, h: 32, label: 'EVAL' }
	}

	override canEdit() {
		return false
	}

	override canResize() {
		return true
	}

	getGeometry(shape: EvalBadgeShape): Geometry2d {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override onResize(shape: EvalBadgeShape, info: TLResizeInfo<EvalBadgeShape>) {
		return resizeBox(shape, info)
	}

	component(shape: EvalBadgeShape) {
		return (
			<HTMLContainer
				style={{
					width: '100%',
					height: '100%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					background: '#0f766e',
					color: 'white',
					borderRadius: 8,
					fontFamily: 'system-ui, sans-serif',
					fontSize: 13,
					fontWeight: 600,
					letterSpacing: 0.4,
				}}
			>
				{shape.props.label}
			</HTMLContainer>
		)
	}

	getIndicatorPath(shape: EvalBadgeShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}

	override toSvg(shape: EvalBadgeShape) {
		return (
			<>
				<rect width={shape.props.w} height={shape.props.h} rx={8} fill="#0f766e" />
				<text
					x={shape.props.w / 2}
					y={shape.props.h / 2}
					fill="white"
					fontSize={13}
					fontFamily="system-ui, sans-serif"
					fontWeight={600}
					textAnchor="middle"
					dominantBaseline="middle"
				>
					{shape.props.label}
				</text>
			</>
		)
	}

	override getAriaDescriptor(shape: EvalBadgeShape) {
		return `Evaluation badge: ${shape.props.label}`
	}

	override getText(shape: EvalBadgeShape) {
		return shape.props.label
	}
}
