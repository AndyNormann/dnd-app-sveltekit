import { test, expect } from 'bun:test';
import {
	slugify,
	parseHeadings,
	expandWikiLinks,
	makeWikiResolver,
	renderWithAnchors,
	expandMapDirectives
} from './markdown';

const doc = `# Alpha

hello

## Beta

body

# Gamma

more`;

test('parseHeadings extracts levels, text, and slug ids; skips code fences', () => {
	const headings = parseHeadings('# Alpha\n```\n# not a heading\n```\n## Beta');
	expect(headings.length).toBe(2);
	expect(headings[0].level).toBe(1);
	expect(headings[0].text).toBe('Alpha');
	expect(headings[0].id).toBe('alpha');
	expect(headings[1].level).toBe(2);
	expect(headings[1].text).toBe('Beta');
	expect(headings[1].id).toBe('beta');
});

test('slugify produces stable URL-safe ids', () => {
	expect(slugify('  The Dark Tower  ')).toBe('the-dark-tower');
	expect(slugify('Café & Stuff!!')).toBe('caf-stuff');
	expect(slugify('###')).toBe('heading');
});

test('wiki links resolve case-insensitively to slug anchors', () => {
	const resolver = makeWikiResolver(parseHeadings(doc));
	expect(resolver('alpha')).toBe('alpha');
	expect(resolver('ALPHA')).toBe('alpha');
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

test('renderWithAnchors derives heading ids from text (no stored markers)', () => {
	const html = renderWithAnchors('# Hi There\n\nbody\n\n## Sub');
	expect(html).toContain('data-heading-id="hi-there"');
	expect(html).toContain('id="h-hi-there"');
	expect(html).toContain('data-heading-id="sub"');
	expect(html).toContain('data-level');
	// no id-marker comments survive
	expect(html).not.toContain('<!--id:');
});

test('renderWithAnchors anchors line up with wiki-link anchors', () => {
	const md = '# Goblin Cave\n\nSee [[Goblin Cave]].\n';
	const resolver = makeWikiResolver(parseHeadings(md));
	const html = renderWithAnchors(expandWikiLinks(md, resolver, 'plain'));
	expect(html).toContain('href="#h-goblin-cave"');
	expect(html).toContain('id="h-goblin-cave"');
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
