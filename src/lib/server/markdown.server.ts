import sanitizeHtml from 'sanitize-html';
import {
	computeSharedMarkdown,
	effectiveShared,
	expandWikiLinks,
	makeWikiResolver,
	parseHeadings,
	renderWithAnchors,
	type MetaMap
} from '$lib/markdown';

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
	allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
	allowedAttributes: {
		...sanitizeHtml.defaults.allowedAttributes,
		a: ['href', 'name', 'target', 'class', 'data-heading-id'],
		img: ['src', 'alt', 'title'],
		div: ['class', 'data-map-id'],
		h1: ['id', 'data-heading-id', 'data-level'],
		h2: ['id', 'data-heading-id', 'data-level'],
		h3: ['id', 'data-heading-id', 'data-level'],
		h4: ['id', 'data-heading-id', 'data-level'],
		h5: ['id', 'data-heading-id', 'data-level'],
		h6: ['id', 'data-heading-id', 'data-level']
	},
	allowedClasses: { div: ['map-embed'], a: ['wiki-link'] }
};

/** Compute the shared subset and render it for players (sanitized). */
export function renderSharedForPlayer(markdown: string, meta: MetaMap): string {
	// Wiki links resolve only against effectively-shared headings so player
	// output never leaks hidden section names as links.
	const headings = parseHeadings(markdown);
	const sharedHeadings = headings.filter((_, idx) => effectiveShared(idx, headings, meta));
	const resolver = makeWikiResolver(sharedHeadings);

	const shared = computeSharedMarkdown(markdown, meta);
	const html = renderWithAnchors(expandWikiLinks(shared, resolver, 'plain'));
	return sanitizeHtml(html, SANITIZE_OPTS);
}
