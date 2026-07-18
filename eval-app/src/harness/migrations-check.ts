/**
 * Prove custom shape props migrations are registered AND exercised on the live schema.
 * Legacy props.name → props.label via public schema.migrateStoreSnapshot.
 */

import type { Editor, IndexKey, TLShapeId } from 'tldraw'
import { EVAL_BADGE_TYPE, EvalBadgeShapeUtil } from '../custom/EvalBadgeShapeUtil'

export interface MigrationsCheckResult {
	ok: boolean
	shapeUtilMigrations: boolean
	schemaSequencePresent: boolean
	schemaSequenceVersion: number | null
	migrationSequenceKey: string
	/** True when legacy {name} record was migrated to {label} via migrateStoreSnapshot. */
	migrationExercised: boolean
	legacyNameMigratedToLabel: boolean
	migratedLabel: string | null
	detail: string
}

const SEQUENCE_KEY = `com.tldraw.shape.${EVAL_BADGE_TYPE}`
const PROBE_ID = `shape:eval-badge-migration-probe` as TLShapeId
const LEGACY_NAME = 'LEGACY-NAME-PROBE'

export function checkCustomShapeMigrations(editor: Editor): MigrationsCheckResult {
	const shapeUtilMigrations = Boolean(EvalBadgeShapeUtil.migrations)

	const schema = editor.store.schema
	const serialized = schema.serialize()
	const sequences =
		serialized && typeof serialized === 'object' && 'sequences' in serialized
			? (serialized.sequences as Record<string, number>)
			: {}

	const version = typeof sequences[SEQUENCE_KEY] === 'number' ? sequences[SEQUENCE_KEY] : null
	// AddLabel migration id version is 1 → sequence version should be >= 1
	const schemaSequencePresent = version !== null && version >= 1

	// Also confirm the migrations map on the schema object includes our sequence.
	const migrationsMap = schema.migrations
	const mapHasSequence = Boolean(migrationsMap && migrationsMap[SEQUENCE_KEY])

	let migrationExercised = false
	let legacyNameMigratedToLabel = false
	let migratedLabel: string | null = null
	let exerciseDetail = ''

	try {
		// Snapshot claims sequence version 0 (pre-AddLabel) with legacy `name` prop.
		const oldSequences = { ...sequences, [SEQUENCE_KEY]: 0 }
		const pageId = editor.getCurrentPageId()
		const legacyRecord = {
			id: PROBE_ID,
			typeName: 'shape' as const,
			type: EVAL_BADGE_TYPE,
			x: 0,
			y: 0,
			rotation: 0,
			isLocked: false,
			opacity: 1,
			meta: {},
			parentId: pageId,
			index: 'a1' as IndexKey,
			props: {
				w: 100,
				h: 32,
				name: LEGACY_NAME,
			},
		}

		const result = schema.migrateStoreSnapshot({
			schema: {
				schemaVersion: 2,
				sequences: oldSequences,
			},
			store: {
				[PROBE_ID]: legacyRecord as never,
			},
		})

		if (result.type === 'success') {
			const migrated = result.value[PROBE_ID] as
				| {
						typeName?: string
						type?: string
						props?: Record<string, unknown>
				  }
				| undefined
			const props = migrated?.props ?? null
			migratedLabel = props && typeof props.label === 'string' ? props.label : null
			legacyNameMigratedToLabel =
				migrated?.typeName === 'shape' &&
				migrated?.type === EVAL_BADGE_TYPE &&
				migratedLabel === LEGACY_NAME &&
				props !== null &&
				!('name' in props)
			migrationExercised = legacyNameMigratedToLabel
			exerciseDetail = legacyNameMigratedToLabel
				? `migrated name→label="${migratedLabel}"`
				: `migration result unexpected props=${JSON.stringify(props)}`
		} else {
			exerciseDetail = `migrateStoreSnapshot failed: ${JSON.stringify(result)}`
		}
	} catch (e) {
		exerciseDetail = e instanceof Error ? e.message : String(e)
	}

	const ok =
		shapeUtilMigrations && schemaSequencePresent && mapHasSequence && migrationExercised

	return {
		ok,
		shapeUtilMigrations,
		schemaSequencePresent,
		schemaSequenceVersion: version,
		migrationSequenceKey: SEQUENCE_KEY,
		migrationExercised,
		legacyNameMigratedToLabel,
		migratedLabel,
		detail: ok
			? `registered+exercised ${SEQUENCE_KEY}@${version}; ${exerciseDetail}`
			: `util=${shapeUtilMigrations} seq=${schemaSequencePresent} map=${mapHasSequence} version=${version} exercised=${migrationExercised} ${exerciseDetail}`,
	}
}
