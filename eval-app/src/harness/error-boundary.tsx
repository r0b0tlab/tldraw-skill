export function EvalErrorFallback({ error }: { error: unknown }) {
	const detail = error instanceof Error ? error.message : String(error)
	return (
		<div
			className="eval-error-fallback"
			data-testid="eval-error-fallback"
			role="alert"
			aria-live="assertive"
		>
			<strong>Canvas recovery boundary</strong>
			<span>The editor isolated a rendering failure.</span>
			<code>{detail}</code>
		</div>
	)
}

export function EvalErrorProbe() {
	if (new URLSearchParams(window.location.search).get('forceError') === '1') {
		throw new Error('intentional evaluation render failure')
	}
	return null
}
