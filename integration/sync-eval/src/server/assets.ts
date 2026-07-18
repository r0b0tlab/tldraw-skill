import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { MAX_UPLOAD_BYTES, uploadMimeMatchesBytes } from '../../shared/security'

function assetsDir(): string {
	return resolve(process.env.ASSETS_DIR || './.assets')
}

export class PayloadTooLargeError extends Error {
	readonly statusCode = 413
	constructor(message = 'payload_too_large') {
		super(message)
		this.name = 'PayloadTooLargeError'
	}
}

export class UnsupportedMediaTypeError extends Error {
	readonly statusCode = 415
	constructor(message = 'unsupported_media_type') {
		super(message)
		this.name = 'UnsupportedMediaTypeError'
	}
}

export async function storeAsset(
	id: string,
	stream: Readable,
	opts?: { maxBytes?: number; contentType?: string }
) {
	const dir = assetsDir()
	await mkdir(dir, { recursive: true })
	// Prevent path traversal
	const safe = id.replace(/[^a-zA-Z0-9._-]/g, '_')
	const maxBytes = opts?.maxBytes ?? MAX_UPLOAD_BYTES

	const chunks: Buffer[] = []
	let total = 0
	for await (const chunk of stream) {
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
		total += buf.length
		if (total > maxBytes) {
			stream.destroy()
			throw new PayloadTooLargeError()
		}
		chunks.push(buf)
	}

	const data = Buffer.concat(chunks, total)
	if (!uploadMimeMatchesBytes(opts?.contentType, data)) {
		throw new UnsupportedMediaTypeError()
	}
	await writeFile(join(dir, safe), data)
}

export async function loadAsset(id: string) {
	const safe = id.replace(/[^a-zA-Z0-9._-]/g, '_')
	return await readFile(join(assetsDir(), safe))
}
