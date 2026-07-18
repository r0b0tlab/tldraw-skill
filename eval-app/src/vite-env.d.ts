/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly DEV: boolean
	readonly PROD: boolean
	readonly MODE: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

interface Window {
	__hermesTldrawBridge?: import('./bridge/hermes-dev-bridge').HermesDevBridge
	__hermesTldrawEvalStatus?: Record<string, unknown>
	__hermesTldrJson?: string
	__hermesSvg?: string
	__hermesDriverReady?: boolean
}
