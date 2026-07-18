import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function packageVersion(packagePath: string): string {
	return JSON.parse(fs.readFileSync(path.join(__dirname, packagePath), 'utf8')).version
}

export default defineConfig({
	plugins: [react()],
	root: path.join(__dirname, 'src/client'),
	publicDir: path.join(__dirname, 'public'),
	resolve: {
		alias: {
			'@shared': path.join(__dirname, 'shared'),
		},
	},
	define: {
		__TLDRAW_VERSION__: JSON.stringify(packageVersion('node_modules/tldraw/package.json')),
		__TLDRAW_SYNC_VERSION__: JSON.stringify(
			packageVersion('node_modules/@tldraw/sync/package.json')
		),
	},
	server: {
		host: '127.0.0.1',
		port: 5757,
		strictPort: true,
	},
	build: {
		outDir: path.join(__dirname, 'dist'),
		emptyOutDir: true,
	},
	optimizeDeps: {
		exclude: ['@tldraw/assets'],
	},
})
