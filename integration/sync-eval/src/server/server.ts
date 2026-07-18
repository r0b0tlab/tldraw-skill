/**
 * Local self-hosted tldraw sync server for integration eval.
 *
 * Pattern: official templates/simple-server-example @ tldraw v5.2.5
 * (Fastify + @fastify/websocket + TLSocketRoom + SQLiteSyncStorage).
 *
 * Extra harness pieces (not claimed as production):
 * - SYNC_AUTH_TOKEN gate on /connect and /uploads
 * - explicit CORS (loopback + SYNC_CORS_ORIGINS), never origin:true
 * - upload MIME allowlist + body size cap
 * - refuse non-loopback bind with default demo token
 * - /health, /auth-check, /connect-probe for tests
 * - matching createTLSchema on server (shared/schema.ts)
 *
 * This is NOT a production multiplayer deployment. See SECURITY.md.
 */
import cors from '@fastify/cors'
import websocketPlugin from '@fastify/websocket'
import fastify from 'fastify'
import type { RawData } from 'ws'
import { isAuthorizedToken, unauthorizedReason, getExpectedToken } from './auth'
import {
	loadAsset,
	PayloadTooLargeError,
	storeAsset,
	UnsupportedMediaTypeError,
} from './assets'
import { closeAllRooms, getActiveRoomIds, makeOrLoadRoom } from './rooms'
import {
	assertSafeListenConfig,
	extractRequestToken,
	getCorsAllowlistFromEnv,
	isAllowedCorsOrigin,
	isAllowedUploadMime,
	detectAllowedImageMime,
	MAX_UPLOAD_BYTES,
} from '../../shared/security'

const PORT = Number(process.env.SYNC_PORT || 5858)
const HOST = process.env.SYNC_HOST || '127.0.0.1'

try {
	assertSafeListenConfig({ host: HOST, token: process.env.SYNC_AUTH_TOKEN })
} catch (e) {
	console.error('[server] refusing to start:', e instanceof Error ? e.message : e)
	process.exit(1)
}

const corsAllowlist = getCorsAllowlistFromEnv(process.env.SYNC_CORS_ORIGINS)

const app = fastify({ logger: false })
await app.register(websocketPlugin)
await app.register(cors, {
	origin(origin, cb) {
		if (isAllowedCorsOrigin(origin, corsAllowlist)) {
			// Echo only when allowed — never origin:true reflection of arbitrary hosts.
			cb(null, origin || true)
			return
		}
		cb(null, false)
	},
})

app.get('/health', async () => ({
	ok: true,
	service: 'tldraw-sync-eval',
	pattern: 'simple-server-example',
	auth: 'token-query-param',
	tokenConfigured: Boolean(getExpectedToken()),
	cors: {
		mode: 'explicit',
		allowlist: corsAllowlist,
		loopbackOriginsAllowed: true,
	},
	uploads: {
		auth: true,
		maxBytes: MAX_UPLOAD_BYTES,
		mimeAllowlist: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
	},
	activeRooms: getActiveRoomIds(),
	versions: {
		note: 'see client harness + package-lock for pinned 5.2.5',
	},
}))

/** HTTP mirror of connect auth for easy Playwright/fetch assertions. */
app.get('/auth-check', async (req, res) => {
	const token = extractRequestToken(req)
	if (!isAuthorizedToken(token)) {
		res.code(401)
		return { ok: false, reason: unauthorizedReason(token) }
	}
	return { ok: true }
})

/**
 * Non-WS probe that applies the same authorization decision as /connect/:roomId.
 * (Full WS rejection is enforced on the websocket route below.)
 */
app.get('/connect-probe', async (req, res) => {
	const q = req.query as { roomId?: string; token?: string }
	if (!q.roomId) {
		res.code(400)
		return { accepted: false, reason: 'missing_room' }
	}
	const token = extractRequestToken(req)
	if (!isAuthorizedToken(token)) {
		res.code(401)
		return { accepted: false, reason: unauthorizedReason(token), code: 4401 }
	}
	return { accepted: true, roomId: q.roomId }
})

await app.register(async (scope) => {
	// Main multiplayer entrypoint — official simple-server-example pattern + auth gate
	scope.get('/connect/:roomId', { websocket: true }, async (socket, req) => {
		const roomId = (req.params as { roomId: string }).roomId
		const sessionId = (req.query as { sessionId?: string }).sessionId
		const token = extractRequestToken(req)

		if (!sessionId) {
			socket.close(4400, 'missing_sessionId')
			return
		}

		if (!isAuthorizedToken(token)) {
			console.log('[auth] reject connect', roomId, unauthorizedReason(token))
			socket.close(4401, 'unauthorized')
			return
		}

		// At least one message handler must be attached before any async work
		// https://github.com/fastify/fastify-websocket#attaching-event-handlers
		const caughtMessages: RawData[] = []
		const collectMessagesListener = (message: RawData) => {
			caughtMessages.push(message)
		}
		socket.on('message', collectMessagesListener)

		try {
			const room = makeOrLoadRoom(roomId)
			room.handleSocketConnect({ sessionId, socket })
		} catch (e) {
			console.error('[connect] failed', e)
			socket.off('message', collectMessagesListener)
			socket.close(1011, 'room_error')
			return
		}

		socket.off('message', collectMessagesListener)
		for (const message of caughtMessages) {
			socket.emit('message', message)
		}
	})

	// Asset blob storage (filesystem) — auth + MIME + size limits (harness hardened)
	scope.addContentTypeParser('*', (_req, _payload, done) => done(null))
	scope.put('/uploads/:id', async (req, res) => {
		const token = extractRequestToken(req)
		if (!isAuthorizedToken(token)) {
			res.code(401)
			return { ok: false, reason: unauthorizedReason(token) }
		}

		const contentType = req.headers['content-type']
		if (!isAllowedUploadMime(contentType)) {
			res.code(415)
			return { ok: false, reason: 'unsupported_media_type' }
		}

		const lengthHeader = req.headers['content-length']
		const contentLength =
			typeof lengthHeader === 'string' ? Number(lengthHeader) : Number(lengthHeader?.[0])
		if (!Number.isFinite(contentLength) || contentLength <= 0) {
			res.code(411)
			return { ok: false, reason: 'missing_content_length' }
		}
		if (contentLength > MAX_UPLOAD_BYTES) {
			res.code(413)
			return { ok: false, reason: 'payload_too_large' }
		}

		const id = (req.params as { id: string }).id
		try {
			await storeAsset(id, req.raw, {
				maxBytes: MAX_UPLOAD_BYTES,
				contentType,
			})
		} catch (e) {
			if (e instanceof PayloadTooLargeError) {
				res.code(413)
				return { ok: false, reason: 'payload_too_large' }
			}
			if (e instanceof UnsupportedMediaTypeError) {
				res.code(415)
				return { ok: false, reason: 'content_type_mismatch' }
			}
			throw e
		}
		res.send({ ok: true })
	})
	scope.get('/uploads/:id', async (req, res) => {
		const token = extractRequestToken(req)
		if (!isAuthorizedToken(token)) {
			res.code(401)
			return { ok: false, reason: unauthorizedReason(token) }
		}
		const id = (req.params as { id: string }).id
		const data = await loadAsset(id)
		const contentType = detectAllowedImageMime(data)
		if (!contentType) {
			res.code(415)
			return { ok: false, reason: 'stored_media_type_invalid' }
		}
		res.header('Content-Type', contentType)
		res.header('Content-Security-Policy', "default-src 'none'")
		res.header('X-Content-Type-Options', 'nosniff')
		res.send(data)
	})
})

const shutdown = async () => {
	console.log('[server] shutting down')
	closeAllRooms()
	await app.close()
	process.exit(0)
}
process.on('SIGTERM', () => void shutdown())
process.on('SIGINT', () => void shutdown())

try {
	await app.listen({ port: PORT, host: HOST })
	console.log(`[server] tldraw sync-eval listening on http://${HOST}:${PORT}`)
	console.log('[server] NOT FOR PRODUCTION — see SECURITY.md')
} catch (err) {
	console.error(err)
	process.exit(1)
}
