/**
 * Two-client tldraw 5.2.5 sync integration tests (strict TDD entrypoint).
 *
 * Requirements covered:
 * - shape create A→B and update B→A
 * - room isolation
 * - unauthorized connect rejected
 * - document survives server restart (SQLiteSyncStorage)
 * - presence/cursors when observable
 *
 * Evidence written to ../../tests/results/sync/
 */
import { chromium, type Browser, type Page } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createNetServer } from 'node:net'
import { createServer as createViteServer, type ViteDevServer } from 'vite'
import { DEFAULT_HARNESS_TOKEN, MAX_UPLOAD_BYTES } from '../shared/security'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(ROOT, '../..')
const EVIDENCE_DIR = path.join(REPO_ROOT, 'tests/results/sync')
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts')

const VALID_TOKEN = DEFAULT_HARNESS_TOKEN
const INVALID_TOKEN = 'nope-bad-token'

type HarnessApi = {
	ready: boolean
	status: string
	error?: string | null
	roomId: string
	userName: string
	clientLabel: string
	tldrawVersion: string
	syncVersion: string
	createGeoShape: (input: {
		idSuffix: string
		x: number
		y: number
		w?: number
		h?: number
		meta?: Record<string, unknown>
	}) => string
	updateShapePosition: (shapeId: string, x: number, y: number) => void
	getShapeSnapshot: (shapeId: string) => null | {
		id: string
		type: string
		x: number
		y: number
		meta: Record<string, unknown>
	}
	listShapeIds: () => string[]
	listPresence: () => Array<{ userId: string; userName: string; hasCursor: boolean }>
	getDocumentClockHint: () => number
}

declare global {
	interface Window {
		__syncEval?: HarnessApi
		editor?: unknown
	}
}

type TestResult = {
	name: string
	ok: boolean
	detail?: string
	data?: unknown
}

function assert(cond: unknown, msg: string): asserts cond {
	if (!cond) throw new Error(msg)
}

async function getFreePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const s = createNetServer()
		s.listen(0, '127.0.0.1', () => {
			const addr = s.address()
			if (!addr || typeof addr === 'string') {
				s.close()
				reject(new Error('no port'))
				return
			}
			const port = addr.port
			s.close((err) => (err ? reject(err) : resolve(port)))
		})
		s.on('error', reject)
	})
}

async function waitForHttpOk(url: string, timeoutMs = 30_000): Promise<void> {
	const start = Date.now()
	let lastErr: unknown
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url)
			if (res.ok) return
			lastErr = new Error(`HTTP ${res.status}`)
		} catch (e) {
			lastErr = e
		}
		await new Promise((r) => setTimeout(r, 150))
	}
	throw new Error(`Timed out waiting for ${url}: ${String(lastErr)}`)
}

async function waitForHarness(page: Page, timeoutMs = 60_000): Promise<HarnessApi> {
	await page.waitForFunction(
		() => Boolean(window.__syncEval?.ready && window.__syncEval.status === 'synced'),
		null,
		{ timeout: timeoutMs }
	)
	return page.evaluate(() => window.__syncEval!) as Promise<HarnessApi>
}

function clientUrl(
	base: string,
	opts: { roomId: string; token: string; user: string; label: string; color?: string }
): string {
	const u = new URL(base)
	u.searchParams.set('roomId', opts.roomId)
	u.searchParams.set('token', opts.token)
	u.searchParams.set('user', opts.user)
	u.searchParams.set('label', opts.label)
	if (opts.color) u.searchParams.set('color', opts.color)
	return u.toString()
}

class ServerProcess {
	proc: ChildProcess | null = null
	port = 0
	roomsDir = ''
	constructor(
		private readonly opts: {
			roomsDir: string
			assetsDir: string
			token: string
		}
	) {}

	async start(): Promise<number> {
		this.port = await getFreePort()
		this.roomsDir = this.opts.roomsDir
		await fs.mkdir(this.roomsDir, { recursive: true })
		await fs.mkdir(this.opts.assetsDir, { recursive: true })

		this.proc = spawn(
			process.execPath,
			['--import', 'tsx', path.join(ROOT, 'src/server/server.ts')],
			{
				cwd: ROOT,
				env: {
					...process.env,
					SYNC_PORT: String(this.port),
					SYNC_AUTH_TOKEN: this.opts.token,
					ROOMS_DIR: this.roomsDir,
					ASSETS_DIR: this.opts.assetsDir,
					SYNC_HOST: '127.0.0.1',
				},
				stdio: ['ignore', 'pipe', 'pipe'],
			}
		)

		let bootLog = ''
		this.proc.stdout?.on('data', (d) => {
			bootLog += d.toString()
		})
		this.proc.stderr?.on('data', (d) => {
			bootLog += d.toString()
		})

		try {
			await waitForHttpOk(`http://127.0.0.1:${this.port}/health`)
		} catch (e) {
			await this.stop()
			throw new Error(`Server failed to become healthy.\n${bootLog}\n${e}`)
		}
		return this.port
	}

	async stop(): Promise<void> {
		const p = this.proc
		this.proc = null
		if (!p || p.killed) return
		await new Promise<void>((resolve) => {
			const t = setTimeout(() => {
				try {
					p.kill('SIGKILL')
				} catch {
					/* ignore */
				}
				resolve()
			}, 3000)
			p.once('exit', () => {
				clearTimeout(t)
				resolve()
			})
			try {
				p.kill('SIGTERM')
			} catch {
				clearTimeout(t)
				resolve()
			}
		})
	}

	httpUrl(): string {
		return `http://127.0.0.1:${this.port}`
	}
}

async function main() {
	const startedAt = new Date().toISOString()
	const results: TestResult[] = []
	const runId = `sync-${Date.now()}`
	const roomsDir = path.join(ARTIFACTS_DIR, runId, 'rooms')
	const assetsDir = path.join(ARTIFACTS_DIR, runId, 'assets')
	await fs.mkdir(roomsDir, { recursive: true })
	await fs.mkdir(assetsDir, { recursive: true })
	await fs.mkdir(EVIDENCE_DIR, { recursive: true })
	await fs.mkdir(ARTIFACTS_DIR, { recursive: true })

	// Fail fast if harness sources are missing (TDD red phase signal)
	for (const rel of [
		'src/server/server.ts',
		'src/server/rooms.ts',
		'src/server/auth.ts',
		'src/client/App.tsx',
		'shared/schema.ts',
	]) {
		try {
			await fs.access(path.join(ROOT, rel))
		} catch {
			results.push({ name: `harness-file:${rel}`, ok: false, detail: 'missing' })
			await writeEvidence({ startedAt, results, error: `Missing ${rel}` })
			console.error(`FAIL missing ${rel}`)
			process.exit(1)
		}
	}

	const server = new ServerProcess({ roomsDir, assetsDir, token: VALID_TOKEN })
	let vite: ViteDevServer | null = null
	let browser: Browser | null = null
	let clientBase = ''
	let syncHttp = ''

	try {
		const serverPort = await server.start()
		syncHttp = server.httpUrl()
		console.log('sync server', syncHttp)

		// Point Vite client at this server
		process.env.VITE_SYNC_HTTP_URL = syncHttp
		process.env.NODE_ENV = 'development'

		const clientPort = await getFreePort()
		vite = await createViteServer({
			root: path.join(ROOT, 'src/client'),
			configFile: path.join(ROOT, 'vite.config.ts'),
			server: { host: '127.0.0.1', port: clientPort, strictPort: true },
			logLevel: 'error',
		})
		await vite.listen()
		clientBase = `http://127.0.0.1:${clientPort}/`
		console.log('client', clientBase)

		browser = await chromium.launch({ headless: true })

		// --- Test: unauthorized websocket rejected ---
		{
			const name = 'auth-reject-invalid-token'
			try {
				const res = await fetch(`${syncHttp}/auth-check?token=${encodeURIComponent(INVALID_TOKEN)}`)
				const body = (await res.json()) as { ok: boolean; reason?: string }
				assert(res.status === 401 || body.ok === false, 'expected unauthorized response')

				// Also prove WS path rejects (raw upgrade is hard; use harness endpoint that mirrors connect auth)
				const wsProbe = await fetch(
					`${syncHttp}/connect-probe?roomId=auth-room&token=${encodeURIComponent(INVALID_TOKEN)}`
				)
				const wsBody = (await wsProbe.json()) as { accepted: boolean; code?: number }
				assert(wsProbe.status === 401 || wsBody.accepted === false, 'ws probe must reject')

				// Browser path: client should surface error status, not synced
				const ctx = await browser.newContext()
				const page = await ctx.newPage()
				await page.goto(
					clientUrl(clientBase, {
						roomId: 'auth-room',
						token: INVALID_TOKEN,
						user: 'Eve',
						label: 'auth-bad',
					}),
					{ waitUntil: 'domcontentloaded', timeout: 60_000 }
				)
				await page.waitForFunction(() => Boolean(window.__syncEval), null, { timeout: 45_000 })
				// useSync retries an unauthorized socket and may remain in `loading`; the
				// security invariant is that it never reaches a synced state.
				await page.waitForTimeout(1_500)
				const terminal = await page.evaluate(() => ({
					status: window.__syncEval!.status,
					error: window.__syncEval!.error ?? null,
				}))
				assert(terminal.status !== 'synced', `unauthorized client synced: ${JSON.stringify(terminal)}`)
				await ctx.close()
				results.push({ name, ok: true, data: { terminal, wsBody } })
				console.log('PASS', name)
			} catch (e) {
				results.push({ name, ok: false, detail: String(e) })
				console.error('FAIL', name, e)
			}
		}

		// --- Test: uploads require the same token semantics ---
		{
			const name = 'upload-requires-auth'
			try {
				const id = `unauth-${runId}.png`
				const png = Buffer.from(
					'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
					'base64'
				)
				const putNoAuth = await fetch(`${syncHttp}/uploads/${encodeURIComponent(id)}`, {
					method: 'PUT',
					headers: { 'content-type': 'image/png' },
					body: png,
				})
				assert(putNoAuth.status === 401, `unauth PUT expected 401, got ${putNoAuth.status}`)

				const putBad = await fetch(
					`${syncHttp}/uploads/${encodeURIComponent(id)}?token=${encodeURIComponent(INVALID_TOKEN)}`,
					{
						method: 'PUT',
						headers: { 'content-type': 'image/png' },
						body: png,
					}
				)
				assert(putBad.status === 401, `bad-token PUT expected 401, got ${putBad.status}`)

				const putOk = await fetch(
					`${syncHttp}/uploads/${encodeURIComponent(id)}?token=${encodeURIComponent(VALID_TOKEN)}`,
					{
						method: 'PUT',
						headers: { 'content-type': 'image/png' },
						body: png,
					}
				)
				assert(putOk.ok, `auth PUT failed: ${putOk.status}`)

				const getNoAuth = await fetch(`${syncHttp}/uploads/${encodeURIComponent(id)}`)
				assert(getNoAuth.status === 401, `unauth GET expected 401, got ${getNoAuth.status}`)

				const getOk = await fetch(
					`${syncHttp}/uploads/${encodeURIComponent(id)}?token=${encodeURIComponent(VALID_TOKEN)}`
				)
				assert(getOk.ok, `auth GET failed: ${getOk.status}`)
				assert(
					getOk.headers.get('content-type') === 'image/png',
					`download MIME expected image/png, got ${getOk.headers.get('content-type')}`
				)
				const got = Buffer.from(await getOk.arrayBuffer())
				assert(got.equals(png), 'downloaded bytes mismatch')

				results.push({ name, ok: true, data: { putNoAuth: putNoAuth.status, putOk: putOk.status } })
				console.log('PASS', name)
			} catch (e) {
				results.push({ name, ok: false, detail: String(e) })
				console.error('FAIL', name, e)
			}
		}

		// --- Test: upload MIME allowlist + size limit ---
		{
			const name = 'upload-rejects-invalid-media'
			try {
				const htmlId = `bad-mime-${runId}.html`
				const htmlBody = Buffer.from('<script>alert(1)</script>', 'utf8')
				const badMime = await fetch(
					`${syncHttp}/uploads/${encodeURIComponent(htmlId)}?token=${encodeURIComponent(VALID_TOKEN)}`,
					{
						method: 'PUT',
						headers: { 'content-type': 'text/html' },
						body: htmlBody,
					}
				)
				assert(badMime.status === 415, `bad MIME expected 415, got ${badMime.status}`)

				const mislabeled = await fetch(
					`${syncHttp}/uploads/${encodeURIComponent(`mislabeled-${runId}.jpg`)}?token=${encodeURIComponent(VALID_TOKEN)}`,
					{
						method: 'PUT',
						headers: { 'content-type': 'image/jpeg' },
						body: Buffer.from(
							'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
							'base64'
						),
					}
				)
				assert(mislabeled.status === 415, `mislabeled image expected 415, got ${mislabeled.status}`)

				const bigId = `too-big-${runId}.bin`
				const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 7)
				const tooBig = await fetch(
					`${syncHttp}/uploads/${encodeURIComponent(bigId)}?token=${encodeURIComponent(VALID_TOKEN)}`,
					{
						method: 'PUT',
						headers: {
							'content-type': 'image/png',
							'content-length': String(oversized.length),
						},
						body: oversized,
					}
				)
				assert(tooBig.status === 413, `oversized expected 413, got ${tooBig.status}`)

				results.push({
					name,
					ok: true,
					data: {
						badMime: badMime.status,
						mislabeled: mislabeled.status,
						tooBig: tooBig.status,
						maxBytes: MAX_UPLOAD_BYTES,
					},
				})
				console.log('PASS', name)
			} catch (e) {
				results.push({ name, ok: false, detail: String(e) })
				console.error('FAIL', name, e)
			}
		}

		// --- Test: CORS is not open reflection (origin:true) ---
		{
			const name = 'cors-explicit-not-open'
			try {
				const evilOrigin = 'https://evil.example'
				const preflight = await fetch(`${syncHttp}/health`, {
					method: 'OPTIONS',
					headers: {
						Origin: evilOrigin,
						'Access-Control-Request-Method': 'GET',
					},
				})
				const allowOrigin = preflight.headers.get('access-control-allow-origin')
				assert(
					allowOrigin !== evilOrigin && allowOrigin !== '*',
					`must not reflect evil origin, got ${allowOrigin}`
				)

				const loopbackOrigin = 'http://127.0.0.1:5757'
				const okPreflight = await fetch(`${syncHttp}/health`, {
					method: 'OPTIONS',
					headers: {
						Origin: loopbackOrigin,
						'Access-Control-Request-Method': 'GET',
					},
				})
				const okAllow = okPreflight.headers.get('access-control-allow-origin')
				assert(
					okAllow === loopbackOrigin,
					`loopback origin should be allowed, got ${okAllow}`
				)

				results.push({
					name,
					ok: true,
					data: { evilAllowOrigin: allowOrigin, loopbackAllowOrigin: okAllow },
				})
				console.log('PASS', name)
			} catch (e) {
				results.push({ name, ok: false, detail: String(e) })
				console.error('FAIL', name, e)
			}
		}

		// --- Test: non-loopback bind + default token fails closed ---
		{
			const name = 'reject-non-loopback-default-token'
			try {
				const port = await getFreePort()
				const proc = spawn(
					process.execPath,
					['--import', 'tsx', path.join(ROOT, 'src/server/server.ts')],
					{
						cwd: ROOT,
						env: {
							...process.env,
							SYNC_PORT: String(port),
							SYNC_HOST: '0.0.0.0',
							SYNC_AUTH_TOKEN: DEFAULT_HARNESS_TOKEN,
							ROOMS_DIR: path.join(roomsDir, 'unsafe-bind'),
							ASSETS_DIR: path.join(assetsDir, 'unsafe-bind'),
						},
						stdio: ['ignore', 'pipe', 'pipe'],
					}
				)
				let log = ''
				proc.stdout?.on('data', (d) => {
					log += d.toString()
				})
				proc.stderr?.on('data', (d) => {
					log += d.toString()
				})
				const exitCode = await new Promise<number | null>((resolve) => {
					const t = setTimeout(() => {
						try {
							proc.kill('SIGKILL')
						} catch {
							/* ignore */
						}
						resolve(null)
					}, 8_000)
					proc.once('exit', (code) => {
						clearTimeout(t)
						resolve(code)
					})
				})
				assert(exitCode !== null && exitCode !== 0, `expected non-zero exit, got ${exitCode}; log=${log}`)
				assert(
					/non-loopback|default token|SYNC_AUTH_TOKEN|refusing/i.test(log),
					`expected refusal message in log: ${log}`
				)
				results.push({ name, ok: true, data: { exitCode, logSnippet: log.slice(0, 400) } })
				console.log('PASS', name)
			} catch (e) {
				results.push({ name, ok: false, detail: String(e) })
				console.error('FAIL', name, e)
			}
		}

		// --- Test: two-client create A→B, update B→A + presence ---
		const roomSync = `room-sync-${runId}`
		let shapeId = ''
		let presenceObserved = false
		let clientAIds: string[] = []
		let clientBIds: string[] = []
		{
			const name = 'two-client-create-and-update'
			const ctxA = await browser.newContext()
			const ctxB = await browser.newContext()
			const pageA = await ctxA.newPage()
			const pageB = await ctxB.newPage()
			try {
				await Promise.all([
					pageA.goto(
						clientUrl(clientBase, {
							roomId: roomSync,
							token: VALID_TOKEN,
							user: 'Alice',
							label: 'A',
							color: '#E03131',
						}),
						{ waitUntil: 'domcontentloaded', timeout: 60_000 }
					),
					pageB.goto(
						clientUrl(clientBase, {
							roomId: roomSync,
							token: VALID_TOKEN,
							user: 'Bob',
							label: 'B',
							color: '#2F9E44',
						}),
						{ waitUntil: 'domcontentloaded', timeout: 60_000 }
					),
				])

				await Promise.all([waitForHarness(pageA), waitForHarness(pageB)])

				// Move cursors so presence has coordinates
				await pageA.mouse.move(220, 180)
				await pageB.mouse.move(340, 260)
				await pageA.waitForTimeout(500)
				await pageB.waitForTimeout(500)

				shapeId = await pageA.evaluate(() =>
					window.__syncEval!.createGeoShape({
						idSuffix: 'from-a',
						x: 100,
						y: 120,
						w: 160,
						h: 100,
						meta: { marker: 'created-by-A', run: 'sync' },
					})
				)
				assert(shapeId.startsWith('shape:'), `bad shape id ${shapeId}`)

				await pageB.waitForFunction(
					(id) => Boolean(window.__syncEval?.getShapeSnapshot(id)),
					shapeId,
					{ timeout: 20_000 }
				)

				const onB = await pageB.evaluate((id) => window.__syncEval!.getShapeSnapshot(id), shapeId)
				assert(onB, 'B missing shape from A')
				assert(onB!.x === 100 && onB!.y === 120, `B saw wrong coords ${JSON.stringify(onB)}`)
				assert(onB!.meta?.marker === 'created-by-A', 'meta not synced')

				await pageB.evaluate(
					({ id }) => window.__syncEval!.updateShapePosition(id, 333, 444),
					{ id: shapeId }
				)

				await pageA.waitForFunction(
					({ id }) => {
						const s = window.__syncEval?.getShapeSnapshot(id)
						return s && s.x === 333 && s.y === 444
					},
					{ id: shapeId },
					{ timeout: 20_000 }
				)

				const onA = await pageA.evaluate((id) => window.__syncEval!.getShapeSnapshot(id), shapeId)
				assert(onA && onA.x === 333 && onA.y === 444, 'A did not see B update')

				// Presence: each client should eventually see the other user's presence record
				const presenceDeadline = Date.now() + 15_000
				let presenceA: HarnessApi['listPresence'] extends () => infer R ? R : never = []
				let presenceB: typeof presenceA = []
				while (Date.now() < presenceDeadline) {
					presenceA = await pageA.evaluate(() => window.__syncEval!.listPresence())
					presenceB = await pageB.evaluate(() => window.__syncEval!.listPresence())
					const aSeesBob = presenceA.some((p) => p.userName === 'Bob')
					const bSeesAlice = presenceB.some((p) => p.userName === 'Alice')
					if (aSeesBob && bSeesAlice) {
						presenceObserved = true
						break
					}
					await new Promise((r) => setTimeout(r, 250))
				}

				clientAIds = await pageA.evaluate(() => window.__syncEval!.listShapeIds())
				clientBIds = await pageB.evaluate(() => window.__syncEval!.listShapeIds())

				const versions = await pageA.evaluate(() => ({
					tldraw: window.__syncEval!.tldrawVersion,
					sync: window.__syncEval!.syncVersion,
				}))

				results.push({
					name,
					ok: true,
					data: {
						shapeId,
						onA,
						onBBeforeUpdate: onB,
						presenceObserved,
						presenceA,
						presenceB,
						versions,
						clientAIds,
						clientBIds,
					},
				})
				console.log('PASS', name, { shapeId, presenceObserved })
			} catch (e) {
				results.push({ name, ok: false, detail: String(e) })
				console.error('FAIL', name, e)
			} finally {
				await ctxA.close()
				await ctxB.close()
			}
		}

		// --- Test: room isolation ---
		{
			const name = 'room-isolation'
			const roomOther = `room-other-${runId}`
			const ctxA = await browser.newContext()
			const ctxB = await browser.newContext()
			const pageKeep = await ctxA.newPage()
			const pageOther = await ctxB.newPage()
			try {
				await Promise.all([
					pageKeep.goto(
						clientUrl(clientBase, {
							roomId: roomSync,
							token: VALID_TOKEN,
							user: 'Keeper',
							label: 'keep',
						}),
						{ waitUntil: 'domcontentloaded', timeout: 60_000 }
					),
					pageOther.goto(
						clientUrl(clientBase, {
							roomId: roomOther,
							token: VALID_TOKEN,
							user: 'Other',
							label: 'other',
						}),
						{ waitUntil: 'domcontentloaded', timeout: 60_000 }
					),
				])
				await Promise.all([waitForHarness(pageKeep), waitForHarness(pageOther)])

				// Original shape should still be in roomSync if persistence within live room works;
				// create a fresh unique shape in keep room and ensure other room never sees it.
				const isoShapeId = await pageKeep.evaluate(() =>
					window.__syncEval!.createGeoShape({
						idSuffix: 'iso-only',
						x: 10,
						y: 10,
						meta: { marker: 'room-sync-only' },
					})
				)
				await pageKeep.waitForFunction(
					(id) => Boolean(window.__syncEval?.getShapeSnapshot(id)),
					isoShapeId,
					{ timeout: 10_000 }
				)

				// Give time for any mistaken cross-room leak
				await pageOther.waitForTimeout(1500)
				const leaked = await pageOther.evaluate(
					(id) => window.__syncEval!.getShapeSnapshot(id),
					isoShapeId
				)
				const otherIds = await pageOther.evaluate(() => window.__syncEval!.listShapeIds())
				assert(!leaked, `shape leaked into other room: ${JSON.stringify(leaked)}`)
				assert(!otherIds.includes(isoShapeId), 'iso shape id present in other room')

				results.push({
					name,
					ok: true,
					data: { isoShapeId, otherIds, roomSync, roomOther },
				})
				console.log('PASS', name)
			} catch (e) {
				results.push({ name, ok: false, detail: String(e) })
				console.error('FAIL', name, e)
			} finally {
				await ctxA.close()
				await ctxB.close()
			}
		}

		// --- Test: persistence across server restart ---
		{
			const name = 'persistence-survives-server-restart'
			const roomPersist = `room-persist-${runId}`
			const ctx = await browser.newContext()
			const page = await ctx.newPage()
			let persistShapeId = ''
			try {
				await page.goto(
					clientUrl(clientBase, {
						roomId: roomPersist,
						token: VALID_TOKEN,
						user: 'Persister',
						label: 'P1',
					}),
					{ waitUntil: 'domcontentloaded', timeout: 60_000 }
				)
				await waitForHarness(page)
				persistShapeId = await page.evaluate((currentRunId) =>
					window.__syncEval!.createGeoShape({
						idSuffix: 'persist-me',
						x: 55,
						y: 66,
						meta: { marker: 'persist-check', runId: currentRunId },
					})
				, runId)
				// Ensure write landed
				await page.waitForFunction(
					(id) => Boolean(window.__syncEval?.getShapeSnapshot(id)),
					persistShapeId,
					{ timeout: 10_000 }
				)
				// A second network client must observe the shape before restart. This
				// prevents a local optimistic write from being mistaken for a server ack.
				const ackCtx = await browser.newContext()
				try {
					const ackPage = await ackCtx.newPage()
					await ackPage.goto(
						clientUrl(clientBase, {
							roomId: roomPersist,
							token: VALID_TOKEN,
							user: 'Persistence Ack',
							label: 'P-ack',
						}),
						{ waitUntil: 'domcontentloaded', timeout: 60_000 }
					)
					await waitForHarness(ackPage)
					await ackPage.waitForFunction(
						(id) => Boolean(window.__syncEval?.getShapeSnapshot(id)),
						persistShapeId,
						{ timeout: 20_000 }
					)
				} finally {
					await ackCtx.close()
				}
				await ctx.close()

				// Restart authoritative server process (same ROOMS_DIR)
				await server.stop()
				await new Promise((r) => setTimeout(r, 400))
				await server.start()
				// Keep same port? ServerProcess picks new port — update client env URL by reloading with new base.
				// Client builds WS URI from VITE_SYNC_HTTP_URL baked at module load for Vite import.meta.env.
				// Our App reads runtime query `syncUrl` override OR window default injected.
				// Tests pass syncUrl query to avoid rebuild.
				syncHttp = server.httpUrl()

				const ctx2 = await browser.newContext()
				const page2 = await ctx2.newPage()
				const url = clientUrl(clientBase, {
					roomId: roomPersist,
					token: VALID_TOKEN,
					user: 'Persister',
					label: 'P2',
				})
				const u = new URL(url)
				u.searchParams.set('syncUrl', syncHttp)
				await page2.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
				await waitForHarness(page2, 60_000)

				const restored = await page2.evaluate(
					(id) => window.__syncEval!.getShapeSnapshot(id),
					persistShapeId
				)
				assert(restored, 'shape missing after restart')
				assert(restored!.x === 55 && restored!.y === 66, `coords wrong after restart ${JSON.stringify(restored)}`)
				assert(restored!.meta?.marker === 'persist-check', 'meta missing after restart')

				const roomFiles = await fs.readdir(roomsDir)
				results.push({
					name,
					ok: true,
					data: { persistShapeId, restored, roomFiles, roomsDir },
				})
				console.log('PASS', name, { persistShapeId })
				await ctx2.close()
			} catch (e) {
				results.push({ name, ok: false, detail: String(e) })
				console.error('FAIL', name, e)
				try {
					await ctx.close()
				} catch {
					/* ignore */
				}
			}
		}

		// Package version evidence
		const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'))
		const tldrawPkg = JSON.parse(
			await fs.readFile(path.join(ROOT, 'node_modules/tldraw/package.json'), 'utf8')
		)
		const syncPkg = JSON.parse(
			await fs.readFile(path.join(ROOT, 'node_modules/@tldraw/sync/package.json'), 'utf8')
		)
		const syncCorePkg = JSON.parse(
			await fs.readFile(path.join(ROOT, 'node_modules/@tldraw/sync-core/package.json'), 'utf8')
		)

		const failed = results.filter((r) => !r.ok)
		const evidence = {
			startedAt,
			finishedAt: new Date().toISOString(),
			runId,
			ok: failed.length === 0,
			versions: {
				harness: pkg.version,
				tldraw: tldrawPkg.version,
				'@tldraw/sync': syncPkg.version,
				'@tldraw/sync-core': syncCorePkg.version,
			},
			pattern: 'official templates/simple-server-example @ v5.2.5 (TLSocketRoom + SQLiteSyncStorage + NodeSqliteWrapper)',
			securityNote:
				'Local integration harness only. Upload auth, MIME/size limits, explicit CORS (no origin:true), and non-loopback+default-token fail-closed apply; still not production multiplayer.',
			clients: {
				shapeId,
				clientAIds,
				clientBIds,
				presenceObserved,
			},
			results,
		}
		await writeEvidence(evidence)

		if (failed.length) {
			console.error(`\n${failed.length} test(s) failed`)
			process.exitCode = 1
			return
		}
		console.log('\nAll sync integration tests passed')
		return
	} catch (e) {
		results.push({ name: 'harness-boot', ok: false, detail: String(e) })
		await writeEvidence({ startedAt, results, error: String(e) })
		console.error(e)
		process.exitCode = 1
	} finally {
		if (browser) await browser.close().catch(() => {})
		if (vite) await vite.close().catch(() => {})
		await server.stop().catch(() => {})
	}
}

async function writeEvidence(evidence: unknown) {
	await fs.mkdir(EVIDENCE_DIR, { recursive: true })
	const stamp = new Date().toISOString().replace(/[:.]/g, '-')
	const file = path.join(EVIDENCE_DIR, `sync-eval-${stamp}.json`)
	const latest = path.join(EVIDENCE_DIR, 'latest.json')
	const text = JSON.stringify(evidence, null, 2)
	await fs.writeFile(file, text, 'utf8')
	await fs.writeFile(latest, text, 'utf8')
	console.log('evidence', file)
}

main()
