<script lang="ts">
	import { onMount } from 'svelte';

	let {
		at = 0
	}: {
		at?: number;
	} = $props();

	let now = $state(Date.now());

	onMount(() => {
		const t = setInterval(() => (now = Date.now()), 30_000);
		return () => clearInterval(t);
	});

	function label() {
		const s = Math.max(0, Math.floor((now - at) / 1000));
		if (s < 5) return 'just now';
		if (s < 60) return `${s}s ago`;
		const m = Math.floor(s / 60);
		if (m < 60) return `${m}m ago`;
		const h = Math.floor(m / 60);
		return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
	}
</script>

<span class="stamp" title="Last realtime update">Updated {label()}</span>

<style>
	.stamp {
		font-size: 0.75rem;
		color: var(--ink-soft);
	}
</style>
