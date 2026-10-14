import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../../.claude/skills/anatomy/kit/tube.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = join(HERE, "../../.claude/skills/anatomy/kit");
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 600;
const HEIGHT = 720;
const AZ = 58;
const R = M.BORE_R;
const HEAD_TOP = 298;
const COVER_TOP = 352;
const BLOCK = { x0: -62, x1: 62, z0: 60, z1: M.DECK };
const HEAD = { x0: -82, x1: 82, z0: M.HEAD0, z1: HEAD_TOP };
const BACK = -62;
const PLATE = { x: -150, y: -104, w: 300, d: 196, r: 8 };
const PLATE_TOP = -116;
const SUMP_FLOOR = -98;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, PLATE_TOP - 17, PLATE_TOP), [1.5, 0, 378], [118, 0, 362], [118, 26, 362], [-82, BACK, COVER_TOP], [82, 0, COVER_TOP]],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: AZ },
);
const V = G.viewOf(P);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const poly = (points, close = true) => "M" + points.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L") + (close ? "Z" : "");
const depth = (p) => G.dot3(p, V);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const FY = (o) => G.frameOf(o, [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const FX = (o) => G.frameOf(o, [1, 0, 0], [0, 1, 0], [0, 0, 1]);
const FZ = (o) => G.frameOf(o, [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const FMX = (o) => G.frameOf(o, [-1, 0, 0], [0, 1, 0], [0, 0, 1]);

// A box cut by the plane y = 0: square front corners, rounded back ones.
function cutRing(x0, x1, y0, r = 0, y1 = 0) {
  const ring = [[x1, y1], [x0, y1]];
  if (r > 0) {
    for (let i = 0; i <= 4; i++) { const a = Math.PI + (i / 4) * (Math.PI / 2); ring.push([x0 + r + r * Math.cos(a), y0 + r + r * Math.sin(a)]); }
    for (let i = 0; i <= 4; i++) { const a = Math.PI * 1.5 + (i / 4) * (Math.PI / 2); ring.push([x1 - r + r * Math.cos(a), y0 + r + r * Math.sin(a)]); }
  } else ring.push([x0, y0], [x1, y0]);
  return ring;
}
const cutFace = (x0, x1, z0, z1) => `<path class="ice-cut" d="${poly([[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]])}"/>`;
const cutBox = (x0, x1, y0, z0, z1, style = { tone: "mid" }, r = 0, y1 = 0) => S(k.extrude(cutRing(x0, x1, y0, r, y1), z0, z1 - z0, P), y1 === 0 ? { ...style, inner: cutFace(x0, x1, z0, z1) + (style.inner || "") } : style);

// A concave prism (the block with its half bore): faces painted back to front, then the top.
function notched(ring, z0, z1, { tone = "mid" } = {}) {
  let area = 0;
  ring.forEach(([ax, ay], i) => { const [bx, by] = ring[(i + 1) % ring.length]; area += ax * by - bx * ay; });
  const pts = area > 0 ? ring : [...ring].reverse();
  const n = pts.length;
  const faces = [];
  const normals = pts.map(([ax, ay], i) => { const [bx, by] = pts[(i + 1) % n]; const l = Math.hypot(bx - ax, by - ay) || 1; return [(by - ay) / l, -(bx - ax) / l, 0]; });
  const seen = normals.map((nm) => G.dot3(nm, V) > 1e-6);
  const sharp = (i) => { const a = normals[(i - 1 + n) % n], b = normals[i]; return a[0] * b[0] + a[1] * b[1] < Math.cos(0.4); };
  for (let i = 0; i < n; i++) {
    if (!seen[i]) continue;
    const a = pts[i], b = pts[(i + 1) % n];
    const quad = [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]];
    const lines = [poly([quad[0], quad[1]], false)];
    if (!seen[(i - 1 + n) % n] || sharp(i)) lines.push(poly([quad[0], quad[3]], false));
    if (!seen[(i + 1) % n] || sharp((i + 1) % n)) lines.push(poly([quad[1], quad[2]], false));
    faces.push({ key: depth([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2]), d: poly(quad), band: G.toneOf(normals[i], P), cut: Math.abs(a[1]) < 1e-6 && Math.abs(b[1]) < 1e-6, lines: lines.join("") });
  }
  faces.sort((p, q) => p.key - q.key);
  const top = poly(pts.map(([x, y]) => [x, y, z1]));
  return `<g class="iso-solid" data-seamless="">${faces.map((f) => `<path class="${f.cut ? "ice-cut" : "iso-shade"}" data-shade="${Math.min(3, f.band)}" d="${f.d}"/><path class="iso-line" data-tone="${tone}" d="${f.lines}"/>`).join("")}<path class="iso-top" d="${top}"/><path class="iso-line iso-edge" data-tone="${tone}" d="${top}"/></g>`;
}

const halfBore = (r, steps = 48) => Array.from({ length: steps + 1 }, (_, i) => { const t = -(i / steps) * Math.PI; return [r * Math.cos(t), r * Math.sin(t)]; });
const notchRing = (x0, x1, y0, r, rc = 6) => {
  const ring = [[x1, 0], [r, 0], ...halfBore(r).slice(1, -1), [-r, 0], [x0, 0]];
  for (let i = 0; i <= 4; i++) { const a = Math.PI + (i / 4) * (Math.PI / 2); ring.push([x0 + rc + rc * Math.cos(a), y0 + rc + rc * Math.sin(a)]); }
  for (let i = 0; i <= 4; i++) { const a = Math.PI * 1.5 + (i / 4) * (Math.PI / 2); ring.push([x1 - rc + rc * Math.cos(a), y0 + rc + rc * Math.sin(a)]); }
  return ring;
};

// A cavity on the cut face y = 0, given as [x, z] points.
const hole = (xz, { tone = "lo" } = {}) => `<path class="ice-hole" d="${poly(xz.map(([x, z]) => [x, 0, z]))}"/><path class="iso-line" data-tone="${tone}" d="${poly(xz.map(([x, z]) => [x, 0, z]))}"/>`;
const xzRect = (x0, x1, z0, z1, r = 2) => {
  const out = [];
  const c = [[x1 - r, z1 - r, 0], [x0 + r, z1 - r, 1], [x0 + r, z0 + r, 2], [x1 - r, z0 + r, 3]];
  for (const [cx, cz, q] of c) for (let i = 0; i <= 3; i++) { const a = (q + i / 3) * (Math.PI / 2); out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); }
  return out;
};
// A band along a centreline in the xz plane, widths per point.
function bandXZ(points, widths) {
  const left = [], right = [];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l, w = widths[i];
    left.push([p[0] + nx * w, p[1] + nz * w]);
    right.push([p[0] - nx * w, p[1] - nz * w]);
  });
  return [...left, ...right.reverse()];
}
const curve = (ctrl, steps = 24) => {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let pts = ctrl.map((p) => [...p]);
    while (pts.length > 1) pts = pts.slice(1).map((p, j) => [pts[j][0] + (p[0] - pts[j][0]) * t, pts[j][1] + (p[1] - pts[j][1]) * t]);
    out.push(pts[0]);
  }
  return out;
};

// ---------- the bench ----------
function bench() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, PLATE_TOP - 17, 12, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(k.cylinder(x, y, 8, PLATE_TOP - 17, 1.8, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, PLATE_TOP - 15.2, 3.2, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, PLATE_TOP - 12, 12, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), PLATE_TOP, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, PLATE_TOP, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, PLATE_TOP])), { size: 0.5 }));
  const strip = { x: -120, y: PLATE.y + PLATE.d - 15, w: 240, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, PLATE_TOP, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, PLATE_TOP + 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, PLATE_TOP + 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, PLATE_TOP + 0.6])], { size: 0.45 }));
  const label = { x: 92, y: 30, w: 40, d: 22, r: 1.2 };
  out.push(S(k.slabOf(label, PLATE_TOP, 0.8, P, 4), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(label, 1.6), PLATE_TOP + 0.8, P), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([label.x + 5, label.y + 8], PLATE_TOP + 0.8, P, "x"), "ДВС 0,5 л", { size: 3.4, tone: "lo" }));
  for (const [i, len] of [[0, 28], [1, 20]]) out.push(L(k.lineOnTop([label.x + 5, label.y + 12.5 + i * 4], [label.x + 5 + len, label.y + 12.5 + i * 4], PLATE_TOP + 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([label.x + 2.4, label.y + 2.4, PLATE_TOP + 0.8]), at([label.x + label.w - 2.4, label.y + label.d - 2.4, PLATE_TOP + 0.8])], { size: 0.4 }));
  return out.join("");
}

// ---------- exhaust side (far, -x): drawn before the head that hides its root ----------
const EX_PORT = [-HEAD.x1, 0, 262];
const SIL = { x: -122, y: 0, r: 21, z0: PLATE_TOP + 6, z1: 26 };
function exhaust() {
  const out = [];
  // silencer on two saddle feet
  for (const y of [-14, 14]) out.push(cutBox(SIL.x - 16, SIL.x + 16, y - 3, PLATE_TOP, PLATE_TOP + 7, { tone: "lo" }, 0, y + 3));
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: SIL.x - 20, y: -20, w: 40, d: 40, r: 18 }, PLATE_TOP, 1, P)}" style="filter:blur(5px)"/>`);
  const can = FZ([SIL.x, SIL.y, SIL.z0]);
  const H = SIL.z1 - SIL.z0;
  const prof = [[0, SIL.r - 2], [2, SIL.r, 1], [H - 6, SIL.r, 1], [H - 1, SIL.r - 4, 1], [H, SIL.r - 9]];
  const body = G.solidOf(prof, can, P);
  const ribs = G.ribsOf(can, 10, H - 12, SIL.r, 18, P, { fade: [0.05, 0.5], seams: true });
  out.push(S(body, { tone: "mid", inner: k.fadedSvg(ribs, { tone: "faint" }) }));
  out.push(S(G.disc(H, H + 3, 9, can, P), { tone: "mid" }));
  // tail pipe low on the near side
  const tail = FX([SIL.x, 0, SIL.z0 + 18]);
  out.push(S(G.solidOf([[SIL.r - 1, 5], [SIL.r + 22, 5]], tail, P, { hole: [SIL.r + 22, 3.6] }), { tone: "mid" }));
  // header pipe from the port flange down into the can
  const route = G.fillet([[EX_PORT[0] - 6, 0, EX_PORT[2]], [-104, 0, EX_PORT[2]], [SIL.x, 0, 232], [SIL.x, 0, SIL.z1 + 3]], 16, 9, { P, tube: 11 });
  const pieces = tubePieces(route, 11, P, { maxLength: 40, rings: { pitch: 9, fade: [0.15, 0.6], tone: "faint" } });
  pieces.sort((a, b) => depth(a.mid) - depth(b.mid)).forEach((piece) => out.push(tubeSvg(piece, { tone: "mid" })));
  const fl = FMX(EX_PORT);
  out.push(S(G.disc(0, 6, 19, fl, P), { tone: "mid", inner: k.dotsSvg(G.dotsOf(fl, 6, 14, 4, P, { phase: 0.78, fade: [0.04, 0.42] }), { size: 0.55, tone: "mid" }) }));
  out.push(S(G.disc(SIL.z1 - SIL.z0 + 3, SIL.z1 - SIL.z0 + 7, 15, can, P), { tone: "mid" }));
  return out.join("");
}

// ---------- the bottom end: sump, crankcase ----------
function bottom() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: -80, y: BACK, w: 160, d: -BACK + 30, r: 10 }, PLATE_TOP, 2, P)}"/>`);
  for (const x of [-52, 52]) {
    out.push(cutBox(x - 15, x + 15, -48, PLATE_TOP, PLATE_TOP + 4, { tone: "lo" }, 2, -14));
    out.push(S(k.extrude(cutRing(x - 11, x + 11, -44, 2, -18), PLATE_TOP + 4, SUMP_FLOOR - PLATE_TOP - 6, P), { tone: "lo", crease: "none" }));
    out.push(cutBox(x - 14, x + 14, -47, SUMP_FLOOR - 2, SUMP_FLOOR, { tone: "mid" }, 2, -15));
    out.push(D([at([x - 10, -18, SUMP_FLOOR]), at([x + 10, -18, SUMP_FLOOR])], { size: 0.45 }));
  }
  // sump: floor, oil, back and side walls
  out.push(cutBox(-80, 80, BACK, SUMP_FLOOR, SUMP_FLOOR + 3, { tone: "mid" }, 6));
  out.push(cutBox(-80, 80, BACK, SUMP_FLOOR + 3, -60, { tone: "mid" }, 6, BACK + 4));
  out.push(`<g class="ice-oil">${cutBox(-76, 76, BACK + 4, SUMP_FLOOR + 3, -84, { tone: "lo" })}</g>`);
  out.push(cutBox(-80, -76, BACK + 4, SUMP_FLOOR + 3, -60, { tone: "mid" }));
  out.push(cutBox(76, 80, BACK + 4, SUMP_FLOOR + 3, -60, { tone: "mid" }));
  const plug = FX([80, -30, -86]);
  out.push(S(G.prismOf(plug, Array.from({ length: 6 }, (_, i) => [5.5 * Math.cos((i / 6) * Math.PI * 2 + 0.5), 5.5 * Math.sin((i / 6) * Math.PI * 2 + 0.5)]), 0, 4, P), { tone: "mid" }));
  out.push(cutBox(-84, 84, BACK - 2, -62, -58, { tone: "mid" }, 6));
  out.push(D([-70, -40, 40, 70].map((x) => at([x, BACK + 1, -58])), { size: 0.45 }));
  // crankcase: rear wall with ribs and the main bearing boss, side walls, roof
  out.push(cutBox(-80, 80, BACK, -58, 60, { tone: "mid" }, 6, BACK + 8));
  for (const x of [-58, 58]) out.push(cutBox(x - 3, x + 3, BACK + 8, -58, 54, { tone: "mid" }, 1, BACK + 12));
  const boss = FY([0, BACK + 8, 0]);
  out.push(S(G.disc(0, 9, 36, boss, P), { tone: "mid", inner: k.dotsSvg(G.dotsOf(boss, 9, 30.5, 6, P, { all: true, phase: 0.26 }), { size: 0.55, tone: "mid" }) }));
  out.push(L(G.circleOf(boss, 9, 26.5, P), { tone: "lo" }));
  out.push(L(G.circleOf(boss, 9, 24.6, P), { tone: "faint" }));
  out.push(cutBox(-80, -72, BACK + 8, -58, 54, { tone: "mid" }));
  out.push(cutBox(72, 80, BACK + 8, -58, 54, { tone: "mid" }));
  out.push(cutBox(-80, -62, BACK, 54, 60, { tone: "mid" }));
  out.push(cutBox(62, 80, BACK, 54, 60, { tone: "mid" }));
  // oil filter on the near (+x) side
  const filter = FX([80, -31, 6]);
  out.push(S(G.disc(0, 4, 15, filter, P), { tone: "mid" }));
  const fprof = [[4, 19], [6, 21, 1], [44, 21, 1], [50, 19, 1], [54, 13, 1], [55, 0]];
  const ribs = G.ribsOf(filter, 12, 42, 21, 22, P, { fade: [0.05, 0.5], seams: true });
  out.push(S(G.solidOf(fprof, filter, P), { tone: "mid", inner: k.fadedSvg(ribs, { tone: "lo" }) }));
  // dipstick
  const stick = [[70, -44, 60], [70, -44, 150]];
  tubePieces(stick, 2.2, P, { maxLength: 200 }).forEach((p) => out.push(tubeSvg(p, { tone: "mid" })));
  const cap = FZ([70, -44, 150]);
  out.push(S(G.disc(0, 5, 4.6, cap, P), { tone: "mid" }));
  out.push(L(G.circleOf(G.frameOf([70, -44, 158], [0, 1, 0], [1, 0, 0], [0, 0, 1]), 0, 3.4, P), { tone: "hi" }));
  return out.join("");
}

// ---------- block, gasket, the bore's back wall ----------
const roofAt = M.roofAt;
function boreWall() {
  const faces = [];
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const t0 = Math.PI + (i / steps) * Math.PI, t1 = Math.PI + ((i + 1) / steps) * Math.PI;
    const tm = (t0 + t1) / 2;
    const normal = [-Math.cos(tm), -Math.sin(tm), 0];
    if (G.dot3(normal, V) <= 0) continue;
    const a = [R * Math.cos(t0), R * Math.sin(t0)], b = [R * Math.cos(t1), R * Math.sin(t1)];
    const quad = [[a[0], a[1], BLOCK.z0], [b[0], b[1], BLOCK.z0], [b[0], b[1], roofAt(b[0])], [a[0], a[1], roofAt(a[0])]];
    faces.push(`<path class="iso-shade" data-shade="${Math.min(3, G.toneOf(normal, P))}" d="${poly(quad)}"/>`);
  }
  const arcAt = (z, from = Math.PI, to = 2 * Math.PI, zf = null) => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const t = from + (i / 80) * (to - from);
      const normal = [-Math.cos(t), -Math.sin(t), 0];
      if (G.dot3(normal, V) <= 0) break;
      const x = R * Math.cos(t);
      pts.push([x, R * Math.sin(t), zf ? zf(x) : z]);
    }
    return poly(pts, false);
  };
  const lines = [arcAt(BLOCK.z0), arcAt(M.DECK), arcAt(M.HEAD0), arcAt(0, Math.PI, 2 * Math.PI, roofAt), arcAt(BLOCK.z0 + 16)];
  return `<g class="iso-solid ice-bore" data-seamless="">${faces.join("")}${L(lines.slice(0, 4).join(""), { tone: "lo" })}${L(lines[4], { tone: "faint" })}</g>`;
}

function block() {
  const out = [];
  out.push(notched(notchRing(BLOCK.x0, BLOCK.x1, BACK, R), BLOCK.z0, BLOCK.z1));
  // liner seam and the water jacket seen in the cut
  for (const s of [-1, 1]) {
    out.push(L(poly([[s * 48, 0, BLOCK.z0], [s * 48, 0, BLOCK.z1]], false), { tone: "faint" }));
    out.push(hole(xzRect(s > 0 ? 51 : -57, s > 0 ? 57 : -51, 96, 212, 2.5)));
  }
  // near side: freeze plug, knock sensor, casting rib
  const plugF = FX([BLOCK.x1, -31, 168]);
  out.push(S(G.disc(0, 1.6, 11, plugF, P), { tone: "mid", inner: L(G.circleOf(plugF, 1.6, 8.5, P), { tone: "faint" }) }));
  const knock = FX([BLOCK.x1, -40, 108]);
  out.push(S(G.disc(0, 3, 7, knock, P), { tone: "mid" }));
  out.push(S(G.prismOf(knock, Array.from({ length: 6 }, (_, i) => [5 * Math.cos((i / 6) * Math.PI * 2), 5 * Math.sin((i / 6) * Math.PI * 2)]), 3, 8, P), { tone: "mid" }));
  out.push(cutBox(BLOCK.x1, BLOCK.x1 + 3, -14, 64, 210, { tone: "mid" }, 0, -8));
  // head gasket
  out.push(`<g class="ice-gasket">${notched(notchRing(BLOCK.x0 - 1, BLOCK.x1 + 1, BACK - 1, R, 6), M.DECK, M.HEAD0, { tone: "lo" })}</g>`);
  return out.join("");
}

// ---------- head with its cavities, cam carrier, cover ----------
const AX = { in: M.valveAxis("in"), ex: M.valveAxis("ex") };
const SEAT = { in: M.valveSeat("in"), ex: M.valveSeat("ex") };
const along = (w, s) => [SEAT[w][0] + AX[w][0] * s, SEAT[w][1] + AX[w][1] * s];
const portLine = {
  in: curve([[SEAT.in[0], SEAT.in[1] + 1], along("in", 14), [44, 236], [66, 252], [HEAD.x1, 262]], 30),
  ex: curve([[SEAT.ex[0], SEAT.ex[1] + 1], along("ex", 13), [-46, 236], [-66, 252], [HEAD.x0, 262]], 30),
};
const WELL = { s0: 36, s1: (HEAD_TOP - SEAT.in[1]) / AX.in[1] + 2 };
const PLUG_X = 1.5;

function headCavities() {
  const chamber = [[-R, M.HEAD0], [0, M.ROOF_TOP], [R, M.HEAD0]];
  const out = [];
  for (const w of ["in", "ex"]) {
    const line = portLine[w];
    const widths = line.map((_, i) => { const t = i / (line.length - 1); return (w === "in" ? 11.5 : 10) + t * 2.5; });
    out.push(hole(bandXZ(line, widths)));
    const a = along(w, 12), b = along(w, WELL.s0);
    out.push(hole(bandXZ([a, b], [3.8, 3.8])));
    const c = along(w, WELL.s0), d = along(w, WELL.s1);
    out.push(hole(bandXZ([c, d], [15.5, 15.5])));
  }
  out.push(hole([[PLUG_X - 6.4, M.ROOF_TOP - 0.2], [PLUG_X + 6.4, M.ROOF_TOP - 0.2], [PLUG_X + 6.4, 242], [PLUG_X + 11, 246], [PLUG_X + 11, HEAD_TOP + 0.5], [PLUG_X - 11, HEAD_TOP + 0.5], [PLUG_X - 11, 246], [PLUG_X - 6.4, 242]]));
  for (const s of [-1, 1]) out.push(hole(xzRect(s > 0 ? 56 : -76, s > 0 ? 76 : -56, 224, 240, 3)));
  out.push(hole(xzRect(-13, -9, 252, 286, 1.5)), hole(xzRect(14, 18, 252, 286, 1.5)));
  return { chamber, svg: out.join("") };
}

function head() {
  const { x0, x1, z0, z1 } = HEAD;
  const out = [];
  const cut = [[x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [x0, 0, z0], [-R, 0, z0], [0, 0, M.ROOF_TOP], [R, 0, z0]];
  const side = [[x1, 0, z0], [x1, BACK, z0], [x1, BACK, z1], [x1, 0, z1]];
  const top = [[x0, 0, z1], [x1, 0, z1], [x1, BACK, z1], [x0, BACK, z1]];
  out.push(`<g class="iso-solid" data-seamless=""><path class="ice-cut" fill-rule="evenodd" d="${poly(cut)}"/><path class="iso-shade" data-shade="${Math.min(3, G.toneOf([1, 0, 0], P))}" d="${poly(side)}"/><path class="iso-top" d="${poly(top)}"/>`);
  out.push(L(poly([[x1, BACK, z0], [x1, 0, z0]], false) + poly([[x1, 0, z0], [x1, 0, z1]], false) + poly([[-R, 0, z0], [x0, 0, z0], [x0, 0, z1]], false), { tone: "mid" }));
  out.push(L(poly([[R, 0, z0], [x1, 0, z0]], false), { tone: "mid" }));
  out.push(L(poly([[x0, 0, z1], [x1, 0, z1], [x1, BACK, z1], [x0, BACK, z1]], false) + poly([[x1, BACK, z1], [x1, BACK, z0]], false), { tone: "mid" }));
  out.push(L(poly([[-R, 0, z0], [0, 0, M.ROOF_TOP], [R, 0, z0]], false), { tone: "mid" }));
  out.push(`</g>`);
  out.push(headCavities().svg);
  // near side: bolt bosses and a lifting eye
  for (const y of [-50, -12]) {
    const f = FX([x1, y, 284]);
    out.push(S(G.disc(0, 2, 5.4, f, P), { tone: "mid" }));
  }
  out.push(cutBox(x1, x1 + 4, -58, 230, 246, { tone: "mid" }, 1.5, -46));
  out.push(L(G.circleOf(G.frameOf([x1 + 2, -52, 238], [0, 1, 0], [1, 0, 0], [0, 0, 1]), 6.1, 3.2, P), { tone: "lo" }));
  // inside the cam box: head bolts and cam saddles
  for (const [x, y] of byDepth([[-70, -52], [70, -52], [-70, -10], [70, -10], [-24, -52], [24, -52]])) {
    out.push(S(k.cylinder(x, y, 4.4, z1, 4, P, 16), { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 2.6, z1 + 4, 1.2, P, 6), { tone: "lo" }));
  }
  for (const w of ["in", "ex"]) {
    const [cx, cz] = M.camCentre(w);
    out.push(cutBox(cx - 15, cx + 15, -50, z1, cz - 1, { tone: "mid" }, 2, -34));
    out.push(S(G.disc(-50, -34, 13.4, FY([cx, 0, cz]), P), { tone: "mid" }));
    out.push(cutBox(cx - 15, cx + 15, -50, cz + 1, cz + 15, { tone: "mid" }, 2, -34));
    out.push(D([at([cx - 10, -42, cz + 15]), at([cx + 10, -42, cz + 15])], { size: 0.5, tone: "mid" }));
    out.push(L(poly([[cx - 15, -34, cz + 1], [cx + 15, -34, cz + 1]], false), { tone: "lo" }));
  }
  return out.join("");
}

function cover() {
  const out = [];
  out.push(cutBox(-82, 82, BACK, HEAD_TOP, COVER_TOP, { tone: "mid" }, 6, BACK + 4));
  out.push(cutBox(-82, -78, BACK + 4, HEAD_TOP, COVER_TOP - 4, { tone: "mid" }));
  out.push(cutBox(78, 82, BACK + 4, HEAD_TOP, COVER_TOP - 4, { tone: "mid" }));
  out.push(cutBox(-82, 82, BACK + 4, COVER_TOP - 4, COVER_TOP, { tone: "mid" }));
  out.push(L(poly([[82, BACK + 6, HEAD_TOP + 3], [82, 0, HEAD_TOP + 3]], false), { tone: "faint" }));
  // oil filler cap on top
  const cap = FZ([46, -30, COVER_TOP]);
  out.push(S(G.disc(0, 3, 13, cap, P), { tone: "mid" }));
  out.push(S(G.disc(3, 8, 11, cap, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(cap, 3, 8, 11, 24, P, { fade: [0.05, 0.5] }), { tone: "lo" }) }));
  out.push(D(G.dotsOf(FZ([-46, -30, COVER_TOP]), 0, 8, 6, P, { all: true }), { size: 0.5, tone: "mid" }));
  out.push(L(G.circleOf(FZ([-46, -30, COVER_TOP]), 0, 8, P), { tone: "faint" }));
  return out.join("");
}

// ---------- intake side (near, +x): drawn after the moving parts ----------
const IN_PORT = [HEAD.x1, 0, 262];
function intake() {
  const out = [];
  const fl = FX(IN_PORT);
  const route = G.fillet([[IN_PORT[0] + 5, 0, IN_PORT[2]], [104, 0, IN_PORT[2]], [118, 0, 282], [118, 0, 300]], 14, 9, { P, tube: 11 });
  tubePieces(route, 11, P, { maxLength: 40 }).sort((a, b) => depth(a.mid) - depth(b.mid)).forEach((p) => out.push(tubeSvg(p, { tone: "mid" })));
  out.push(S(G.disc(0, 5, 19, fl, P), { tone: "mid", inner: k.dotsSvg(G.dotsOf(fl, 5, 14.5, 4, P, { phase: 0.78, fade: [0.04, 0.42] }), { size: 0.55, tone: "mid" }) }));
  // injector on the runner
  const inj = G.frameAlong([98, 0, 273], G.unit3([-0.55, 0, 0.83]));
  out.push(S(G.solidOf([[0, 4], [4, 4.4], [5, 6.2, 1], [18, 6.2, 1], [20, 4.6], [24, 4.6]], inj, P), { tone: "mid", inner: L(G.arcOf(inj, 12, 6.2, P), { tone: "faint" }) }));
  const tip = G.pointOf(inj, 24, 0, 0);
  out.push(k.wireSvg(at(tip), at([70, -2, HEAD_TOP + 4]), { via: [at([tip[0] - 6, 0, tip[2] + 10])], tone: "lo", size: 1.1 }));
  // throttle body and air filter
  const tb = FZ([118, 0, 300]);
  out.push(S(G.disc(0, 18, 15, tb, P), { tone: "mid", inner: L(G.arcOf(tb, 9, 15, P), { tone: "faint" }) }));
  const lever = [118 + 15, 0, 309];
  out.push(S(G.disc(0, 3, 4, FX([118 + 14.5, 0, 309]), P), { tone: "mid" }));
  out.push(L(k.segment(lever, [lever[0] + 4, 10, 314], P), { tone: "mid" }));
  out.push(D([at([lever[0] + 4, 10, 314])], { size: 0.9, tone: "mid" }));
  const air = FZ([118, 0, 318]);
  const pleats = G.ribsOf(air, 4, 34, 27, 48, P, { fade: [0.04, 0.5], seams: true });
  out.push(S(G.disc(0, 4, 28, air, P), { tone: "mid" }));
  out.push(S(G.disc(4, 34, 27, air, P), { tone: "mid", inner: k.fadedSvg(pleats, { tone: "lo" }) }));
  out.push(S(G.disc(34, 38, 28, air, P), { tone: "mid" }));
  out.push(S(G.disc(38, 42, 6, air, P), { tone: "mid" }));
  out.push(S(G.prismOf(G.frameOf([118, 0, 360], [0, 0, 1], [1, 0, 0], [0, 1, 0]), [[-10, -1.6], [10, -1.6], [10, 1.6], [-10, 1.6]], 0, 2.4, P), { tone: "mid" }));
  return out.join("");
}

// ---------- the indicator gauge: reads cylinder pressure from a tapping on the head ----------
const GAUGE = { x: 112, y: 52, r: 22, z: -40 };
const GAUGE_TOP = GAUGE.z + 9;
const GAUGE_SPAN = (5 / 6) * Math.PI * 2;
const GAUGE_MAX = 50;
function gauge() {
  const out = [];
  const { x, y, r, z } = GAUGE;
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: x - 16, y: y - 16, w: 32, d: 32, r: 14 }, PLATE_TOP, 1, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.cylinder(x, y, 15, PLATE_TOP, 4, P, 40), { tone: "mid" }));
  out.push(D(G.dotsOf(FZ([x, y, PLATE_TOP + 4]), 0, 11.5, 3, P, { all: true, phase: 0.5 }), { size: 0.5 }));
  out.push(S(k.cylinder(x, y, 3.2, PLATE_TOP + 4, z - PLATE_TOP - 4, P, 20), { tone: "mid", crease: "none" }));
  out.push(L(k.sideArc(x, y, 3.2, -80, P, 12), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, 7, z - 4, 4, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, r, z, 9, P, 72, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.sideArc(x, y, r, z + 5.5, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, r - 2.2, GAUGE_TOP, P, 72), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, r - 3, 50, 10, GAUGE_TOP, [1.3, 2.8], P, -GAUGE_SPAN / 2 + Math.PI, GAUGE_SPAN);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 9], GAUGE_TOP, P, "x"), "бар", { size: 3, tone: "lo", anchor: "middle" }));
  out.push(L(k.ring(x, y, 1.6, GAUGE_TOP, P, 16), { tone: "mid" }));
  // capillary from the gauge's back to a tapping on the head
  const tap = FX([HEAD.x1, -34, 236]);
  out.push(S(G.disc(0, 4, 5, tap, P), { tone: "mid" }));
  out.push(S(G.prismOf(tap, Array.from({ length: 6 }, (_, i) => [4.6 * Math.cos((i / 6) * Math.PI * 2), 4.6 * Math.sin((i / 6) * Math.PI * 2)]), 4, 8, P), { tone: "mid" }));
  const route = G.fillet([[HEAD.x1 + 8, -34, 236], [100, -34, 236], [100, -34, 30], [x - r - 1, y - 14, z + 4.5]], 12, 9, { P, tube: 1.3 });
  tubePieces(route, 1.3, P, { maxLength: 400, caps: [true, true] }).forEach((p) => out.push(tubeSvg(p, { tone: "lo" })));
  return out.join("");
}
const needleAt = (bar) => {
  const a = Math.PI - GAUGE_SPAN / 2 + (Math.min(bar, GAUGE_MAX) / GAUGE_MAX) * GAUGE_SPAN;
  const { x, y, r } = GAUGE;
  return k.lineOnTop([x - Math.sin(a) * 3.6, y + Math.cos(a) * 3.6], [x + Math.sin(a) * (r - 4), y - Math.cos(a) * (r - 4)], GAUGE_TOP + 0.2, P);
};

// ---------- static parts of the moving layer ----------
function valveTrainStatic(w) {
  const F = G.frameOf([SEAT[w][0], 0, SEAT[w][1]], [AX[w][0], 0, AX[w][1]], [AX[w][1], 0, -AX[w][0]], [0, 1, 0]);
  return S(G.disc(WELL.s0, WELL.s0 + 1.6, 12.5, F, P), { tone: "lo" });
}
function valveShape(w) {
  const F = G.frameOf([SEAT[w][0], 0, SEAT[w][1]], [AX[w][0], 0, AX[w][1]], [AX[w][1], 0, -AX[w][0]], [0, 1, 0]);
  const r = M.ENGINE.valveR[w];
  const prof = [[-1.6, r - 0.6], [-0.6, r], [1.4, r - 1.6], [3, r - 4.5, 1], [6, 6.4, 1], [11, 3.6, 1], [14, 3], [84, 3]];
  const valve = S(G.solidOf(prof, F, P), { tone: "hi", inner: L(G.arcOf(F, 0.4, r - 0.6, P), { tone: "lo" }) });
  const retainer = S(G.solidOf([[64, 10.5], [66.5, 10.5], [67.5, 7]], F, P), { tone: "mid" }) + S(G.disc(67.5, 70, 4.6, F, P), { tone: "mid" });
  const tappet = S(G.disc(60, 79, 14, F, P), { tone: "mid", inner: L(G.arcOf(F, 76, 14, P), { tone: "faint" }) }) + L(G.circleOf(F, 79, 10, P), { tone: "faint" });
  return { valve, retainer, tappet };
}
function plugAndCoil() {
  const F = FZ([PLUG_X, 0, M.ROOF_TOP - 0.4]);
  const out = [];
  out.push(S(G.disc(-2.6, 0, 1.1, F, P), { tone: "hi" }));
  const threads = Array.from({ length: 11 }, (_, i) => G.arcOf(F, 1.4 + i * 1.5, 6, P)).join("");
  out.push(S(G.disc(0, 18, 6, F, P), { tone: "mid", inner: L(threads, { tone: "lo" }) }));
  out.push(S(G.disc(18, 19.6, 8.4, F, P), { tone: "mid" }));
  out.push(S(G.prismOf(F, Array.from({ length: 6 }, (_, i) => [8.8 * Math.cos((i / 6) * Math.PI * 2 + 0.3), 8.8 * Math.sin((i / 6) * Math.PI * 2 + 0.3)]), 19.6, 28, P), { tone: "mid" }));
  out.push(S(G.solidOf([[28, 6.4], [31, 6.4], [32, 5.2]], F, P), { tone: "mid" }));
  const ribs = Array.from({ length: 5 }, (_, i) => G.arcOf(F, 40 + i * 3, 5.2, P)).join("");
  out.push(S(G.solidOf([[32, 5.2], [55, 5.2, 1], [57, 4.2, 1], [58, 2.5]], F, P), { tone: "hi", inner: L(ribs, { tone: "faint" }) }));
  // coil-on-plug: boot down the well, body above the cover
  const coil = FZ([PLUG_X, 0, 0]);
  out.push(S(G.disc(276, 352, 8.6, coil, P), { tone: "mid", inner: L([300, 330].map((s) => G.arcOf(coil, s, 8.6, P)).join(""), { tone: "faint" }) }));
  out.push(S(G.solidOf([[352, 11], [354, 13, 1], [370, 13, 1], [372, 11]], coil, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(coil, 356, 368, 13, 20, P, { fade: [0.05, 0.5], seams: true }), { tone: "lo" }) }));
  out.push(cutBox(PLUG_X + 8, PLUG_X + 20, -6, 360, 370, { tone: "mid" }, 1.5, 6));
  out.push(k.wireSvg(at([PLUG_X + 20, 0, 365]), at([62, -30, COVER_TOP]), { via: [at([40, -6, 376])], tone: "lo", size: 1.1 }));
  return out.join("");
}

// ---------- the page ----------
const cav = headCavities();
const pistonF = FZ([0, 0, M.CROWN_TDC - 48]);
const pistonProf = [[0, 42.5], [32, 42.8], [34, 42.4], [48, 42.4]];
const grooves = [36.5, 40, 43.5].map((s) => G.arcOf(pistonF, s, 42.4, P)).join("");
const pinF = FY([0, 0, M.TDC_PIN]);
const reliefs = ["in", "ex"].map((w) => k.ring(SEAT[w][0], 0, M.ENGINE.valveR[w] + 1.5, M.CROWN_TDC, P, 48)).join("");
const piston = S(G.solidOf(pistonProf, pistonF, P), {
  tone: "hi",
  lit: true,
  inner: L(grooves, { tone: "lo" }) + L(G.circleOf(pinF, 42.2, 11, P) + G.circleOf(pinF, 42.2, 8.6, P), { tone: "lo" }) + L(reliefs, { tone: "faint" }),
});

const valves = { in: valveShape("in"), ex: valveShape("ex") };
const glowId = "ice-flame";
const cheekX = R / Math.sin((AZ * Math.PI) / 180);
const cheek = poly([[R - 0.4, 0, BLOCK.z0], [cheekX + 1, 0, BLOCK.z0], [cheekX + 1, 0, 232], [R - 0.4, 0, 232]]);

const headWindow = poly([[HEAD.x1, 0, M.DECK], [HEAD.x1, 0, COVER_TOP], [HEAD.x0, 0, COVER_TOP], [HEAD.x0, 0, M.DECK]]) + poly([[-R, 0, M.DECK - 0.6], [-R, 0, M.HEAD0], [0, 0, M.ROOF_TOP], [R, 0, M.HEAD0], [R, 0, M.DECK - 0.6]]);
const flowIn = L(poly(portLine.in.slice(3).reverse().map(([x, z]) => [x, 0, z]), false), { tone: "hi", flow: true, className: "ice-flow", free: true });
const flowEx = L(poly(portLine.ex.slice(3).map(([x, z]) => [x, 0, z]), false), { tone: "hi", flow: true, className: "ice-flow", free: true });

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "Одноцилиндровый четырёхтактный двигатель в разрезе на испытательной плите. Корпус разрезан по оси цилиндра, подвижные детали показаны целиком: поршень, шатун, коленчатый вал, два клапана с пружинами и толкателями, два распредвала, свеча зажигания. Справа на плите манометр показывает давление в цилиндре.",
  body: [
    `<defs><radialGradient id="${glowId}" gradientUnits="userSpaceOnUse" r="60"><stop offset="0" class="ice-flame-core"/><stop offset="0.45" class="ice-flame-mid"/><stop offset="1" class="ice-flame-edge"/></radialGradient><clipPath id="ice-cheek"><path d="${cheek}"/><path clip-rule="evenodd" d="${headWindow}"/></clipPath></defs>`,
    `<g id="ice-housing">`,
    bench(),
    exhaust(),
    bottom(),
    boreWall(),
    block(),
    head(),
    cover(),
    `</g>`,
    `<g data-part="crank-back"></g><g data-part="rod"></g><g data-part="crank-front"></g>`,
    `<g data-part="piston">${piston}</g>`,
    `<path data-part="glow" class="ice-glow" fill="url(#${glowId})" d=""/>`,
    `<use href="#ice-housing" clip-path="url(#ice-cheek)"/>`,
    `<g data-part="flow-ex" opacity="0">${flowEx}</g><g data-part="flow-in" opacity="0">${flowIn}</g>`,
    ...["ex", "in"].map((w) => `${valveTrainStatic(w)}<path data-part="spring-back-${w}" class="iso-line ice-coil" data-tone="lo" d=""/><g data-part="valve-${w}">${valves[w].valve}</g><path data-part="spring-front-${w}" class="iso-line ice-coil" data-tone="mid" d=""/><g data-part="spring-ends-${w}"></g><g data-part="retainer-${w}">${valves[w].retainer}</g><g data-part="tappet-${w}">${valves[w].tappet}</g><g data-part="cam-${w}"></g>`),
    plugAndCoil(),
    `<g data-part="spark" opacity="0"><circle class="ice-spark-halo" cx="${at([PLUG_X, 0, M.ROOF_TOP - 3.4])[0].toFixed(1)}" cy="${at([PLUG_X, 0, M.ROOF_TOP - 3.4])[1].toFixed(1)}" r="7"/><circle class="ice-spark" cx="${at([PLUG_X, 0, M.ROOF_TOP - 3.4])[0].toFixed(1)}" cy="${at([PLUG_X, 0, M.ROOF_TOP - 3.4])[1].toFixed(1)}" r="1.4"/></g>`,
    intake(),
    gauge(),
    `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(1)}" style="stroke-width:1.1"/>`,
  ],
});

const strip = (file) => readFileSync(file, "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
const lathe = `const G = (() => {${strip(join(KIT, "lathe.mjs"))}\nreturn { frameOf, pointOf, prismOf, disc, solidOf, circleOf, arcOf, dotsOf, viewOf, dot3, hullOf };})();`;
const model = `const M = (() => {${strip(join(HERE, "model.mjs"))}\nreturn { ENGINE, BORE_R, CRANK_R, TDC_PIN, CROWN_TDC, HEAD0, ROOF_TOP, roofAt, rot, crankPin, pinZ, lift, lobe, pressure, burnRate, burned, wrap, strokeOf, STROKES, valveAxis, valveSeat, camCentre, TIMES, pistonDrop };})();`;

const live = `
${lathe}
${model}
(() => {
const P = ${JSON.stringify(P)};
const AX = ${JSON.stringify(AX)}, SEAT = ${JSON.stringify(SEAT)}, WELL = ${JSON.stringify(WELL)};
const GAUGE = ${JSON.stringify(GAUGE)}, GAUGE_TOP = ${GAUGE_TOP}, GAUGE_SPAN = ${GAUGE_SPAN}, GAUGE_MAX = ${GAUGE_MAX};
const BACK_Y = ${BACK};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const part = (name) => svg.querySelector('[data-part="' + name + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const at = (p) => iso(p, P);
const S = (paths, style) => solidSvg(paths, style);
const L = (d, style) => lineSvg(d, style);
const FY = (o) => G.frameOf(o, [0, 1, 0], [1, 0, 0], [0, 0, 1]);
const poly = (pts, close) => "M" + pts.map((p) => at(p).map((v) => v.toFixed(1)).join(" ")).join("L") + (close ? "Z" : "");
const circle = (cx, cz, r, n = 28) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + r * Math.cos(a), cz + r * Math.sin(a)]; });
const rad = (d) => (d * Math.PI) / 180;
const crankF = FY([0, 0, 0]);
const needleAt = ${needleAt.toString().replace("k.lineOnTop", "lineOnTop")};

function web(theta) {
  const [px, pz] = M.crankPin(theta);
  const opp = Math.atan2(-px, -pz);
  const cw = [];
  for (let i = 0; i <= 14; i++) { const a = opp - 1.08 + (i / 14) * 2.16; cw.push([56 * Math.sin(a), 56 * Math.cos(a)]); }
  return G.hullOf([...circle(px, pz, 22, 24), ...circle(0, 0, 27, 24), ...cw]);
}
function crank(theta) {
  const [px, pz] = M.crankPin(theta);
  const pinF = FY([px, 0, pz]);
  const back = [
    S(G.disc(-44, -22, 24, crankF, P), { tone: "mid" }),
    S(G.prismOf(crankF, web(theta), -22, -12, P), { tone: "mid" }),
    S(G.disc(-12, 12, 21, pinF, P), { tone: "mid" }),
  ].join("");
  const ang = rad(theta);
  const mark = (s, r, a) => at(G.pointOf(crankF, s, r, a));
  const front = [
    S(G.prismOf(crankF, web(theta), 12, 22, P), { tone: "mid", inner: dotsSvg([at([px * 0.98, 22, pz * 0.98])], { size: 0.9, tone: "lo" }) }),
    S(G.disc(22, 36, 24, crankF, P), { tone: "mid" }),
    S(G.disc(36, 44, 20, crankF, P), { tone: "mid", inner: L(Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * Math.PI * 2 + ang; const p = G.pointOf(crankF, 44, 17, Math.PI / 2 - a); const q = G.pointOf(crankF, 44, 20, Math.PI / 2 - a); return "M" + at(p).join(" ") + "L" + at(q).join(" "); }).join(""), { tone: "lo" }) }),
    S(G.disc(44, 49, 9, crankF, P), { tone: "mid" }),
    dotsSvg([mark(44, 14.5, Math.PI / 2 - ang)], { size: 1.1, tone: "hi" }),
  ].join("");
  return { back, front };
}
function rod(theta) {
  const [px, pz] = M.crankPin(theta);
  const wz = M.pinZ(theta);
  const dx = 0 - px, dz = wz - pz, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, nx = -uz, nz = ux;
  const ring = G.hullOf([...circle(px, pz, 31, 32), ...circle(0, wz, 14.5, 24)]);
  const F = crankF;
  const p = (x, z, y = 11) => at([x, y, z]);
  const pocket = [[px + ux * 36 + nx * 9, pz + uz * 36 + nz * 9], [-ux * 19 + nx * 5, wz - uz * 19 + nz * 5], [-ux * 19 - nx * 5, wz - uz * 19 - nz * 5], [px + ux * 36 - nx * 9, pz + uz * 36 - nz * 9]];
  const split = [px + nx * 31.2 - ux * 2, pz + nz * 31.2 - uz * 2], split2 = [px - nx * 31.2 - ux * 2, pz - nz * 31.2 - uz * 2];
  const inner = L("M" + pocket.map(([x, z]) => p(x, z).join(" ")).join("L") + "Z", { tone: "lo" })
    + L("M" + p(split[0], split[1]).join(" ") + "L" + p(split2[0], split2[1]).join(" "), { tone: "mid" })
    + dotsSvg([p(px + nx * 23 - ux * 10, pz + nz * 23 - uz * 10), p(px - nx * 23 - ux * 10, pz - nz * 23 - uz * 10)], { size: 1, tone: "mid" })
    + L(G.circleOf(FY([0, 0, wz]), 11, 3, P), { tone: "faint" });
  return S(G.prismOf(F, ring, -11, 11, P), { tone: "hi", inner });
}
function cam(w, theta) {
  const [cx, cz] = M.camCentre(w);
  const F = FY([cx, 0, cz]);
  const turn = rad(theta / 2);
  const ring = M.lobe(w).map((q) => M.rot(q, turn));
  const markA = Math.atan2(...M.rot([0, 9], turn).reverse());
  return [
    S(G.disc(-34, -9, 12, F, P), { tone: "mid" }),
    S(G.prismOf(F, ring, -9, 9, P), { tone: "hi" }),
    S(G.disc(9, 14, 12, F, P), { tone: "mid", inner: dotsSvg([at(G.pointOf(F, 14, 8, markA))], { size: 0.9, tone: "hi" }) }),
  ].join("");
}
function helix(w, lift) {
  const F = G.frameOf([SEAT[w][0], 0, SEAT[w][1]], [AX[w][0], 0, AX[w][1]], [AX[w][1], 0, -AX[w][0]], [0, 1, 0]);
  const s0 = WELL.s0 + 1.6, s1 = 64 - lift, turns = 6.5, n = 260, r = 10.2;
  const V = G.viewOf(P);
  let back = "", front = "", last = null, run = [];
  const flush = () => { if (run.length > 1) { const d = "M" + run.map((q) => q.map((v) => v.toFixed(1)).join(" ")).join("L"); if (last) front += d; else back += d; } run = []; };
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * Math.PI * 2;
    const p = G.pointOf(F, s0 + (s1 - s0) * t, r, a);
    const radial = [p[0] - (SEAT[w][0] + AX[w][0] * (s0 + (s1 - s0) * t)), p[1], p[2] - (SEAT[w][1] + AX[w][1] * (s0 + (s1 - s0) * t))];
    const facing = G.dot3(radial, V) > 0;
    if (last !== null && facing !== last) { const q = at(p); run.push(q); flush(); run.push(q); }
    else run.push(at(p));
    last = facing;
  }
  flush();
  const ends = [G.pointOf(F, s0, r, 0), G.pointOf(F, s1, r, turns * Math.PI * 2)].map(at);
  return { back, front, ends };
}
function glowPath(theta) {
  const crown = M.CROWN_TDC - M.pistonDrop(theta);
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = Math.PI + (i / 24) * Math.PI; const x = M.BORE_R * Math.cos(t), y = M.BORE_R * Math.sin(t); pts.push(at([x, y, crown]), at([x, y, M.roofAt(x)])); }
  pts.push(at([0, 0, M.ROOF_TOP]));
  return "M" + G.hullOf(pts.map(([x, y]) => [x, y])).map((q) => q.map((v) => v.toFixed(1)).join(" ")).join("L") + "Z";
}

const parts = {
  back: part("crank-back"), front: part("crank-front"), rod: part("rod"), piston: part("piston"), glow: part("glow"), spark: part("spark"), needle: part("needle"),
  flow: { in: part("flow-in"), ex: part("flow-ex") },
};
for (const w of ["in", "ex"]) Object.assign(parts, { ["valve-" + w]: part("valve-" + w), ["retainer-" + w]: part("retainer-" + w), ["tappet-" + w]: part("tappet-" + w), ["cam-" + w]: part("cam-" + w), ["sb-" + w]: part("spring-back-" + w), ["sf-" + w]: part("spring-front-" + w), ["se-" + w]: part("spring-ends-" + w) });
const grad = svg.querySelector("#ice-flame");
const sparkAt = at([${PLUG_X}, 0, M.ROOF_TOP - 3.4]);
grad.setAttribute("cx", sparkAt[0].toFixed(1)); grad.setAttribute("cy", sparkAt[1].toFixed(1));
let flame = 0;

function draw(theta, dt) {
  const t = M.wrap(theta);
  const c = crank(t);
  parts.back.innerHTML = c.back;
  parts.front.innerHTML = c.front;
  parts.rod.innerHTML = rod(t);
  parts.piston.setAttribute("transform", translateAlong(P, [0, 0, -M.pistonDrop(t)]));
  for (const w of ["in", "ex"]) {
    const l = M.lift(w, t);
    const move = translateAlong(P, [-AX[w][0] * l, 0, -AX[w][1] * l]);
    for (const n of ["valve-", "retainer-", "tappet-"]) parts[n + w].setAttribute("transform", move);
    const h = helix(w, l);
    parts["sb-" + w].setAttribute("d", h.back);
    parts["sf-" + w].setAttribute("d", h.front);
    parts["se-" + w].innerHTML = dotsSvg(h.ends, { size: 0.9, tone: "mid" });
    parts["cam-" + w].innerHTML = cam(w, t);
    parts.flow[w].setAttribute("opacity", Math.min(1, l / 3).toFixed(2));
  }
  const want = Math.min(1, M.burnRate(t) * 0.9 + M.burned(t) * (t < 540 ? Math.max(0, 1 - (t - 360) / 130) : 0) * 0.55);
  flame = dt ? flame + (want - flame) * (1 - Math.exp(-dt / 0.05)) : want;
  parts.glow.setAttribute("d", glowPath(t));
  parts.glow.setAttribute("opacity", flame.toFixed(3));
  const s = t - M.ENGINE.spark;
  const spark = s > -1 && s < 14 ? Math.max(0, Math.min(1, (s + 1) / 1.5)) * Math.exp(-Math.max(0, s) / 4) : 0;
  parts.spark.setAttribute("opacity", spark.toFixed(3));
  const bar = M.pressure(t);
  parts.needle.setAttribute("d", needleAt(bar));
  const stroke = M.strokeOf(t);
  const text = (stroke + 1) + " · " + M.STROKES[stroke] + " · " + String(Math.round(t)).padStart(3, "\\u2007") + "° · " + bar.toFixed(1).replace(".", ",") + " бар";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(t)));
  stage.setAttribute("aria-valuetext", text);
}

const RATE = 720 / 9;
let theta = 0, target = 0, touring = !still.matches, frame = 0, last = 0, visible = false, idle = 0;
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
  last = now;
  if (touring) { theta += RATE * dt; target = theta; }
  else { const gap = target - theta; theta = Math.abs(gap) < 0.05 ? target : theta + gap * (1 - Math.exp(-dt / 0.22)); }
  draw(theta, dt);
  const settled = !touring && theta === target && flame < 0.002;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (next) => { touring = false; target = next; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; run(); }, 3600); run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (event) => {
  const box = svg.getBoundingClientRect();
  const share = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  const base = Math.floor(theta / 720) * 720;
  let next = base + share * 720;
  if (next - theta > 360) next -= 720; else if (theta - next > 360) next += 720;
  steer(next);
});
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === "ArrowRight" || event.key === "ArrowUp") to = target + 15;
  if (event.key === "ArrowLeft" || event.key === "ArrowDown") to = target - 15;
  if (event.key === "PageUp") to = Math.floor(target / 180 + 1) * 180;
  if (event.key === "PageDown") to = Math.ceil(target / 180 - 1) * 180;
  if (event.key === "Home") to = Math.floor(target / 720) * 720;
  if (event.key === " ") { event.preventDefault(); touring = !touring; if (touring) target = theta; run(); return; }
  if (to === null) return;
  event.preventDefault();
  steer(to);
});
window.__engine = { set(t, dt = 0) { touring = false; clearTimeout(idle); theta = target = t; draw(t, dt); } };
if (still.matches) { theta = target = 372; }
draw(theta, 0);
})();
`;

const T = M.TIMES;
const fmt = (deg, ref) => deg;
const ivo = 720 - T.in.open, ivc = T.in.close - 180, evo = 540 - T.ex.open, evc = T.ex.close;
const CSS = `
.iso{--ice-cut:#2b2b2b;--ice-hole:#060606}
.iso[data-theme="light"]{--ice-cut:#ffffff;--ice-hole:#d9d9d5}
.ice-cut{fill:var(--ice-cut);stroke:var(--ice-cut);stroke-width:.4}
.ice-hole{fill:var(--ice-hole)}
.ice-gasket .ice-cut{fill:var(--anatomy-shade-1);stroke:none}
.ice-oil .iso-top{fill:var(--anatomy-shade-1)}
.ice-coil{stroke-width:1.5}
.ice-coil{stroke-width:1.3}
.ice-flow{stroke-width:1.1}
.ice-glow{mix-blend-mode:screen}
.ice-flame-core{stop-color:#fff1c2;stop-opacity:1}
.ice-flame-mid{stop-color:#ff8a2a;stop-opacity:.85}
.ice-flame-edge{stop-color:#ff4d00;stop-opacity:.25}
.ice-spark{fill:#ffffff}
.ice-spark-halo{fill:#9ec2ff;opacity:.5;filter:blur(2.5px)}
.iso[data-theme="light"] .ice-glow{mix-blend-mode:multiply}
.iso[data-theme="light"] .ice-flame-core{stop-color:#ffcf5a;stop-opacity:.9}
.iso[data-theme="light"] .ice-flame-mid{stop-color:#ff7a1a;stop-opacity:.75}
.iso[data-theme="light"] .ice-flame-edge{stop-color:#e8480c;stop-opacity:.35}
.iso[data-theme="light"] .ice-spark{fill:#2f6bff}
.iso[data-theme="light"] .ice-spark-halo{fill:#2f6bff;opacity:.35}
.iso-stage{outline:none}
`;

const body = k.plateHtml({
  fig: "Рис. 1",
  title: "Четырёхтактный ДВС",
  hint: "Курсор крутит вал · ← → · пробел",
  readout: "1 · Впуск ·   0° · 1,1 бар",
  keys: [
    { mark: "lit", label: "Поршень: ход 86 мм вниз и вверх за каждый оборот" },
    { mark: "raised", label: "Распредвалы: пол-оборота на два оборота коленвала" },
    { mark: "dim", label: "Разрез корпуса: блок, головка, крышка, картер" },
  ],
  caption: `Один цилиндр 86 × 86 мм, 500 см³, степень сжатия ${M.RATIO.toFixed(1).replace(".", ",")}. Четыре такта на два оборота коленвала: впуск, сжатие, рабочий ход, выпуск. Впускной клапан открывается за ${ivo}° до ВМТ и закрывается через ${ivc}° после НМТ, выпускной — за ${evo}° до НМТ и через ${evc}° после ВМТ. Искра за ${360 - M.ENGINE.spark}° до ВМТ сжатия; манометр показывает модельное давление в цилиндре, пик около ${Math.round(Math.max(...Array.from({ length: 720 }, (_, d) => M.pressure(d))))} бар.`,
  body: `<div class="iso-stage" tabindex="0" role="slider" aria-label="Двигатель: стрелки поворачивают коленвал на 15°, пробел — пауза" aria-valuemin="0" aria-valuemax="720" aria-valuenow="0">${svg}</div>`,
});

const html = k.pageHtml({ title: "Четырёхтактный ДВС", theme, body, script: kitScript() + live, width: 660 }).replace("</style>", CSS + "</style>").replace('lang="en"', 'lang="ru"');
const name = theme === "light" ? "engine-light.html" : "engine.html";
writeFileSync(join(HERE, name), html);
console.log("wrote", name, (html.length / 1024).toFixed(0) + " KB");
