/**
 * Exercise official legacy v2.tldr through tldraw 5.2.5 parse/migration path.
 * Uses public parseTldrawJsonFile + createTLSchema (no fabricated envelope).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	createTLSchema,
	defaultBindingSchemas,
	defaultShapeSchemas,
	parseTldrawJsonFile,
} from 'tldraw'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(root, '../..')
const fixturePath = path.join(repoRoot, 'tests/fixtures/legacy-upstream-v2.tldr')
const resultsDir = path.join(repoRoot, 'tests/results/agent')

const tldrawPkg = JSON.parse(
	fs.readFileSync(path.join(root, 'node_modules/tldraw/package.json'), 'utf8')
) as { version: string }

const json = fs.readFileSync(fixturePath, 'utf8')

const schema = createTLSchema({
	shapes: defaultShapeSchemas,
	bindings: defaultBindingSchemas,
})

const parsed = parseTldrawJsonFile({ json, schema })

let ok = false
let recordCount = 0
let errorMessage: string | null = null
let recordsSample: Array<{ typeName?: string; id?: string }> = []
let pageCount = 0
let shapeCount = 0

if (parsed.ok === true) {
	const store = parsed.value
	const all = store.allRecords()
	recordCount = all.length
	recordsSample = all.slice(0, 16).map((r) => ({
		id: String((r as { id?: string }).id ?? ''),
		typeName: String((r as { typeName?: string }).typeName ?? ''),
	}))
	pageCount = all.filter((r) => (r as { typeName?: string }).typeName === 'page').length
	shapeCount = all.filter((r) => (r as { typeName?: string }).typeName === 'shape').length
	ok = recordCount > 0
} else {
	const failure = parsed as { ok: false; error: unknown }
	errorMessage = JSON.stringify(failure.error)
	ok = false
}

const result = {
	ok,
	fixture: path.relative(repoRoot, fixturePath),
	tldrawVersion: tldrawPkg.version,
	legacyAcceptedAndMigrated: ok,
	legacyRecordCount: recordCount,
	pageCount,
	shapeCount,
	recordsSample,
	error: errorMessage,
	providerExecution: 'not_applicable',
	timestamp: new Date().toISOString(),
	notes:
		'Official tagged legacy v2.tldr migrated via tldraw public parseTldrawJsonFile (Result<TLStore>).',
}

fs.mkdirSync(resultsDir, { recursive: true })
const outPath = path.join(resultsDir, 'legacy-v2-migration.json')
fs.writeFileSync(outPath, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
process.exit(ok ? 0 : 1)
