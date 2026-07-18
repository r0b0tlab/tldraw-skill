/**
 * Scan the production browser bundle for provider secrets.
 * Fails if any literal key material is found in client assets.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanFilesForProviderSecrets } from '../harness/secrets-scan.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(root, 'dist')
const resultsDir = path.resolve(root, '../../tests/results/agent')

function walk(dir: string, acc: string[] = []): string[] {
	if (!fs.existsSync(dir)) return acc
	for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, ent.name)
		if (ent.isDirectory()) walk(p, acc)
		else if (/\.(js|mjs|cjs|css|html|map|json)$/i.test(ent.name)) acc.push(p)
	}
	return acc
}

const files = walk(distDir).map((p) => ({
	path: path.relative(root, p),
	content: fs.readFileSync(p, 'utf8'),
}))

// Also scan client source for accidental hard-coded secrets (not env.KEY usage)
const clientFiles = walk(path.join(root, 'client')).map((p) => ({
	path: path.relative(root, p),
	content: fs.readFileSync(p, 'utf8'),
}))

const hits = scanFilesForProviderSecrets([...files, ...clientFiles])

const report = {
	ok: hits.length === 0,
	scannedBundleFiles: files.length,
	scannedClientFiles: clientFiles.length,
	hits,
	note:
		hits.length === 0
			? 'No provider secret literals found in browser bundle or client sources.'
			: 'FAIL: provider secret material detected in client/bundle paths.',
	timestamp: new Date().toISOString(),
}

fs.mkdirSync(resultsDir, { recursive: true })
const outPath = path.join(resultsDir, 'bundle-secret-scan.json')
fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exit(1)
