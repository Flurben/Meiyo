
export interface Axial {
  q: number;
  r: number;
}

export const HEX_DIRECTIONS: Axial[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

export function axialToKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function keyToAxial(key: string): Axial {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function getNeighbors(q: number, r: number): Axial[] {
  return HEX_DIRECTIONS.map(dir => ({
    q: q + dir.q,
    r: r + dir.r
  }));
}

export function getDistance(a: Axial, b: Axial): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function axialToPixel(q: number, r: number, size: number): { x: number, y: number } {
  const x = size * Math.sqrt(3) * (q + r / 2);
  const y = size * (3 / 2) * r;
  return { x, y };
}

export function pixelToAxial(x: number, y: number, size: number): Axial {
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;
  return hexRound(q, r);
}

function hexRound(q: number, r: number): Axial {
  let s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);

  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);

  if (dq > dr && dq > ds) {
    rq = -rr - rs;
  } else if (dr > ds) {
    rr = -rq - rs;
  } else {
    rs = -rq - rr;
  }

  return { q: rq, r: rr };
}
