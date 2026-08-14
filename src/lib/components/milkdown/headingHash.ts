import { $prose } from '@milkdown/utils';
import type { MilkdownPlugin } from '@milkdown/ctx';
import type { Node as ProseNode } from '@milkdown/prose/model';
import { Plugin, PluginKey, type Transaction } from '@milkdown/prose/state';
import { schemaCtx } from '@milkdown/core';

/**
 * Make a heading's level markers real, editable text in the WYSIWYG editor.
 *
 * Two pieces work together:
 *  - `headingHashRemark` injects `#`.repeat(level) + ' ' as an actual text child
 *    of each heading when markdown is parsed, so the heading renders as
 *    `# Heading` and the hashes are part of the editable text.
 *  - `headingHashPlugin` (appendTransaction) keeps the leading hash text in
 *    sync with the heading's level: a heading with no hashes gets the level's
 *    hash prefix, and editing the hash count re-derives the heading level
 *    (typing `##` turns an H1 into an H2).
 *
 * Serialization produces a doubled prefix (`# # Heading` from the depth marker
 * plus the literal text); `fixSerializedMarkdown` collapses it back to a single
 * `# Heading` for a lossless round-trip.
 */

/** Count leading `#` hashes and whether a space/tab follows them. */
function leadingHashes(text: string): { h: number; hasSpace: boolean } {
	let h = 0;
	for (const ch of text) {
		if (ch === '#') h++;
		else break;
	}
	return { h, hasSpace: text[h] === ' ' || text[h] === '\t' };
}

function walk(nodes: unknown[]) {
	for (const child of nodes) {
		const node = child as { type?: string; depth?: number; children?: unknown[] };
		if (node.type === 'heading') {
			const first = node.children?.[0] as { type?: string; value?: string } | undefined;
			const firstText = first && first.type === 'text' ? (first.value ?? '') : '';
			// idempotent: skip when the first child already begins with '#'
			// (also covers headings whose text legitimately starts with '#')
			if (!firstText.startsWith('#')) {
				const hashes = '#'.repeat(node.depth ?? 1) + ' ';
				node.children = [{ type: 'text', value: hashes }, ...(node.children ?? [])];
			}
		} else if (node.children) {
			walk(node.children);
		}
	}
}

/**
 * remark transformer that prepends the heading's `#` markers as real text.
 * Registered via remarkPluginsCtx (runs during parse; idempotent so it is safe
 * if it also runs during serialize).
 */
export const headingHashRemark: () => (tree: { children?: unknown[] }) => void = () => (tree) => {
	if (!Array.isArray(tree.children)) return;
	walk(tree.children);
};

/**
 * appendTransaction that keeps each heading's leading hash text synced to its
 * level. Process headings in reverse so earlier positions stay valid.
 */
export const headingHashPlugin: MilkdownPlugin = $prose((ctx) => {
	const schema = ctx.get(schemaCtx);
	const headingType = schema.nodes.heading;
	return new Plugin({
		key: new PluginKey('dnd-heading-hash'),
		appendTransaction(_transactions, _oldState, newState) {
			if (!headingType) return null;
			const headings: { pos: number; node: ProseNode }[] = [];
			newState.doc.descendants((node, pos) => {
				if (node.type === headingType) headings.push({ pos, node });
				return true;
			});
			if (headings.length === 0) return null;

			let tr: Transaction | null = null;
			for (let i = headings.length - 1; i >= 0; i--) {
				const { pos, node } = headings[i];
				const level = Math.min(6, Math.max(1, node.attrs.level ?? 1));
				const first = node.firstChild;
				const text = first && first.isText ? (first.text ?? '') : '';
				const { h, hasSpace } = leadingHashes(text);

				if (h === 0) {
					// no hashes yet: inject to match the current level
					tr = (tr ?? newState.tr).insertText('#'.repeat(level) + ' ', pos + 1, pos + 1);
				} else {
					// hashes drive the level
					if (h !== level) {
						tr = (tr ?? newState.tr).setNodeMarkup(pos, headingType, {
							...node.attrs,
							level: Math.min(6, Math.max(1, h))
						});
					}
					// keep a space right after the hashes (ProseMirror drops it otherwise)
					if (!hasSpace) {
						tr = (tr ?? newState.tr).insertText(' ', pos + 1 + h, pos + 1 + h);
					}
				}
			}
			return tr;
		}
	});
});
