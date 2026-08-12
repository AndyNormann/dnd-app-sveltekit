import { $prose } from '@milkdown/utils';
import type { MilkdownPlugin } from '@milkdown/ctx';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';

/**
 * Make the heading's `#`/`##`/`###` prefix REAL, editable text instead of a
 * decorative locked widget, so typing in a heading feels like markdown.
 *
 * Strategy:
 *  - On parse, a remark transformer prepends `#`.repeat(depth) + ' ' as an
 *    actual text child of each heading, so the `#` is part of the document.
 *  - A ProseMirror transform keeps the hash text in sync with the heading's
 *    `level` and enforces the `# ` (hash + one space) invariant, so typing at
 *    the start of a heading feels like markdown.
 *  - On serialization the heading serializer still emits its `#{level} ` prefix,
 *    so the raw output doubles the hash (`# # Heading`); `fixSerializedMarkdown`
 *    collapses the doubled prefix back to one, keeping round-trips lossless.
 */

/**
 * A remark transformer that prepends the hash text to every heading on parse.
 *
 * This is applied on BOTH parse and serialize by Milkdown, so it must be
 * idempotent: it only prepends when the heading doesn't already start with a
 * `#` (which is the case after the editor's own hash-maintenance transform, or
 * when a heading's text legitimately starts with `#`).
 */
export const headingHashRemark: () => (tree: {
	children?: unknown[];
}) => void = () => (tree) => {
	if (!Array.isArray(tree.children)) return;
	for (const child of tree.children) {
		const node = child as {
			type?: string;
			depth?: number;
			children?: { type?: string; value?: string }[];
		};
		if (node.type === 'heading') {
			const firstText = node.children?.[0]?.value ?? '';
			if (/^#/.test(firstText)) continue; // already has a hash prefix
			const depth = node.depth ?? 1;
			node.children = [
				{ type: 'text', value: '#'.repeat(depth) + ' ' },
				...(node.children ?? [])
			];
		}
	}
};

/** Inspect a heading's leading hashes: `{ h, hasSpace }`. */
function leadingHashes(node: {
	forEach: (fn: (child: unknown, offset: number) => void) => void;
}): { h: number; hasSpace: boolean } {
	let h = 0;
	let hasSpace = false;
	node.forEach((child, offset) => {
		const c = child as { isText?: boolean; text?: string };
		if (h > 0 || hasSpace) return;
		if (!c.isText) return;
		const m = /^(#+)(\s*)/.exec(c.text ?? '');
		if (m) {
			h = m[1].length;
			hasSpace = m[2].length > 0;
		}
	});
	return { h, hasSpace };
}

interface Fix {
	pos: number;
	level: number;
	h: number;
	hasSpace: boolean;
}

/**
 * A ProseMirror plugin that, after every transaction, ensures each heading
 * starts with a `#`-prefix text node (followed by a space) and that the heading
 * `level` matches the number of leading hashes. Runs only when something needs
 * fixing. The caret is kept after any hash/space inserted at its location, so
 * typing right after creating a heading lands after the `# `.
 */
export const headingHashPlugin: MilkdownPlugin = $prose((ctx) => {
	void ctx;
	return new Plugin({
		key: new PluginKey('dnd-heading-hash'),
		appendTransaction(_tr, _oldState, newState) {
			const doc = newState.doc;
			const fixes: Fix[] = [];
			doc.descendants((node, pos) => {
				if (node.type.name !== 'heading') return;
				const { h, hasSpace } = leadingHashes(node);
				fixes.push({ pos, level: node.attrs.level, h, hasSpace });
				return true;
			});
			let changed = false;
			const tr = newState.tr;
			const inserts: { pos: number; len: number }[] = [];
			// process in reverse so positions of earlier headings stay stable
			for (let i = fixes.length - 1; i >= 0; i--) {
				const f = fixes[i];
				if (f.h === 0) {
					// heading with no hash prefix (e.g. just created via input rule / slash)
					const text = '#'.repeat(f.level) + ' ';
					tr.insert(f.pos + 1, newState.schema.text(text));
					inserts.push({ pos: f.pos + 1, len: text.length });
					changed = true;
				} else {
					if (!f.hasSpace) {
						// ProseMirror drops the space right after `# ` at the block end when the
						// next character is typed; restore it so the prefix reads `# Heading`.
						tr.insert(f.pos + 1 + f.h, newState.schema.text(' '));
						inserts.push({ pos: f.pos + 1 + f.h, len: 1 });
						changed = true;
					}
					if (f.h !== f.level) {
						// user typed more/fewer hashes -> adopt them as the new level
						const newLevel = Math.max(1, Math.min(f.h, 6));
						tr.setNodeMarkup(f.pos, undefined, {
							...newState.doc.nodeAt(f.pos)!.attrs,
							level: newLevel
						});
						changed = true;
					}
				}
			}
			if (!changed) return null;
			// Move the caret past any text we inserted at or before the caret.
			const head = newState.selection.head;
			const newHead =
				head +
				inserts.reduce((sum, ins) => (ins.pos <= head ? sum + ins.len : sum), 0);
			tr.setSelection(TextSelection.near(tr.doc.resolve(newHead)));
			return tr;
		}
	});
});
