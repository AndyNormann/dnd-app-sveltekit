import { test, expect } from 'bun:test';
import {
	ensureHeadingIds,
	parseHeadings,
	effectiveShared,
	computeSharedMarkdown,
	expandWikiLinks,
	makeWikiResolver,
	renderWithAnchors,
	expandMapDirectives,
	SHARE_SHARED,
	SHARE_HIDDEN,
	type MetaMap
} from './markdown';

const doc = `# Alpha

hello

## Beta

body

# Gamma

more`;

test('ensureHeadingIds adds stable markers and skips code fences', () => {
	const md = '```\n# not a heading\n```\n# Real\n';
	const { content, changed } = ensureHeadingIds(md);
	expect(changed).toBe(true);
	expect(content).not.toContain('# not a heading <!--id:');
	expect(content).toMatch(/# Real <!--id:[A-Za-z0-9_-]+-->/);
});

test('ensureHeadingIds is idempotent', () => {
	const once = ensureHeadingIds(doc).content;
	const twice = ensureHeadingIds(once);
	expect(twice.changed).toBe(false);
});

test('parseHeadings builds a tree with parents', () => {
	const headings = parseHeadings(doc);
	expect(headings.length).toBe(3);
	expect(headings[0].level).toBe(1);
	expect(headings[0].parent).toBeNull();
	expect(headings[1].parent).toBe(0);
	expect(headings[2].parent).toBeNull();
	expect(headings[0].id).toBeTruthy();
});

test('effectiveShared walks ancestors', () => {
	const headings = parseHeadings(doc);
	const meta: MetaMap = { [headings[0].id]: { shared: SHARE_SHARED, collapsed: false } };
	// child inherits shared from parent
	expect(effectiveShared(1, headings, meta)).toBe(true);
	// explicit hidden on child overrides parent shared
	const meta2: MetaMap = {
		...meta,
		[headings[1].id]: { shared: SHARE_HIDDEN, collapsed: false }
	};
	expect(effectiveShared(1, headings, meta2)).toBe(false);
});

test('effectiveShared: a hidden ancestor hides even an explicitly-shared descendant', () => {
	const headings = parseHeadings(doc);
	// parent hidden (SHARE_HIDDEN), child explicitly SHARED -> child still hidden
	const meta: MetaMap = {
		[headings[0].id]: { shared: SHARE_HIDDEN, collapsed: false },
		[headings[1].id]: { shared: SHARE_SHARED, collapsed: false }
	};
	expect(effectiveShared(0, headings, meta)).toBe(false); // parent hidden
	expect(effectiveShared(1, headings, meta)).toBe(false); // child dominated by hidden parent
});

test('computeSharedMarkdown keeps only shared subtrees', () => {
	const headings = parseHeadings(doc);
	const meta: MetaMap = { [headings[0].id]: { shared: SHARE_SHARED, collapsed: false } };
	const shared = computeSharedMarkdown(doc, meta);
	expect(shared).toContain('# Alpha');
	expect(shared).toContain('## Beta');
	expect(shared).not.toContain('# Gamma');
});

test('wiki links resolve case-insensitively', () => {
	const resolver = makeWikiResolver(parseHeadings(doc));
	expect(resolver('alpha')).toBeTruthy();
	expect(resolver('ALPHA')).toBe(resolver('alpha'));
	expect(resolver('missing')).toBeNull();
});

test('expandWikiLinks: broken vs plain', () => {
	const resolver = makeWikiResolver(parseHeadings(doc));
	const broken = expandWikiLinks('See [[Alpha]] and [[Nope]]', resolver, 'broken');
	expect(broken).toContain('class="wiki-link"');
	expect(broken).toContain('wiki-missing');
	const plain = expandWikiLinks('See [[Alpha]] and [[Nope]]', resolver, 'plain');
	expect(plain).toContain('wiki-link');
	expect(plain).not.toContain('wiki-missing');
});

test('renderWithAnchors adds heading ids', () => {
	const canon = ensureHeadingIds('# Hi\n\n## Sub').content;
	const html = renderWithAnchors(canon);
	expect(html).toContain('data-heading-id');
	expect(html).toMatch(/id="h-[^"]+"/);
	expect(html).toContain('data-level');
});

test('expandMapDirectives handles a backslash-escaped underscore id', () => {
	// Milkdown serializes `::map{id=X_Y}` as `::map{id=X\\_Y}`; both must work.
	const plain = expandMapDirectives('::map{id=lfU4CYQ-nx}\n');
	expect(plain).toContain('data-map-id="lfU4CYQ-nx"');
	const escaped = expandMapDirectives('::map{id=YsWkPf\\_V1n}\n');
	expect(escaped).toContain('data-map-id="YsWkPf_V1n"');
	expect(escaped).not.toContain('YsWkPf\\_V1n');
	// an inline (non-own-line) directive must NOT expand
	const inline = expandMapDirectives('x ::map{id=lfU4CYQ-nx}');
	expect(inline).not.toContain('map-embed');
});
