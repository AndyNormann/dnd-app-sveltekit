import { describe, expect, test } from 'bun:test';
import {
	moveBudget,
	moveCost,
	clampToBudget,
	isOwnTurn,
	isDown,
	applyHpDelta
} from './combatRules';

describe('combatRules', () => {
	test('moveBudget divides speed by grid scale', () => {
		expect(moveBudget(30, 5)).toBe(6);
		expect(moveBudget(30, 0)).toBe(6); // scale 0 falls back to 5
		expect(moveBudget(25, 5)).toBe(5);
	});

	test('moveCost is Manhattan distance', () => {
		expect(moveCost({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
		expect(moveCost({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(0);
		expect(moveCost({ x: 5, y: 5 }, { x: 0, y: 0 })).toBe(10);
	});

	test('clampToBudget walks toward the target within the step budget', () => {
		// target 6 cells away, only 3 steps -> stops 3 cells along, on-grid
		expect(clampToBudget({ x: 6, y: 0 }, { x: 0, y: 0 }, 3, { cols: 24, rows: 18 })).toEqual({
			x: 3,
			y: 0
		});
		// within budget -> reaches the target
		expect(clampToBudget({ x: 2, y: 1 }, { x: 0, y: 0 }, 5, { cols: 24, rows: 18 })).toEqual({
			x: 2,
			y: 1
		});
		// never leaves the grid bounds
		expect(clampToBudget({ x: 30, y: 30 }, { x: 23, y: 17 }, 20, { cols: 24, rows: 18 })).toEqual({
			x: 23,
			y: 17
		});
	});

	test('isOwnTurn compares unit to active', () => {
		expect(isOwnTurn('a', 'a')).toBe(true);
		expect(isOwnTurn('a', 'b')).toBe(false);
		expect(isOwnTurn(null, 'a')).toBe(false);
		expect(isOwnTurn('a', null)).toBe(false);
	});

	test('isDown reflects the alive flag', () => {
		expect(isDown({ alive: 0 })).toBe(true);
		expect(isDown({ alive: 1 })).toBe(false);
		expect(isDown(null)).toBe(true);
	});

	test('applyHpDelta clamps to [0, max_hp]', () => {
		expect(applyHpDelta(10, -6, 10)).toBe(4);
		expect(applyHpDelta(2, -5, 10)).toBe(0);
		expect(applyHpDelta(8, 4, 10)).toBe(10);
		expect(applyHpDelta(5, 0, 0)).toBe(5); // no max cap when max_hp is 0
	});
});
