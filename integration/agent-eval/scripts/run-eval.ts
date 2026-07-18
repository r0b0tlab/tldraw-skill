/**
 * Orchestrate agent-eval evidence: tests, typecheck, builds, secret scan, migration.
 * Provider-backed requests remain explicitly unverified without credentials.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listAllowlistedActions } from '../harness/allowlist.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(root, '../..')
const resultsDir = path.join(repoRoot, 'tests/results/agent')
fs.mkdirSync(resultsDir, { recursive: true })

function run(
	cmd: string,
	args: string[],
	cwd = root
): { ok: boolean; code: number | null; stdout: string; stderr: string; durationMs: number } {
	const started = Date.now()
	const res = spawnSync(cmd, args, {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, CI: '1' },
		maxBuffer: 20 * 1024 * 1024,
	})
	return {
		ok: res.status === 0,
		code: res.status,
		stdout: res.stdout ?? '',
		stderr: res.stderr ?? '',
		durationMs: Date.now() - started,
	}
}

const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim())
const hasOpenAI = Boolean(process.env.OPENAI_API_KEY?.trim())
const hasGoogle = Boolean(process.env.GOOGLE_API_KEY?.trim())
const anyProviderKey = hasAnthropic || hasOpenAI || hasGoogle

const steps: Record<string, ReturnType<typeof run> & { name: string }> = {}

function record(name: string, result: ReturnType<typeof run>) {
	steps[name] = { name, ...result }
	const logPath = path.join(resultsDir, `${name.replace(/[^a-z0-9_-]+/gi, '_')}.log`)
	fs.writeFileSync(
		logPath,
		[`# ${name}`, `exit=${result.code}`, `durationMs=${result.durationMs}`, '', '--- stdout ---', result.stdout, '--- stderr ---', result.stderr].join(
			'\n'
		)
	)
	console.log(`[eval] ${name}: ${result.ok ? 'OK' : 'FAIL'} (${result.durationMs}ms)`)
}

// 1) Unit tests (harness)
record('test', run('npm', ['test']))

// 2) Typecheck agent starter
record('typecheck', run('npm', ['run', 'typecheck']))

// 3) Production build agent starter
record('build_agent', run('npm', ['run', 'build']))

// 4) Bundle secret scan (requires dist)
record('scan_bundle', run('npx', ['tsx', 'scripts/scan-bundle-secrets.ts']))

// 5) Legacy migration
record('migrate_legacy', run('npx', ['tsx', 'scripts/migrate-legacy.ts']))

// 6) Workflow starter install + build
const workflowDir = path.join(root, 'workflow-starter')
record('workflow_install', run('npm', ['ci'], workflowDir))
record('workflow_typecheck', run('npm', ['run', 'typecheck'], workflowDir))
record('workflow_build', run('npm', ['run', 'build'], workflowDir))

// Dependency repair evidence
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
	devDependencies?: Record<string, string>
	dependencies?: Record<string, string>
}
const workersTypes = pkg.devDependencies?.['@cloudflare/workers-types'] ?? null
const wrangler = pkg.dependencies?.wrangler ?? null

const tldrawVersion = (() => {
	try {
		return JSON.parse(
			fs.readFileSync(path.join(root, 'node_modules/tldraw/package.json'), 'utf8')
		).version as string
	} catch {
		return null
	}
})()

const migrationPath = path.join(resultsDir, 'legacy-v2-migration.json')
const secretScanPath = path.join(resultsDir, 'bundle-secret-scan.json')
const migration = fs.existsSync(migrationPath)
	? JSON.parse(fs.readFileSync(migrationPath, 'utf8'))
	: null
const secretScan = fs.existsSync(secretScanPath)
	? JSON.parse(fs.readFileSync(secretScanPath, 'utf8'))
	: null

const evidence = {
	ok:
		steps.test?.ok &&
		steps.typecheck?.ok &&
		steps.build_agent?.ok &&
		steps.scan_bundle?.ok &&
		steps.migrate_legacy?.ok &&
		steps.workflow_install?.ok &&
		steps.workflow_typecheck?.ok &&
		steps.workflow_build?.ok,
	timestamp: new Date().toISOString(),
	base: {
		source: 'npm create tldraw@latest -- --template agent',
		tldrawVersion,
		pinnedTldraw: pkg.dependencies?.tldraw ?? null,
		customizations: [
			'prompt-part: evalSession (EvalSessionPartUtil + definition)',
			'action: highlight-eval (HighlightEvalAction + util)',
			'harness sanitize/allowlist/secrets-scan',
			'worker stream allowlist gate',
		],
	},
	dependencyRepair: {
		reproduced: true,
		issue:
			'wrangler@4.112 peerOptional requires @cloudflare/workers-types ^5.20260714.1; starter declared ^4',
		fix: 'Set devDependency @cloudflare/workers-types to ^5.20260714.1 (no --force)',
		workersTypes,
		wrangler,
	},
	steps: Object.fromEntries(
		Object.entries(steps).map(([k, v]) => [
			k,
			{ ok: v.ok, code: v.code, durationMs: v.durationMs },
		])
	),
	serverActionAllowlist: listAllowlistedActions(),
	bundleSecretScan: secretScan,
	legacyMigration: migration,
	providerBackedRequest: {
		status: anyProviderKey ? 'credentials_present_but_live_call_not_executed' : 'unverified',
		reason: anyProviderKey
			? 'Provider env keys detected in environment, but this harness does not perform a live model request by policy in offline eval.'
			: 'No ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY available; provider execution explicitly unverified. No synthetic provider response.',
		hasAnthropic,
		hasOpenAI,
		hasGoogle,
	},
	secondStarterFamily: {
		name: 'workflow',
		path: 'integration/agent-eval/workflow-starter',
		installOk: steps.workflow_install?.ok ?? false,
		typecheckOk: steps.workflow_typecheck?.ok ?? false,
		buildOk: steps.workflow_build?.ok ?? false,
	},
}

const evidencePath = path.join(resultsDir, 'agent-eval-evidence.json')
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2))
console.log('\n=== agent-eval evidence ===')
console.log(JSON.stringify(evidence, null, 2))
console.log(`\nWrote ${evidencePath}`)
if (!evidence.ok) process.exit(1)
