<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
	let connected = $state(false);
	let more = $state(false);
	let es: EventSource | undefined;

	let active = $derived($page.url.pathname.endsWith('/roster') ? 'roster' : $page.url.pathname.includes('/combat') ? 'combat' : 'notes');

	onMount(() => {
		es = new EventSource(`/c/${data.campaignId}/events`);
		es.onopen = () => (connected = true);
		es.onerror = () => (connected = false);
		return () => es?.close();
	});

	function closeMore(e: PointerEvent) {
		if (!(e.target as HTMLElement).closest('.more')) more = false;
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (more = false)} onpointerdown={closeMore} />
<header class="bar">
	<a href="/" class="back">←</a>
	<span class="status-pill" class:ok={connected} class:error={!connected}>{connected ? 'Live' : 'Reconnecting'}</span>
	<span class="crumb" title={data.campaignTitle}>{data.campaignTitle}</span>
	<span class="gsep" aria-hidden="true"></span>
	<nav class="tabs">
		<a href={`/c/${data.campaignId}`} class="tab" class:active={active === 'notes'}>Notes</a>
		<a href={`/c/${data.campaignId}/combat`} class="tab" class:active={active === 'combat'}>Combat</a>
		<a href={`/c/${data.campaignId}/combat/roster`} class="tab" class:active={active === 'roster'}>Roster</a>
	</nav>
	<div class="spacer"></div>
	<label class="upload">Add map<input type="file" accept="image/*" class="visually-hidden" onchange={(e) => window.dispatchEvent(new CustomEvent('campaign-add-map', { detail: e }))} /></label>
	<div class="more">
		<button type="button" class="toggle" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded={more} onclick={() => (more = !more)}>⋮</button>
		{#if more}<div class="menu" role="menu"><a role="menuitem" href={`/c/${data.campaignId}/export`}>Export</a></div>{/if}
	</div>
	<span class="gsep" aria-hidden="true"></span>
	<form method="POST" action="/logout" class="logout"><button type="submit" title="Log out as DM">Log out</button></form>
</header>

{@render children()}

<style>
	.bar { height: 3.3rem; display:flex; align-items:center; gap:.7rem; padding:.6rem 1rem; border-bottom:1px solid var(--rule); background:var(--parchment-deep); position:relative; z-index:20; }
	.back { color:var(--ink-soft); text-decoration:none; font-size:1.25rem; }
	.status-pill { font:600 .65rem var(--font-ui); text-transform:uppercase; letter-spacing:.08em; color:var(--ink-soft); white-space:nowrap; }
	.status-pill.ok { color:var(--success); } .status-pill.error { color:var(--danger); }
	.crumb { color:var(--ink); font:600 .85rem var(--font-ui); max-width:18rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.gsep { width:1px; height:1.3rem; background:var(--rule); flex:none; }
	.tabs { display:flex; gap:.15rem; } .tab { padding:.38rem .7rem; color:var(--ink-soft); text-decoration:none; font:600 .76rem var(--font-ui); border-bottom:2px solid transparent; }
	.tab:hover,.tab.active { color:var(--accent); } .tab.active { border-color:var(--accent); }
	.spacer { flex:1; } .upload { color:var(--ink-soft); font:.72rem var(--font-ui); cursor:pointer; white-space:nowrap; } .more { position:relative; } .toggle { background:none; border:0; color:var(--ink-soft); font-size:1.35rem; cursor:pointer; }
	.menu { position:absolute; right:0; top:2rem; min-width:8rem; padding:.35rem; background:var(--parchment-light); border:1px solid var(--rule); box-shadow:var(--shadow-md); }
	.menu a { display:block; padding:.45rem .6rem; color:var(--ink); text-decoration:none; font:.8rem var(--font-ui); }
	.logout button { background:none; border:0; color:var(--ink-soft); cursor:pointer; font:.72rem var(--font-ui); }
	@media (max-width: 42rem) { .crumb { max-width:8rem; } .tab { padding-inline:.35rem; } .status-pill { display:none; } }
</style>
