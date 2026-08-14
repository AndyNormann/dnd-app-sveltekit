<script lang="ts">
	let {
		size = 64,
		tone = 'default',
		class: klass = '',
		title = 'D&D Campaign Notes'
	}: {
		size?: number;
		tone?: 'default' | 'small';
		class?: string;
		title?: string;
	} = $props();
	const m = tone === 'small' ? 0.8 : 1;
</script>

<svg class={['seal', klass ?? ''].join(' ')} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title}>
	<defs>
		<radialGradient id="wax-dome" cx="38%" cy="30%" r="75%">
			<stop offset="0%" stop-color="#e8795f" />
			<stop offset="45%" stop-color="#c94f3d" />
			<stop offset="78%" stop-color="#8b2020" />
			<stop offset="100%" stop-color="#5f1412" />
		</radialGradient>
		<filter id="wax-soft" x="-20%" y="-20%" width="140%" height="140%">
			<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n" />
			<feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" />
		</filter>
	</defs>
	<g transform={`scale(${m}) translate(${50 * (1 - m)} ${50 * (1 - m)})`}>
		<!-- wax blob: slightly irregular, domed -->
		<path
			d="M50 8 C70 6 88 18 92 38 C96 56 88 76 72 88 C56 99 32 96 20 82 C8 68 6 42 18 26 C28 12 40 9 50 8 Z"
			fill="url(#wax-dome)"
			filter="url(#wax-soft)"
		/>
		<!-- pressed ring -->
		<circle cx="50" cy="51" r="33" fill="none" stroke="rgba(255,220,200,0.35)" stroke-width="2" stroke-dasharray="1 3" />
		<!-- embossed d20 crest -->
		<g fill="none" stroke="rgba(60,8,6,0.55)" stroke-width="3.5" stroke-linejoin="round" transform="translate(0 6)">
			<polygon points="50,22 78,40 78,63 50,81 22,63 22,40" fill="rgba(120,25,20,0.35)" />
			<polygon points="50,30 68,50 32,50" fill="none" />
			<line x1="50" y1="22" x2="50" y2="34" />
			<line x1="78" y1="40" x2="68" y2="50" />
			<line x1="22" y1="40" x2="32" y2="50" />
		</g>
	</g>
</svg>

<style>
	.seal {
		display: inline-block;
		vertical-align: middle;
		flex-shrink: 0;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
	}
</style>
