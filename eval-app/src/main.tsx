import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Machine-readable signal that reduced-motion CSS is part of the eval app bundle.
document.documentElement.dataset.evalReducedMotionCss = '1'

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
)
