import MarkdownIt from 'markdown-it';
import { nanoid } from 'nanoid';

/**
 * Shared markdown pipeline for the DM editor and the player view.
 *
 * The campaign document is a single markdown blob. Headings carry a hidden
 * stable id marker of the form `<!--id:xxxx-->` appended to the heading line.
 * Share/collapse metadata is keyed by that id so it survives renames/reorders.
 */

const ID_MARKER = /<!--id:([A-Za-z0-9_-]+)-->/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;

export interface HeadingNode {
	id: string;
	level: number;
	line: number; // line index of the heading
	parent: number | null; // index into the headings array
	text: string; // heading text without #s or id marker
}

/** Shared state of a heading: inherit from ancestors, explicitly shared, or explicitly hidden. */
export const SHARE_INHERIT = 0;
export const SHARE_SHARED = 1;
export const SHARE_HIDDEN = 2;

export type ShareState = typeof SHARE_INHERIT | typeof SHARE_SHARED | typeof SHARE_HIDDEN;

export interface MetaMap {
	[headingId: string]: { shared: ShareState; collapsed: boolean };
}

/** Detect lines that open/close a fenced code block so we don't treat `# x` inside code as a heading. */
function isFence(line: string): boolean {
	return /^\s*(```|~~~)/.test(line);
}

/**
 * Ensure every heading line carries a stable id marker. Returns the
 * canonicalized markdown plus whether anything changed.
 */
export function ensureHeadingIds(markdown: string): { content: string; changed: boolean } {
	const lines = markdown.split('\n');
	let inFence = false;
	let changed = false;
	for (let i = 0; i < lines.length; i++) {
		if (isFence(lines[i])) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = HEADING_RE.exec(lines[i]);
		if (!m) continue;
		if (ID_MARKER.test(lines[i])) continue;
		lines[i] = `${lines[i].replace(/\s*$/, '')} <!--id:${nanoid(8)}-->`;
		changed = true;
	}
	return { content: lines.join('\n'), changed };
}

/** Parse the heading tree from canonicalized markdown (ids assumed present). */
export function parseHeadings(markdown: string): HeadingNode[] {
	const lines = markdown.split('\n');
	const headings: HeadingNode[] = [];
	const stack: number[] = []; // indices of open ancestor headings
	let inFence = false;

	for (let i = 0; i < lines.length; i++) {
		if (isFence(lines[i])) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;
		const m = HEADING_RE.exec(lines[i]);
		if (!m) continue;
		const level = m[1].length;
		const idMatch = ID_MARKER.exec(lines[i]);
		const id = idMatch ? idMatch[1] : `tmp-${i}`;

		while (stack.length && headings[stack[stack.length - 1]].level >= level) {
			stack.pop();
		}
		const parent = stack.length ? stack[stack.length - 1] : null;
		const text = m[2].replace(ID_MARKER, '').trim();
		headings.push({ id, level, line: i, parent, text });
		stack.push(headings.length - 1);
	}
	return headings;
}

/** Resolve effective visibility of a heading, walking ancestors for inherited share state. */
export function effectiveShared(index: number, headings: HeadingNode[], meta: MetaMap): boolean {
	let cur: number | null = index;
	while (cur !== null) {
		const state = meta[headings[cur].id]?.shared ?? SHARE_INHERIT;
		if (state === SHARE_SHARED) return true;
		if (state === SHARE_HIDDEN) return false;
		cur = headings[cur].parent;
	}
	return false;
}

/** Strip id markers from a single line of text. */
function stripMarker(line: string): string {
	return line.replace(ID_MARKER, '').replace(/\s*$/, '');
}

/**
 * Produce the player-visible markdown: only sections whose owning heading is
 * effectively shared. Content before the first heading is DM-only.
 */
export function computeSharedMarkdown(markdown: string, meta: MetaMap): string {
	const headings = parseHeadings(markdown);
	const lineToHeading = new Map<number, number>();
	headings.forEach((h, idx) => lineToHeading.set(h.line, idx));

	const lines = markdown.split('\n');
	const out: string[] = [];
	let owner: number | null = null;
	let inFence = false;

	for (let i = 0; i < lines.length; i++) {
		const fence = isFence(lines[i]);
		if (!inFence && lineToHeading.has(i)) {
			owner = lineToHeading.get(i)!;
		}
		if (fence) inFence = !inFence;
		if (owner !== null && effectiveShared(owner, headings, meta)) {
			// keep id markers so the player renderer can anchor headings
			out.push(lines[i]);
		}
	}
	return out.join('\n');
}

/** Replace `::map{id=xxx}` directives with a hydration placeholder div. */
export function expandMapDirectives(markdown: string): string {
	return markdown.replace(/^::map\{id=([A-Za-z0-9_-]+)\}\s*$/gm, (_m, id) => {
		return `<div class="map-embed" data-map-id="${id}"></div>`;
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

/** Resolves a wiki-link name to a heading id, or null if unknown/unavailable. */
export type WikiResolver = (name: string) => string | null;

/** Build a case-insensitive heading-text → id resolver from a heading list. */
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
 * Render markdown whose headings carry id markers. Headings get
 * `id="h-<id>"`, `data-heading-id`, and `data-level` attributes.
 */
export function renderWithAnchors(markdown: string): string {
	// Pull ids out in heading order, then strip the markers from the source.
	const ids: string[] = [];
	const stripped = markdown
		.split('\n')
		.map((line) => {
			const hm = HEADING_RE.exec(line);
			if (hm) {
				const idm = ID_MARKER.exec(line);
				if (idm) ids.push(idm[1]);
				else ids.push('');
				return stripMarker(line);
			}
			return line;
		})
		.join('\n');

	const md = createRenderer();
	let counter = 0;
	const defaultHeadingOpen =
		md.renderer.rules.heading_open ??
		((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
	md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
		const id = ids[counter] ?? '';
		counter++;
		const level = tokens[idx].tag.slice(1);
		if (id) tokens[idx].attrSet('id', `h-${id}`);
		tokens[idx].attrSet('data-heading-id', id);
		tokens[idx].attrSet('data-level', level);
		return defaultHeadingOpen(tokens, idx, options, env, self);
	};

	return md.render(expandMapDirectives(stripped));
}

/**
 * Render markdown for the DM. All wiki links resolve against the full
 * document; unknown targets render broken.
 */
export function renderForDM(markdown: string): string {
	const resolver = makeWikiResolver(parseHeadings(markdown));
	return renderWithAnchors(expandWikiLinks(markdown, resolver, 'broken'));
}

/** Build a MetaMap from DB heading_meta rows. */
export function toMetaMap(
	rows: { heading_id: string; shared: number; collapsed: number }[]
): MetaMap {
	const map: MetaMap = {};
	for (const r of rows) {
		map[r.heading_id] = {
			shared: (r.shared as ShareState) ?? SHARE_INHERIT,
			collapsed: !!r.collapsed
		};
	}
	return map;
}
