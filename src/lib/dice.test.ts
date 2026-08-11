import { test, expect } from 'bun:test';
import { parseDice, rollDice, INLINE_DICE_RE } from './dice';

test('parseDice: plain dice and modifiers', () => {
	expect(parseDice('2d6')).toEqual([{ sign: 1, count: 2, sides: 6, flat: 0 }]);
	expect(parseDice('1d20-2')).toEqual([
		{ sign: 1, count: 1, sides: 20, flat: 0 },
		{ sign: -1, count: 0, sides: 0, flat: 2 }
	]);
});

test('parseDice: keep/drop modifiers', () => {
	expect(parseDice('2d20kh1')![0].keep).toEqual({ type: 'kh', n: 1 });
	expect(parseDice('4d6dl1')![0].keep).toEqual({ type: 'dl', n: 1 });
	expect(parseDice('3d6kh2')![0].keep).toEqual({ type: 'kh', n: 2 });
});

test('parseDice: rejects invalid', () => {
	expect(parseDice('')).toBeNull();
	expect(parseDice('foo')).toBeNull();
	expect(parseDice('2d1')).toBeNull();
	expect(parseDice('1d20x')).toBeNull();
});

test('rollDice: flat-only is rejected (no dice)', () => {
	expect(rollDice('5')).toBeNull();
});

test('rollDice: basic range', () => {
	const r = rollDice('1d6')!;
	expect(r.total).toBeGreaterThanOrEqual(1);
	expect(r.total).toBeLessThanOrEqual(6);
});

test('rollDice: keep-high breakdown shows dropped dice', () => {
	const r = rollDice('4d6dl1')!;
	expect(r.breakdown).toContain('dropped');
	// 4d6dl1 keeps 3 of 4 dice, so total is between 3 and 18
	expect(r.total).toBeGreaterThanOrEqual(3);
	expect(r.total).toBeLessThanOrEqual(18);
});

test('rollDice: crit/fumble marker on d20', () => {
	// force a natural 20 by mocking Math.random to yield the max face
	const orig = Math.random;
	Math.random = () => 0.9999;
	const crit = rollDice('1d20')!;
	expect(crit.breakdown).toContain('🎉');
	Math.random = orig;
});

test('rollDice: label passthrough', () => {
	expect(rollDice('1d20', 'Perception')!.label).toBe('Perception');
});

test('INLINE_DICE_RE: matches keep/drop forms', () => {
	const text = 'Roll 2d20kh1 and 1d6, plus 2d6+3.';
	expect(text.match(INLINE_DICE_RE)).toEqual(['2d20kh1', '1d6', '2d6+3']);
	expect('the d20 is neat'.match(INLINE_DICE_RE)).toBeNull();
});
