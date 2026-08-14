<script lang="ts">
	/**
	 * Screen-reader live regions. Mount one per page that receives realtime SSE
	 * events and call `announce(msg, polite)` so important changes are spoken
	 * instead of happening silently. `role=status` (polite) for routine news and
	 * `role=alert` (assertive) for things that need attention. Both are visually
	 * hidden but stay in the a11y tree.
	 */
	let polite = $state('');
	let alert = $state('');

	export function announce(msg: string, assertive = false) {
		if (!msg) return;
		// reset so a repeated identical message still re-announces
		if (assertive) {
			alert = '';
			requestAnimationFrame(() => (alert = msg));
		} else {
			polite = '';
			requestAnimationFrame(() => (polite = msg));
		}
	}
</script>

<div class="a11y-live" aria-live="polite" role="status">{polite}</div>
<div class="a11y-live" aria-live="assertive" role="alert">{alert}</div>

<style>
	.a11y-live {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
</style>
