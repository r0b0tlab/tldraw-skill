/// <reference types="vite/client" />

declare const __TLDRAW_VERSION__: string
declare const __TLDRAW_SYNC_VERSION__: string

interface ImportMetaEnv {
	readonly VITE_SYNC_HTTP_URL?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
