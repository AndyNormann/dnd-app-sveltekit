<script lang="ts">
	import { onMount } from 'svelte';

	// 5 blue+green highlight sets, all on the shared Obsidian base.
	const THEMES = [
		{ id: 'sapphire', label: 'Sapphire', dot: '#7aa8f5' },
		{ id: 'azure', label: 'Azure', dot: '#4d9de0' },
		{ id: 'sky', label: 'Sky', dot: '#8fb8f7' },
		{ id: 'indigo', label: 'Indigo', dot: '#6f8ff5' },
		{ id: 'ocean', label: 'Ocean', dot: '#3f8fd6' }
	] as const;

	type ThemeId = (typeof THEMES)[number]['id'];

	let active = $state<ThemeId>('sapphire');

	onMount(() => {
		const saved = localStorage.getItem('dnd-theme') as ThemeId | null;
		if (saved && THEMES.some((t) => t.id === saved)) {
			active = saved;
		}
		document.documentElement.dataset.theme = active;
	});

	function pick(id: ThemeId) {
		active = id;
		document.documentElement.dataset.theme = id;
		try {
			localStorage.setItem('dnd-theme', id);
		} catch {
			/* ignore */
		}
	}
</script>

<div class="themes" role="group" aria-label="Color theme">
	<div class="dots">
		{#each THEMES as t (t.id)}
			<button
				class="dotbtn"
				class:on={active === t.id}
				onclick={() => pick(t.id)}
				aria-pressed={active === t.id}
				title={t.label}
				aria-label={t.label}
				style:--dot={t.dot}
			></button>
		{/each}
	</div>
	<span class="name">{THEMES.find((t) => t.id === active)?.label ?? ''}</span>
</div>

<style>
	.themes {
		position: fixed;
		top: 0.5rem;
		right: 0.75rem;
		z-index: 3000;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.6rem;
		background: color-mix(in srgb, var(--parchment-deep) 88%, transparent);
		border: 1px solid var(--rule);
		border-radius: 999px;
		backdrop-filter: blur(6px);
		box-shadow: 0 4px 18px rgba(0, 0, 0, 0.35);
	}
	.dots {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.dotbtn {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 50%;
		background: var(--dot);
		border: 2px solid transparent;
		padding: 0;
		cursor: pointer;
		transition: transform 0.12s ease, border-color 0.12s ease;
	}
	.dotbtn:hover {
		transform: scale(1.15);
	}
	.dotbtn.on {
		border-color: var(--ink);
		transform: scale(1.15);
	}
	.name {
		font-family: var(--font-body);
		font-size: 0.78rem;
		color: var(--ink);
		line-height: 1;
		white-space: nowrap;
	}
	@media (max-width: 640px) {
		.name {
			display: none;
		}
	}
</style>
