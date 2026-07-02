/** Dice expression parsing and rolling, e.g. `2d6+1d4+3` or `1d20-2`. */

export interface DiceTerm {
	sign: 1 | -1;
	count: number; // 0 for flat modifiers
	sides: number; // 0 for flat modifiers
	flat: number;
}

export interface RollResult {
	expression: string;
	total: number;
	breakdown: string;
}

const TERM_RE = /^(\d{1,3})d(\d{1,4})$|^(\d{1,6})$/i;

/** Parse a dice expression into terms; returns null if invalid. */
export function parseDice(expression: string): DiceTerm[] | null {
	const cleaned = expression.replace(/\s+/g, '');
	if (!cleaned) return null;
	// split into signed terms
	const parts = cleaned.match(/[+-]?[^+-]+/g);
	if (!parts) return null;
	const terms: DiceTerm[] = [];
	let hasDice = false;
	for (const raw of parts) {
		const sign: 1 | -1 = raw.startsWith('-') ? -1 : 1;
		const body = raw.replace(/^[+-]/, '');
		const m = TERM_RE.exec(body);
		if (!m) return null;
		if (m[1] !== undefined) {
			const count = Number(m[1]);
			const sides = Number(m[2]);
			if (count < 1 || sides < 2) return null;
			terms.push({ sign, count, sides, flat: 0 });
			hasDice = true;
		} else {
			terms.push({ sign, count: 0, sides: 0, flat: Number(m[3]) });
		}
	}
	if (!hasDice) return null;
	return terms;
}

/** Roll a parsed expression. */
export function rollDice(expression: string): RollResult | null {
	const terms = parseDice(expression);
	if (!terms) return null;
	let total = 0;
	const pieces: string[] = [];
	for (const t of terms) {
		const signStr = t.sign === -1 ? '- ' : pieces.length ? '+ ' : '';
		if (t.count > 0) {
			const rolls: number[] = [];
			for (let i = 0; i < t.count; i++) {
				rolls.push(1 + Math.floor(Math.random() * t.sides));
			}
			const sum = rolls.reduce((a, b) => a + b, 0);
			total += t.sign * sum;
			pieces.push(`${signStr}${t.count}d${t.sides} [${rolls.join(', ')}]`);
		} else {
			total += t.sign * t.flat;
			pieces.push(`${signStr}${t.flat}`);
		}
	}
	return { expression, total, breakdown: `${pieces.join(' ')} = ${total}` };
}

/** Regex for auto-detecting inline dice expressions in rendered text. */
export const INLINE_DICE_RE = /\b\d{1,3}d\d{1,4}(?:[+-]\d{1,3}(?:d\d{1,4})?)*\b/g;
