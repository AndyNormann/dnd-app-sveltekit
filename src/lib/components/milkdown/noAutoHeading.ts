import { inputRulesCtx, SchemaReady } from '@milkdown/core';
import type { MilkdownPlugin } from '@milkdown/ctx';

/**
 * Disable Milkdown's automatic `# ` -> heading conversion so typing a `#` (and
 * a space) leaves the `#` as literal text instead of consuming it into a
 * heading block. The user wants the editor to be "less smart": headings are
 * created only via the `/` slash menu (H1/H2/H3), and typing `#` keeps the
 * character on screen.
 *
 * Milkdown registers the heading input rule inside the `commonmark` preset, so
 * we wait until the schema is ready (when the preset has pushed its rules) and
 * then filter the heading rule back out of `inputRulesCtx` before the editor
 * state is built.
 */
export const noAutoHeading: MilkdownPlugin = (ctx) => async () => {
	await ctx.wait(SchemaReady);
	// inputRulesCtx holds `InputRule` objects; `.match` is the internal regex.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx.update(inputRulesCtx, (rules: any[]) =>
		rules.filter((r) => !(r.match instanceof RegExp && r.match.source === '^(?<hashes>#+)\\s$'))
	);
};
