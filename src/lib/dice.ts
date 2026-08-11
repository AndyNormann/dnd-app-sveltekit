/** Dice expression parsing and rolling, e.g. `2d6+1d4+3` or `1d20-2`. */

export interface KeepOp {
	// kh: keep highest, kl: keep lowest, dh: drop highest, dl: drop lowest
	type: 'kh' | 'kl' | 'dh' | 'dl';
	n: number;
}

export interface DiceTerm {
	sign: 1 | -1;
	count: number; // 0 for flat modifiers
	sides: number; // 0 for flat modifiers
	flat: number;
	keep?: KeepOp;
}

export interface RollResult {
	expression: string;
	total: number;
	breakdown: string;
	label?: string;
}

// matches `NdS` optionally followed by a keep/drop modifier `[kd][hl]<n?>`
const TERM_RE = /^(\d{1,3})d(\d{1,4})([kd][hl]\d*)?$|^(\d{1,6})$/i;

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
			const term: DiceTerm = { sign, count, sides, flat: 0 };
			if (m[3] !== undefined) {
				const mod = m[3].toLowerCase();
				const highlow = mod[1] === 'h' ? 'h' : 'l';
				const type = (mod[0] + highlow) as KeepOp['type'];
				const n = mod.length > 2 ? Number(mod.slice(2)) : 1;
				if (!Number.isFinite(n) || n < 1) return null;
				term.keep = { type, n };
			}
			terms.push(term);
			hasDice = true;
		} else {
			terms.push({ sign, count: 0, sides: 0, flat: Number(m[4]) });
		}
	}
	if (!hasDice) return null;
	return terms;
}

/** Roll a parsed expression. */
export function rollDice(expression: string, label?: string): RollResult | null {
	const terms = parseDice(expression);
	if (!terms) return null;
	let total = 0;
	const pieces: string[] = [];
	for (const t of terms) {
		const signStr = t.sign === -1 ? '- ' : pieces.length ? '+ ' : '';
		if (t.count > 0) {
			const rolls: number[] = [];
			for (let i = 0; i < t.count; i++) rolls.push(1 + Math.floor(Math.random() * t.sides));
			let kept = rolls;
			let dropped: number[] = [];
			if (t.keep) {
				const sorted = [...rolls].sort((a, b) => a - b);
				const n = t.keep.n;
				if (t.keep.type === 'kh') {
					const k = Math.min(n, t.count);
					kept = sorted.slice(t.count - k);
					dropped = sorted.slice(0, t.count - k);
				} else if (t.keep.type === 'kl') {
					const k = Math.min(n, t.count);
					kept = sorted.slice(0, k);
					dropped = sorted.slice(k);
				} else if (t.keep.type === 'dh') {
					const d = Math.min(n, t.count);
					dropped = sorted.slice(t.count - d);
					kept = sorted.slice(0, t.count - d);
				} else {
					const d = Math.min(n, t.count);
					dropped = sorted.slice(0, d);
					kept = sorted.slice(d);
				}
			}
			const sum = kept.reduce((a, b) => a + b, 0);
			total += t.sign * sum;
			let mark = '';
			if (t.sides === 20) {
				if (kept.some((d) => d === 20)) mark = ' 🎉';
				else if (kept.some((d) => d === 1)) mark = ' 💀';
			}
			const dropTxt = dropped.length ? ` (dropped [${dropped.join(', ')}])` : '';
			pieces.push(`${signStr}${t.count}d${t.sides} [${kept.join(', ')}]${dropTxt}${mark}`);
		} else {
			total += t.sign * t.flat;
			pieces.push(`${signStr}${t.flat}`);
		}
	}
	return { expression, total, breakdown: `${pieces.join(' ')} = ${total}`, label };
}

/** Regex for auto-detecting inline dice expressions in rendered text. */
export const INLINE_DICE_RE =
	/\b\d{1,3}d\d{1,4}(?:[kd][hl]\d*)?(?:[+-]\d{1,3}(?:d\d{1,4}(?:[kd][hl]\d*)?)?)*\b/g;
