import sanitizeHtml from 'sanitize-html';
import {
	computeSharedMarkdown,
	createRenderer,
	expandMapDirectives,
	type MetaMap
} from '$lib/markdown';

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
	allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
	allowedAttributes: {
		...sanitizeHtml.defaults.allowedAttributes,
		img: ['src', 'alt', 'title'],
		div: ['class', 'data-map-id']
	},
	allowedClasses: { div: ['map-embed'] }
};

/** Render + sanitize markdown for players. */
export function renderForPlayer(markdown: string): string {
	const md = createRenderer();
	const html = md.render(expandMapDirectives(markdown));
	return sanitizeHtml(html, SANITIZE_OPTS);
}

/** Compute the shared subset and render it for players. */
export function renderSharedForPlayer(markdown: string, meta: MetaMap): string {
	return renderForPlayer(computeSharedMarkdown(markdown, meta));
}
