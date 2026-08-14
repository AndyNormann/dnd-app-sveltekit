import MarkdownIt from 'markdown-it';

/**
 * Shared markdown pipeline for the DM editor and the player view.
 *
 * The campaign's notes live in per-document markdown blobs. Headings carry no
 * stored id markers; heading anchors are derived on the fly from the heading
 * text (a URL-safe slug), so round-tripping through the editor is lossless and
 * there is no per-heading metadata to maintain.
 */

/** Detect lines that open/close a fenced code block so we don't treat `# x` inside code as a heading. */
function isFence(line: string): boolean {
	return /^\s*(```|~~~)/.test(line);
}

export interface HeadingNode {
	/** Anchor id derived from the heading text (slug), not a stored marker. */
	id: string;
	level: number;
	text: string;
}

/** Build a stable, URL-safe anchor id from a heading's text. */
export function slugify(s: string): string {
	return (
		s
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'heading'
	);
}

/** Parse the heading list from markdown. Anchor ids are derived from text. */
export function parseHeadings(markdown: string): HeadingNode[] {
	const headings: HeadingNode[] = [];
	let inFence = false;
	for (const line of markdown.split('\n')) {
		if (isFence(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
		if (!m) continue;
		const text = m[2].trim();
		headings.push({ id: slugify(text), level: m[1].length, text });
	}
	return headings;
}

/** Replace `::map{id=xxx}` directives with a hydration placeholder div. */
export function expandMapDirectives(markdown: string): string {
	// id may contain a backslash-escaped underscore (Milkdown writes `_` as `\_`)
	return markdown.replace(/^::map\{id=([A-Za-z0-9_\\-]+)\}\s*$/gm, (_m, id) => {
		return `<div class="map-embed" data-map-id="${id.replace(/\\/g, '')}"></div>`;
	});
}

export function createRenderer(): MarkdownIt {
	return new MarkdownIt({ html: true, linkify: true, breaks: false });
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Resolves a wiki-link name to a heading anchor id, or null if unknown. */
export type WikiResolver = (name: string) => string | null;

/** Build a case-insensitive heading-text → anchor-id resolver from a heading list. */
export function makeWikiResolver(headings: HeadingNode[]): WikiResolver {
	const byText = new Map<string, string>();
	for (const h of headings) {
		const key = h.text.toLowerCase();
		if (!byText.has(key)) byText.set(key, h.id);
	}
	return (name) => byText.get(name.trim().toLowerCase()) ?? null;
}

/**
 * Replace `[[Name]]` with anchor HTML. Unresolved links render as a broken-link
 * span (`'broken'`) or as the bare text (`'plain'`, used for players so hidden
 * section names don't leak as links).
 */
export function expandWikiLinks(
	markdown: string,
	resolve: WikiResolver,
	unresolved: 'broken' | 'plain'
): string {
	const lines = markdown.split('\n');
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		if (isFence(lines[i])) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		lines[i] = lines[i].replace(/\[\[([^\][]+)\]\]/g, (_m, name: string) => {
			const id = resolve(name);
			const label = escapeHtml(name.trim());
			if (id) return `<a class="wiki-link" href="#h-${id}" data-heading-id="${id}">${label}</a>`;
			return unresolved === 'broken' ? `<span class="wiki-missing">${label}</span>` : label;
		});
	}
	return lines.join('\n');
}

/**
 * Render markdown, assigning each heading a `id="h-<slug>"`, `data-heading-id`,
 * and `data-level` attribute derived from its text (no stored markers). Wiki
 * links resolved by `expandWikiLinks` use the same slug, so `[[Name]]` anchors
 * line up with the rendered headings.
 */
export function renderWithAnchors(markdown: string): string {
	const md = createRenderer();
	const defaultHeadingOpen =
		md.renderer.rules.heading_open ??
		((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
	md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
		const inline = tokens[idx + 1];
		const text = inline && inline.type === 'inline' ? inline.content : '';
		const id = slugify(text);
		const level = tokens[idx].tag.slice(1);
		tokens[idx].attrSet('id', `h-${id}`);
		tokens[idx].attrSet('data-heading-id', id);
		tokens[idx].attrSet('data-level', level);
		return defaultHeadingOpen(tokens, idx, options, env, self);
	};

	return md.render(expandMapDirectives(markdown));
}
