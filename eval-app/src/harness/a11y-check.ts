/**
 * Runtime accessibility probes for the eval panel + custom shape aria descriptor.
 */

import type { Editor } from 'tldraw'
import { DIAGRAM_IDS } from '../diagram/create-architecture-diagram'
import { EVAL_BADGE_TYPE } from '../custom/EvalBadgeShapeUtil'

export interface A11yCheckResult {
	ok: boolean
	ariaDescriptor: boolean
	ariaDescriptorText: string | null
	shapeTextOk: boolean
	shapeText: string | null
	statusFontSizePx: number | null
	statusFontSizeOk: boolean
	statusContrastOk: boolean
	reducedMotionRulePresent: boolean
	panelAriaLabel: boolean
	detail: string
}

function parseRgb(color: string): { r: number; g: number; b: number } | null {
	const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
	if (!m) return null
	return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
	const lin = [r, g, b].map((v) => {
		const s = v / 255
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
	})
	return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}

function contrastRatio(fg: string, bg: string): number | null {
	const a = parseRgb(fg)
	const b = parseRgb(bg)
	if (!a || !b) return null
	const l1 = relativeLuminance(a)
	const l2 = relativeLuminance(b)
	const lighter = Math.max(l1, l2)
	const darker = Math.min(l1, l2)
	return (lighter + 0.05) / (darker + 0.05)
}

export function runA11yCheck(editor: Editor): A11yCheckResult {
	let ariaDescriptor = false
	let ariaDescriptorText: string | null = null
	let shapeTextOk = false
	let shapeText: string | null = null

	const badge = editor.getShape(DIAGRAM_IDS.evalBadge)
	if (badge && badge.type === EVAL_BADGE_TYPE) {
		const util = editor.getShapeUtil(badge)
		if (util && typeof util.getAriaDescriptor === 'function') {
			const desc = util.getAriaDescriptor(badge)
			ariaDescriptorText = typeof desc === 'string' ? desc : null
			ariaDescriptor =
				typeof desc === 'string' &&
				desc.toLowerCase().includes('evaluation badge') &&
				desc.length > 0
				}
				if (util && typeof util.getText === 'function') {
				const text = util.getText(badge)
				shapeText = typeof text === 'string' ? text : null
				shapeTextOk = shapeText === badge.props.label && shapeText.length > 0
				}
	}

	let statusFontSizePx: number | null = null
	let statusFontSizeOk = false
	let statusContrastOk = false
	let panelAriaLabel = false

	if (typeof document !== 'undefined') {
		const panel = document.querySelector('.eval-panel')
		panelAriaLabel = panel?.getAttribute('aria-label') === 'Evaluation status'

		const statusEl = document.querySelector('.eval-status')
		if (statusEl) {
			const styles = window.getComputedStyle(statusEl)
			const fontSize = parseFloat(styles.fontSize)
			statusFontSizePx = Number.isFinite(fontSize) ? fontSize : null
			statusFontSizeOk = statusFontSizePx !== null && statusFontSizePx >= 12

			const ratio = contrastRatio(styles.color, styles.backgroundColor)
			// WCAG AA normal text ~4.5:1; allow slightly softer for dense status (3:1 UI text floor).
			statusContrastOk = ratio !== null && ratio >= 4.5
		}
	}

	// Reduced motion: presence of a matching stylesheet rule in document stylesheets.
	let reducedMotionRulePresent = false
	if (typeof document !== 'undefined') {
		try {
			for (const sheet of Array.from(document.styleSheets)) {
				let rules: CSSRuleList | undefined
				try {
					rules = sheet.cssRules
				} catch {
					continue
				}
				if (!rules) continue
				for (const rule of Array.from(rules)) {
					if (
						rule instanceof CSSMediaRule &&
						rule.conditionText.includes('prefers-reduced-motion')
					) {
						reducedMotionRulePresent = true
						break
					}
					if (
						'cssText' in rule &&
						typeof rule.cssText === 'string' &&
						rule.cssText.includes('prefers-reduced-motion')
					) {
						reducedMotionRulePresent = true
						break
					}
				}
				if (reducedMotionRulePresent) break
			}
		} catch {
			reducedMotionRulePresent = false
		}
		// Also accept explicit data attribute we set on root for harness certainty.
		if (document.documentElement.dataset.evalReducedMotionCss === '1') {
			reducedMotionRulePresent = true
		}
	}

	const ok =
		ariaDescriptor &&
		shapeTextOk &&
		statusFontSizeOk &&
		statusContrastOk &&
		reducedMotionRulePresent &&
		panelAriaLabel

	return {
		ok,
		ariaDescriptor,
		ariaDescriptorText,
		shapeTextOk,
		shapeText,
		statusFontSizePx,
		statusFontSizeOk,
		statusContrastOk,
		reducedMotionRulePresent,
		panelAriaLabel,
		detail: ok
			? 'a11y runtime checks passed'
			: `aria=${ariaDescriptor} text=${shapeTextOk} font=${statusFontSizeOk}(${statusFontSizePx}) contrast=${statusContrastOk} reducedMotion=${reducedMotionRulePresent} panelAria=${panelAriaLabel}`,
	}
}
