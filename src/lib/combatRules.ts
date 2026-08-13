/**
 * Pure combat rules shared between the client board (which predicts a move so it
 * can show a live budget readout) and the server (which enforces the move). Keeping
 * one copy of this arithmetic means the board's prediction can never drift from the
 * server's enforcement. No imports — safe on both client and server.
 */

export interface Point {
	x: number;
	y: number;
}

export interface GridBounds {
	cols: number;
	rows: number;
}

/** How many cells a unit may move in one turn (speed in feet ÷ grid scale in ft/cell). */
export function moveBudget(speed: number, grid_scale: number): number {
	return Math.floor(speed / (grid_scale || 5));
}

/** Movement cost between two cells, counted as Manhattan distance (grid, no diagonals). */
export function moveCost(a: Point, b: Point): number {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Walk one cell at a time from `origin` toward `target`, stopping once `steps` cells
 * have been consumed. This physically stops a token at the edge of its remaining
 * budget instead of clamping to a straight line.
 */
export function clampToBudget(
	target: Point,
	origin: Point,
	steps: number,
	bounds: GridBounds
): Point {
	let tx = origin.x;
	let ty = origin.y;
	const cx = Math.sign(target.x - origin.x);
	const cy = Math.sign(target.y - origin.y);
	for (let i = 0; i < steps; i++) {
		const rx = Math.abs(target.x - tx);
		const ry = Math.abs(target.y - ty);
		if (rx === 0 && ry === 0) break;
		if (rx >= ry) {
			if (rx !== 0) tx += cx;
			else if (ry !== 0) ty += cy;
		} else {
			if (ry !== 0) ty += cy;
			else if (rx !== 0) tx += cx;
		}
	}
	return {
		x: Math.max(0, Math.min(bounds.cols - 1, tx)),
		y: Math.max(0, Math.min(bounds.rows - 1, ty))
	};
}

/** Is `unitId` the combatant whose turn it currently is? */
export function isOwnTurn(unitId: string | null | undefined, activeId: string | null | undefined): boolean {
	return !!unitId && unitId === activeId;
}

/** A unit is "down"/out when its alive flag is 0 (or the unit no longer exists). */
export function isDown(unit: { alive?: number } | null | undefined): boolean {
	return !unit || unit.alive === 0;
}

/** Apply a signed HP change, clamped to [0, max_hp]. Negative `delta` is damage. */
export function applyHpDelta(hp: number, delta: number, max_hp: number): number {
	const cap = max_hp > 0 ? max_hp : Infinity;
	return Math.max(0, Math.min(cap, Math.floor(hp + delta)));
}
