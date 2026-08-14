import sanitizeHtml from 'sanitize-html';
import {
	expandWikiLinks,
	makeWikiResolver,
	parseHeadings,
	renderWithAnchors
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

/** Render a whole document for players (document-level sharing; sanitized). */
export function renderDocument(markdown: string): string {
	const headings = parseHeadings(markdown);
	const resolver = makeWikiResolver(headings);
	const html = renderWithAnchors(expandWikiLinks(markdown, resolver, 'plain'));
	return sanitizeHtml(html, SANITIZE_OPTS);
}
