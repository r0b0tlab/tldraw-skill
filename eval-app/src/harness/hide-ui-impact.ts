/**
 * Runtime hideUi impact probe (tldraw 5.2.5).
 *
 * Proves chrome visibility flips with hideUi, measures whether default tool
 * keyboard shortcuts still fire while hidden, then restores UI (must not leave hidden).
 */

import type { Editor } from 'tldraw'

export interface HideUiImpactResult {
	ok: boolean
	uiVisibleBefore: boolean
	uiHiddenWhenHideUi: boolean
	shortcutToolBefore: string | null
	shortcutToolAfterKeyD: string | null
	/** Observed 5.2.5 behavior: useKeyboardShortcuts stays mounted under hideUi. */
	shortcutsStillWorkWithHideUi: boolean
	uiRestoredAfter: boolean
	/** Must be false — probe always restores chrome. */
	leftUiHidden: boolean
	detail: string
}

const UI_SELECTOR = '.tlui-main-toolbar, .tlui-layout__top, .tlui-toolbar'

function uiChromePresent(): boolean {
	if (typeof document === 'undefined') return false
	return Boolean(document.querySelector(UI_SELECTOR))
}

function waitFrames(n = 2): Promise<void> {
	return new Promise((resolve) => {
		const step = (left: number) => {
			if (left <= 0) {
				resolve()
				return
			}
			requestAnimationFrame(() => step(left - 1))
		}
		step(n)
	})
}

async function waitForUi(present: boolean, timeoutMs = 3000): Promise<boolean> {
	const start = performance.now()
	while (performance.now() - start < timeoutMs) {
		if (uiChromePresent() === present) return true
		await waitFrames(1)
	}
	return uiChromePresent() === present
}

function dispatchToolKeyD() {
	const opts = { key: 'd', code: 'KeyD', bubbles: true, cancelable: true }
	document.body.dispatchEvent(new KeyboardEvent('keydown', opts))
	document.body.dispatchEvent(new KeyboardEvent('keyup', opts))
}

/**
 * @param setHideUi - React state setter that controls <Tldraw hideUi={...} />
 */
export async function runHideUiImpactCheck(
	editor: Editor,
	setHideUi: (hidden: boolean) => void
): Promise<HideUiImpactResult> {
	const empty: HideUiImpactResult = {
		ok: false,
		uiVisibleBefore: false,
		uiHiddenWhenHideUi: false,
		shortcutToolBefore: null,
		shortcutToolAfterKeyD: null,
		shortcutsStillWorkWithHideUi: false,
		uiRestoredAfter: false,
		leftUiHidden: true,
		detail: 'not run',
	}

	if (typeof document === 'undefined') {
		return { ...empty, detail: 'no document' }
	}

	try {
		// Ensure we start with chrome visible.
		setHideUi(false)
		await waitFrames(2)
		const uiVisibleBefore = await waitForUi(true)

		editor.focus()
		editor.setCurrentTool('select')
		await waitFrames(1)
		const shortcutToolBefore = editor.getCurrentToolId()

		// Hide UI chrome.
		setHideUi(true)
		await waitFrames(2)
		const uiHiddenWhenHideUi = await waitForUi(false)

		// Measure shortcut impact while hidden (do not assume docs wording).
		editor.focus()
		editor.setCurrentTool('select')
		await waitFrames(1)
		dispatchToolKeyD()
		await waitFrames(2)
		const shortcutToolAfterKeyD = editor.getCurrentToolId()
		const shortcutsStillWorkWithHideUi = shortcutToolAfterKeyD === 'draw'

		// Always restore chrome — part of the green contract.
		setHideUi(false)
		await waitFrames(2)
		const uiRestoredAfter = await waitForUi(true)
		const leftUiHidden = !uiRestoredAfter || uiChromePresent() === false

		// Leave canvas on select for screenshots / further checks.
		editor.setCurrentTool('select')
		editor.setSelectedShapes([])

		const ok =
			uiVisibleBefore &&
			uiHiddenWhenHideUi &&
			uiRestoredAfter &&
			!leftUiHidden &&
			shortcutToolBefore === 'select' &&
			// Require a measured boolean outcome (true in 5.2.5 upstream tests).
			typeof shortcutsStillWorkWithHideUi === 'boolean' &&
			shortcutsStillWorkWithHideUi

		return {
			ok,
			uiVisibleBefore,
			uiHiddenWhenHideUi,
			shortcutToolBefore,
			shortcutToolAfterKeyD,
			shortcutsStillWorkWithHideUi,
			uiRestoredAfter,
			leftUiHidden,
			detail: ok
				? `hideUi chrome toggled; shortcuts still work (tool ${shortcutToolBefore}→${shortcutToolAfterKeyD}); UI restored`
				: `before=${uiVisibleBefore} hidden=${uiHiddenWhenHideUi} restored=${uiRestoredAfter} leftHidden=${leftUiHidden} tool=${shortcutToolBefore}→${shortcutToolAfterKeyD} shortcutsWork=${shortcutsStillWorkWithHideUi}`,
		}
	} catch (e) {
		// Best-effort restore on failure.
		try {
			setHideUi(false)
		} catch {
			/* ignore */
		}
		return {
			...empty,
			detail: e instanceof Error ? e.message : String(e),
		}
	}
}
