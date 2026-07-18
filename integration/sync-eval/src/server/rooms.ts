/**
 * Authoritative per-document rooms — adapted from official
 * templates/simple-server-example/src/server/rooms.ts @ tldraw v5.2.5
 *
 * One TLSocketRoom per roomId, persisted with SQLiteSyncStorage + better-sqlite3.
 */
import { mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import { syncEvalSchema } from '../../shared/schema'

function roomsDir(): string {
	const dir = resolve(process.env.ROOMS_DIR || './.rooms')
	mkdirSync(dir, { recursive: true })
	return dir
}

/** Fixed-size, path-safe room key that does not merge distinct user-provided IDs. */
export function sanitizeRoomId(roomId: string): string {
	return createHash('sha256').update(roomId, 'utf8').digest('hex')
}

type RoomEntry = {
	room: TLSocketRoom<any, void>
	db: Database.Database
}

const rooms = new Map<string, RoomEntry>()

export function makeOrLoadRoom(roomId: string): TLSocketRoom<any, void> {
	const safeId = sanitizeRoomId(roomId)

	const existing = rooms.get(safeId)
	if (existing && !existing.room.isClosed()) {
		return existing.room
	}

	console.log('[rooms] loading', safeId)
	const db = new Database(join(roomsDir(), `${safeId}.db`))
	const sql = new NodeSqliteWrapper(db)
	const storage = new SQLiteSyncStorage({ sql })

	const room = new TLSocketRoom({
		schema: syncEvalSchema,
		storage,
		onSessionRemoved(room, args) {
			console.log('[rooms] client disconnected', args.sessionId, safeId)
			if (args.numSessionsRemaining === 0) {
				console.log('[rooms] closing idle room', safeId)
				room.close()
				db.close()
				rooms.delete(safeId)
			}
		},
	})

	rooms.set(safeId, { room, db })
	return room
}

export function getActiveRoomIds(): string[] {
	return [...rooms.keys()]
}

export function closeAllRooms(): void {
	for (const [id, entry] of rooms) {
		try {
			entry.room.close()
		} catch {
			/* ignore */
		}
		try {
			entry.db.close()
		} catch {
			/* ignore */
		}
		rooms.delete(id)
	}
}
