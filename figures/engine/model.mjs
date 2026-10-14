// Single-cylinder four-stroke engine: one pure model drives the drawing, the motion and the readout.
// World units are millimetres: x across the engine (intake side +x), y along the crank, z up from the crank axis.

export const ENGINE = {
  bore: 86,
  stroke: 86,
  rod: 143,
  pinToCrown: 30,
  deckGap: 1,
  gasket: 1.5,
  roofRise: 12.3,
  base: 16,
  lift: { in: 9.2, ex: 8.6 },
  peakAt: { in: 108, ex: 612 },
  lobeHalf: 0.84,
  valveTilt: (16 * Math.PI) / 180,
  valveX: { in: 21, ex: -22 },
  valveR: { in: 15, ex: 12.5 },
  camReach: 95,
  spark: 345,
  burn: 58,
  rpm: 1200,
};

const E = ENGINE;
export const BORE_R = E.bore / 2;
export const CRANK_R = E.stroke / 2;
export const TDC_PIN = CRANK_R + E.rod;
export const CROWN_TDC = TDC_PIN + E.pinToCrown;
export const DECK = CROWN_TDC + E.deckGap;
export const HEAD0 = DECK + E.gasket;
export const ROOF_TOP = HEAD0 + E.roofRise;
export const roofAt = (x) => HEAD0 + E.roofRise * Math.max(0, 1 - Math.abs(x) / BORE_R);
export const AREA = Math.PI * BORE_R * BORE_R;

const ROOF_MEAN = E.roofRise * (1 - 4 / (3 * Math.PI));
export const CLEARANCE = AREA * (E.deckGap + E.gasket + ROOF_MEAN);
export const SWEPT = AREA * E.stroke;
export const RATIO = (SWEPT + CLEARANCE) / CLEARANCE;

const rad = (deg) => (deg * Math.PI) / 180;
export const wrap = (deg) => ((deg % 720) + 720) % 720;

export function rot([x, z], a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, -x * s + z * c];
}

export function crankPin(theta) {
  const a = rad(theta);
  return [CRANK_R * Math.sin(a), CRANK_R * Math.cos(a)];
}

export function pinZ(theta) {
  const a = rad(theta);
  return CRANK_R * Math.cos(a) + Math.sqrt(E.rod * E.rod - (CRANK_R * Math.sin(a)) ** 2);
}

export const pistonDrop = (theta) => TDC_PIN - pinZ(theta);
export const volume = (theta) => CLEARANCE + AREA * pistonDrop(theta);

export function valveAxis(which) {
  const sign = which === "in" ? 1 : -1;
  return [sign * Math.sin(E.valveTilt), Math.cos(E.valveTilt)];
}

export function valveSeat(which) {
  const x = E.valveX[which];
  return [x, roofAt(x)];
}

export function camCentre(which) {
  const [x, z] = valveSeat(which);
  const [ax, az] = valveAxis(which);
  return [x + ax * E.camReach, z + az * E.camReach];
}

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// The lobe in the cam's own plane at rest (cam angle 0), nose turned so that it meets the tappet at peakAt.
export function lobe(which, steps = 144) {
  const [ax, az] = valveAxis(which);
  const nose = rot([-ax, -az], -rad(E.peakAt[which] / 2));
  const at0 = Math.atan2(nose[0], nose[1]);
  const points = [];
  for (let i = 0; i < steps; i++) {
    const phi = (i / steps) * Math.PI * 2 - Math.PI;
    const u = Math.abs(phi) / E.lobeHalf;
    const g = u < 1 ? Math.cos((u * Math.PI) / 2) ** 2 : 0;
    const r = E.base + E.lift[which] * g;
    const a = at0 + phi;
    points.push([r * Math.sin(a), r * Math.cos(a)]);
  }
  return hull(points);
}

const LOBES = { in: lobe("in"), ex: lobe("ex") };

// Flat bucket tappet: its travel is the lobe's support distance along the valve axis, minus the base circle.
export function liftOf(which, theta) {
  const [ax, az] = valveAxis(which);
  const turn = rad(theta / 2);
  let most = -Infinity;
  for (const p of LOBES[which]) {
    const [x, z] = rot(p, turn);
    most = Math.max(most, -(x * ax + z * az));
  }
  return Math.max(0, most - E.base);
}

export const LIFT = { in: [], ex: [] };
for (let d = 0; d < 720; d++) { LIFT.in.push(liftOf("in", d)); LIFT.ex.push(liftOf("ex", d)); }

export function lift(which, theta) {
  const t = wrap(theta), i = Math.floor(t), f = t - i, table = LIFT[which];
  return table[i] * (1 - f) + table[(i + 1) % 720] * f;
}

export function timing(which, least = 0.1) {
  const table = LIFT[which];
  let open = null, close = null;
  for (let d = 0; d < 720; d++) {
    const now = table[d] > least, before = table[(d + 719) % 720] > least;
    if (now && !before) open = d;
    if (!now && before) close = d;
  }
  return { open, close, peak: Math.max(...table) };
}

export const TIMES = { in: timing("in"), ex: timing("ex") };

export const burned = (theta) => {
  const t = wrap(theta) - E.spark;
  if (t <= 0) return 0;
  return 1 - Math.exp(-6.9 * Math.pow(Math.min(t, 200) / E.burn, 3));
};

export const burnRate = (theta) => {
  const t = wrap(theta) - E.spark;
  if (t <= 0 || t > 200) return 0;
  const x = t / E.burn;
  return 6.9 * 3 * x * x * Math.exp(-6.9 * x * x * x);
};

// Cylinder pressure in bar: a polytropic engine with a Wiebe burn, open-cycle values at the ends.
export function pressure(theta) {
  const t = wrap(theta);
  const k = 1.32;
  const IVC = TIMES.in.close, EVO = TIMES.ex.open;
  const pIn = 0.92, pEx = 1.12;
  if (t < 180 || t < IVC) return t < 20 ? pEx + (pIn - pEx) * (t / 20) : pIn;
  if (t >= 560) return pEx;
  const fired = pIn * Math.pow(volume(IVC) / volume(t), k) * (1 + 3.4 * burned(t));
  if (t < EVO) return fired;
  const blow = Math.min(1, (t - EVO) / 70);
  const ease = blow * blow * (3 - 2 * blow);
  return fired * (1 - ease) + pEx * ease;
}

export const STROKES = ["Впуск", "Сжатие", "Рабочий ход", "Выпуск"];
export const strokeOf = (theta) => Math.floor(wrap(theta) / 180);
