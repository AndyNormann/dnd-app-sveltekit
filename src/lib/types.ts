/** Types shared between client and server (no server-only imports). */

export interface RevealOp {
	id: number;
	map_id: string;
	kind: 'reveal' | 'hide';
	x: number;
	y: number;
	w: number;
	h: number;
	seq: number;
}

export interface MapData {
	id: string;
	width: number;
	height: number;
	src: string;
	reveals: RevealOp[];
}

export interface RollData {
	id: number;
	roller: string;
	expression: string;
	result: number;
	breakdown: string;
	secret: boolean;
	created_at: number;
}
