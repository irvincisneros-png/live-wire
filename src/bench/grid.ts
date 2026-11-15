// Pure grid maths for the bench (no DOM, no three). Posts are nodes on a cols × rows grid, 1 unit apart,
// centred on the origin in the XZ plane. Row 0 is the back row (−z, top of the diagram); col 0 is the left (−x).

export interface GridSize { cols: number; rows: number }

export interface Edge {
  /** stable key: `${a}-${b}` with a < b */
  key: string;
  a: number;
  b: number;
  horizontal: boolean;
}

export type Dir = 'left' | 'right' | 'up' | 'down';

export const postId = (g: GridSize, col: number, row: number): number => row * g.cols + col;
export const colRow = (g: GridSize, id: number): { col: number; row: number } => ({ col: id % g.cols, row: Math.floor(id / g.cols) });
export const validPost = (g: GridSize, id: number): boolean => Number.isInteger(id) && id >= 0 && id < g.cols * g.rows;

/** "B2" style name: column letter, row number (1-based) */
export function postName(g: GridSize, id: number): string {
  const { col, row } = colRow(g, id);
  return String.fromCharCode(65 + col) + (row + 1);
}

export function postXZ(g: GridSize, id: number): [number, number] {
  const { col, row } = colRow(g, id);
  return [col - (g.cols - 1) / 2, row - (g.rows - 1) / 2];
}

export function adjacent(g: GridSize, a: number, b: number): boolean {
  if (!validPost(g, a) || !validPost(g, b) || a === b) return false;
  const p = colRow(g, a), q = colRow(g, b);
  return Math.abs(p.col - q.col) + Math.abs(p.row - q.row) === 1;
}

export const edgeKey = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function allEdges(g: GridSize): Edge[] {
  const out: Edge[] = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
    const id = postId(g, c, r);
    if (c + 1 < g.cols) out.push({ key: edgeKey(id, id + 1), a: id, b: id + 1, horizontal: true });
    if (r + 1 < g.rows) out.push({ key: edgeKey(id, id + g.cols), a: id, b: id + g.cols, horizontal: false });
  }
  return out;
}

export function edgeMidXZ(g: GridSize, e: { a: number; b: number }): [number, number] {
  const [ax, az] = postXZ(g, e.a), [bx, bz] = postXZ(g, e.b);
  return [(ax + bx) / 2, (az + bz) / 2];
}

/** nearest edge midpoint within maxDist of (x, z) */
export function nearestEdge(g: GridSize, edges: Edge[], x: number, z: number, maxDist = 0.45): Edge | null {
  let best: Edge | null = null, bd = maxDist;
  for (const e of edges) {
    const [mx, mz] = edgeMidXZ(g, e);
    // anisotropic: distance along the edge counts less, so the whole length of the edge is a target
    const dx = x - mx, dz = z - mz;
    const d = e.horizontal ? Math.hypot(dx * 0.55, dz) : Math.hypot(dx, dz * 0.55);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

export function nearestPost(g: GridSize, x: number, z: number, maxDist = 0.4): number | null {
  let best: number | null = null, bd = maxDist;
  for (let id = 0; id < g.cols * g.rows; id++) {
    const [px, pz] = postXZ(g, id);
    const d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

const DIRV: Record<Dir, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** keyboard edge cursor: the closest edge in the arrow's direction (or the same edge at the border) */
export function stepEdge(g: GridSize, edges: Edge[], cur: Edge, dir: Dir): Edge {
  const [cx, cz] = edgeMidXZ(g, cur);
  const [ux, uz] = DIRV[dir];
  let best = cur, bs = Infinity;
  for (const e of edges) {
    if (e.key === cur.key) continue;
    const [mx, mz] = edgeMidXZ(g, e);
    const dx = mx - cx, dz = mz - cz;
    const along = dx * ux + dz * uz;
    if (along < 0.25) continue;
    const perp = Math.abs(dx * uz - dz * ux);
    const s = along + 2.2 * perp;
    if (s < bs) { bs = s; best = e; }
  }
  return best;
}

export function stepPost(g: GridSize, id: number, dir: Dir): number {
  const { col, row } = colRow(g, id);
  const [ux, uz] = DIRV[dir];
  const c = Math.min(g.cols - 1, Math.max(0, col + ux)), r = Math.min(g.rows - 1, Math.max(0, row + uz));
  return postId(g, c, r);
}
