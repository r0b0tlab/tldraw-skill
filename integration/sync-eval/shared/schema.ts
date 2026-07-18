/**
 * Shared TL schema for client + server.
 * Both sides must agree so @tldraw/sync validation/migrations stay consistent.
 *
 * Based on official sync docs: createTLSchema + defaultShapeSchemas/defaultBindingSchemas.
 */
import { createTLSchema, defaultBindingSchemas, defaultShapeSchemas } from '@tldraw/tlschema'

export const syncEvalSchema = createTLSchema({
	shapes: { ...defaultShapeSchemas },
	bindings: { ...defaultBindingSchemas },
})

export type SyncEvalSchema = typeof syncEvalSchema
