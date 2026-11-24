import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  s?: number;
  mesh?: THREE.Mesh;
}

export interface ChestSpot {
  x: number;
  y: number;
  z: number;
}

export const ISLAND_R = 135;

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const ROADS = [
  [-92, 0, 0, 0],
  [0, -95, 0, 92],
];
function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax,
    dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
export function roadDist(x: number, z: number) {
  let m = 1e9;
  for (const r of ROADS) m = Math.min(m, segDist(x, z, r[0], r[1], r[2], r[3]));
  return m;
}

export function heightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  let h = Math.sin(x * 0.045 + 1) * Math.cos(z * 0.05) * 2.2 + Math.sin(x * 0.11 + z * 0.07) * 0.8 + 1.5;
  h += 9 * Math.exp(-((x - 85) ** 2 + (z - 35) ** 2) / 700);
  h += 6 * Math.exp(-((x - 100) ** 2 + (z + 40) ** 2) / 500);
  h += 5 * Math.exp(-((x - 55) ** 2 + (z - 70) ** 2) / 400);
  h += 5 * Math.exp(-((x + 60) ** 2 + (z + 75) ** 2) / 500);
  let w = 1;
  w = Math.min(w, sm(30, 52, d));
  w = Math.min(w, sm(34, 56, Math.hypot(x + 92, z)));
  w = Math.min(w, sm(34, 56, Math.hypot(x, z - 92)));
  w = Math.min(w, sm(30, 52, Math.hypot(x, z + 95)));
  w = Math.min(w, sm(5, 16, roadDist(x, z)));
  h *= w;
  h += 5.5 * (1 - sm(32, 56, Math.hypot(x, z + 95)));
  h -= 3.2 * (1 - sm(3.5, 8.5, Math.abs(x + 48)));
  h -= 9 * sm(ISLAND_R - 28, ISLAND_R + 2, d);
  return h;
}

export const SEA_Y = -1.0;

function labelCanvas(text: string, fg: string, bg: string | null, w = 512, h = 128, font = 72) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.font = `900 ${font}px Arial Black, Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 10;
  g.strokeStyle = "rgba(0,0,0,0.85)";
  if (!bg) g.strokeText(text, w / 2, h / 2);
  g.fillStyle = fg;
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Builder {
  geos: THREE.BufferGeometry[] = [];
  lit: THREE.BufferGeometry[] = [];
  boxes: Box[] = [];
  chests: ChestSpot[] = [];

  add(g: THREE.BufferGeometry, color: string | number, lit = false) {
    const col = new THREE.Color(color as THREE.ColorRepresentation);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    (lit ? this.lit : this.geos).push(g);
  }
  /** caja por límites absolutos */
  bx(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: string | number, collide = true, lit = false) {
    if (x1 - x0 <= 0 || y1 - y0 <= 0 || z1 - z0 <= 0) return;
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.add(g, color, lit);
    if (collide) this.boxes.push({ x0, x1, y0, y1, z0, z1 });
  }
  /** caja por centro y base */
  box(cx: number, by: number, cz: number, w: number, h: number, d: number, color: string | number, collide = true, lit = false) {
    this.bx(cx - w / 2, cx + w / 2, by, by + h, cz - d / 2, cz + d / 2, color, collide, lit);
  }
  cyl(cx: number, by: number, cz: number, r: number, h: number, color: string | number, collide = true, lit = false, seg = 12) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(cx, by + h / 2, cz);
    this.add(g, color, lit);
    if (collide) this.boxes.push({ x0: cx - r, x1: cx + r, y0: by, y1: by + h, z0: cz - r, z1: cz + r });
  }
  cone(cx: number, by: number, cz: number, r: number, h: number, color: string | number, seg = 8) {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.translate(cx, by + h / 2, cz);
    this.add(g, color);
  }
  sph(cx: number, cy: number, cz: number, r: number, color: string | number, lit = false) {
    const g = new THREE.SphereGeometry(r, 8, 6);
    g.translate(cx, cy, cz);
    this.add(g, color, lit);
  }
  /** escalera: (x,z) es el contacto superior con la pared; se extiende hacia `dir` */
  stairs(x: number, z: number, dir: "n" | "s" | "e" | "w", width: number, baseY: number, topY: number, color: string | number, rise = 0.5, run = 0.8) {
    const n = Math.ceil((topY - baseY) / rise);
    const r = (topY - baseY) / n;
    for (let i = 0; i < n; i++) {
      const top = topY - i * r;
      const a = i * run,
        b = (i + 1) * run;
      const y0 = baseY - 0.6;
      if (dir === "e") this.bx(x + a, x + b, y0, top, z - width / 2, z + width / 2, color);
      if (dir === "w") this.bx(x - b, x - a, y0, top, z - width / 2, z + width / 2, color);
      if (dir === "s") this.bx(x - width / 2, x + width / 2, y0, top, z + a, z + b, color);
      if (dir === "n") this.bx(x - width / 2, x + width / 2, y0, top, z - b, z - a, color);
    }
    return n * run;
  }

  /** Edificio hueco con puerta, ventanas, techo, parapeto y escalera al techo */
  building(
    cx: number,
    cz: number,
    w: number,
    d: number,
    h: number,
    color: string,
    door: "n" | "s" | "e" | "w",
    o: { dw?: number; win?: boolean; roof?: string; stair?: "n" | "s" | "e" | "w" | null; trim?: string; floor?: string; tinaco?: boolean; chestRoof?: boolean; chestIn?: boolean } = {}
  ) {
    const t = 0.4;
    const by = heightAt(cx, cz);
    const dw = o.dw ?? 2.4;
    const x0 = cx - w / 2,
      x1 = cx + w / 2,
      z0 = cz - d / 2,
      z1 = cz + d / 2;
    const sides: Record<string, [number, number, number, number, boolean]> = {
      n: [x0, x1, z0, z0 + t, true],
      s: [x0, x1, z1 - t, z1, true],
      w: [x0, x0 + t, z0, z1, false],
      e: [x1 - t, x1, z0, z1, false],
    };
    const bot = by - 0.5;
    for (const k of ["n", "s", "e", "w"]) {
      const [ax0, ax1, az0, az1, alongX] = sides[k];
      const isDoor = k === door;
      const hasWin = !isDoor && o.win !== false;
      if (!isDoor && !hasWin) {
        this.bx(ax0, ax1, bot, by + h, az0, az1, color);
        continue;
      }
      const ow = isDoor ? dw : 1.8;
      const oy0 = isDoor ? by : by + 1.0;
      const oy1 = isDoor ? by + 2.8 : by + 2.3;
      const a0 = alongX ? ax0 : az0,
        a1 = alongX ? ax1 : az1;
      const m = (a0 + a1) / 2;
      const segc = (s0: number, s1: number, y0: number, y1: number) => {
        if (alongX) this.bx(s0, s1, y0, y1, az0, az1, color);
        else this.bx(ax0, ax1, y0, y1, s0, s1, color);
      };
      segc(a0, m - ow / 2, bot, by + h);
      segc(m + ow / 2, a1, bot, by + h);
      segc(m - ow / 2, m + ow / 2, oy1, by + h);
      if (!isDoor) segc(m - ow / 2, m + ow / 2, bot, oy0);
    }
    // piso y techo
    this.bx(x0 + t, x1 - t, by - 0.3, by + 0.08, z0 + t, z1 - t, o.floor ?? "#d9cfc0");
    this.bx(x0, x1, by + h, by + h + 0.3, z0, z1, o.roof ?? "#8b5e3c");
    // franja decorativa
    if (o.trim) {
      this.bx(x0 - 0.05, x1 + 0.05, by + h - 0.7, by + h, z0 - 0.05, z1 + 0.05, o.trim, false);
    }
    // parapeto
    const pt = 0.3,
      ph = 0.8,
      ry = by + h + 0.3;
    const gap = o.stair ? 3.6 : 0;
    const par = (k: string) => {
      const alongX = k === "n" || k === "s";
      const zc = k === "n" ? z0 + pt / 2 : z1 - pt / 2;
      const xc = k === "w" ? x0 + pt / 2 : x1 - pt / 2;
      const hasGap = o.stair === k;
      if (alongX) {
        if (!hasGap) this.bx(x0, x1, ry, ry + ph, zc - pt / 2, zc + pt / 2, color);
        else {
          const m = cx;
          this.bx(x0, m - gap / 2, ry, ry + ph, zc - pt / 2, zc + pt / 2, color);
          this.bx(m + gap / 2, x1, ry, ry + ph, zc - pt / 2, zc + pt / 2, color);
        }
      } else {
        if (!hasGap) this.bx(xc - pt / 2, xc + pt / 2, ry, ry + ph, z0, z1, color);
        else {
          const m = cz;
          this.bx(xc - pt / 2, xc + pt / 2, ry, ry + ph, z0, m - gap / 2, color);
          this.bx(xc - pt / 2, xc + pt / 2, ry, ry + ph, m + gap / 2, z1, color);
        }
      }
    };
    ["n", "s", "e", "w"].forEach(par);
    if (o.stair) {
      const st = o.stair;
      const px = st === "e" ? x1 : st === "w" ? x0 : cx;
      const pz = st === "s" ? z1 : st === "n" ? z0 : cz;
      this.stairs(px, pz, st, 3, by, by + h + 0.3, "#9a8f84");
    }
    if (o.tinaco) {
      const tx = x0 + 1.4,
        tz = z0 + 1.4;
      this.box(tx, ry, tz, 1.2, 0.5, 1.2, "#777777");
      this.cyl(tx, ry + 0.5, tz, 0.8, 1.5, "#1d4ed8", true, false, 14);
      this.cone(tx, ry + 2.0, tz, 0.8, 0.4, "#0f172a", 14);
    }
    if (o.chestRoof) this.chests.push({ x: cx + w / 4, y: ry, z: cz + d / 4 });
    if (o.chestIn) this.chests.push({ x: cx, y: by + 0.08, z: cz });
    return by + h + 0.3;
  }

  car(cx: number, cz: number, color: string, alongX: boolean) {
    const by = heightAt(cx, cz);
    const L = 4.2,
      W = 1.9;
    const bw = alongX ? L : W,
      bd = alongX ? W : L;
    this.box(cx, by + 0.35, cz, bw, 0.8, bd, color);
    this.box(cx - (alongX ? 0.2 : 0), by + 1.15, cz - (alongX ? 0 : 0.2), alongX ? 2.2 : 1.7, 0.7, alongX ? 1.7 : 2.2, color, true);
    this.box(cx, by + 1.2, cz, alongX ? 2.25 : 1.75, 0.45, alongX ? 1.75 : 2.25, "#9bd3ff", false, true);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const wx = cx + (alongX ? sx * 1.3 : sz * 0.95);
        const wz = cz + (alongX ? sz * 0.95 : sx * 1.3);
        this.box(wx, by, wz, alongX ? 0.8 : 0.3, 0.7, alongX ? 0.3 : 0.8, "#111111", false);
      }
  }

  lamp(x: number, z: number) {
    const by = heightAt(x, z);
    this.cyl(x, by, z, 0.12, 5, "#333333", false, false, 6);
    this.sph(x, by + 5.1, z, 0.35, "#ffe9a0", true);
  }
  tree(x: number, z: number, s: number) {
    const by = heightAt(x, z);
    this.cyl(x, by, z, 0.25 * s, 2 * s, "#6b4423", false, false, 6);
    this.cone(x, by + 1.6 * s, z, 1.7 * s, 3 * s, "#2f8f46", 7);
    this.cone(x, by + 3.2 * s, z, 1.3 * s, 2.4 * s, "#3aa655", 7);
  }
}

export class World {
  group = new THREE.Group();
  boxes: Box[] = [];
  chests: ChestSpot[] = [];
  grid = new Map<number, Box[]>();
  stamp = 1;
  CS = 12;
  heightAt = heightAt;
  seaMesh!: THREE.Mesh;

  private key(ix: number, iz: number) {
    return (ix + 100) * 1000 + (iz + 100);
  }
  register(b: Box) {
    this.boxes.push(b);
    const CS = this.CS;
    for (let ix = Math.floor(b.x0 / CS); ix <= Math.floor(b.x1 / CS); ix++)
      for (let iz = Math.floor(b.z0 / CS); iz <= Math.floor(b.z1 / CS); iz++) {
        const k = this.key(ix, iz);
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(b);
      }
  }
  unregister(b: Box) {
    const CS = this.CS;
    const i = this.boxes.indexOf(b);
    if (i >= 0) this.boxes.splice(i, 1);
    for (let ix = Math.floor(b.x0 / CS); ix <= Math.floor(b.x1 / CS); ix++)
      for (let iz = Math.floor(b.z0 / CS); iz <= Math.floor(b.z1 / CS); iz++) {
        const a = this.grid.get(this.key(ix, iz));
        if (a) {
          const j = a.indexOf(b);
          if (j >= 0) a.splice(j, 1);
        }
      }
  }
  /** ¿colisiona un cilindro/AABB del actor? devuelve la caja con mayor techo */
  hit(x: number, y: number, z: number, r: number, h: number): Box | null {
    const CS = this.CS;
    let best: Box | null = null;
    for (let ix = Math.floor((x - r) / CS); ix <= Math.floor((x + r) / CS); ix++)
      for (let iz = Math.floor((z - r) / CS); iz <= Math.floor((z + r) / CS); iz++) {
        const a = this.grid.get(this.key(ix, iz));
        if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const b = a[i];
          if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && y + h > b.y0 && y < b.y1) {
            if (!best || b.y1 > best.y1) best = b;
          }
        }
      }
    return best;
  }
  /** rayo contra cajas: devuelve distancia más cercana o -1 */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
    this.stamp++;
    const st = this.stamp;
    let best = max + 1;
    const CS = this.CS;
    const steps = Math.ceil(max / (CS * 0.5));
    for (let s = 0; s <= steps; s++) {
      const t = Math.min(max, s * CS * 0.5);
      const px = ox + dx * t,
        pz = oz + dz * t;
      const cx = Math.floor(px / CS),
        cz = Math.floor(pz / CS);
      for (let ix = cx - 0; ix <= cx; ix++)
        for (let iz = cz - 0; iz <= cz; iz++) {
          const a = this.grid.get(this.key(ix, iz));
          if (!a) continue;
          for (let i = 0; i < a.length; i++) {
            const b = a[i];
            if (b.s === st) continue;
            b.s = st;
            const tt = rayBox(ox, oy, oz, dx, dy, dz, b);
            if (tt >= 0 && tt < best) best = tt;
          }
        }
      if (best <= t) break;
    }
    return best > max ? -1 : best;
  }
}

export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): number {
  let tmin = 0,
    tmax = 1e9;
  const o = [ox, oy, oz],
    d = [dx, dy, dz];
  const lo = [b.x0, b.y0, b.z0],
    hi = [b.x1, b.y1, b.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < lo[i] || o[i] > hi[i]) return -1;
    } else {
      let t1 = (lo[i] - o[i]) / d[i],
        t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

export function buildWorld(): World {
  const world = new World();
  const B = new Builder();
  const g = world.group;

  // ---------- TERRENO ----------
  const SZ = (ISLAND_R + 15) * 2;
  const SEG = 170;
  const tg = new THREE.PlaneGeometry(SZ, SZ, SEG, SEG);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const rnd = mulberry32(7);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = rnd() * 0.06;
    const rd = roadDist(x, z);
    const d = Math.hypot(x, z);
    const dPyr = Math.hypot(x, z + 95);
    const dRef = Math.hypot(x + 92, z);
    const dBar = Math.hypot(x, z - 92);
    if (h < -0.4) c.set("#c2b280");
    else if (h < 0.35 && d > 100) c.set("#e8d9a0");
    else if (rd < 4.5 && Math.abs(x + 48) > 0 && h > -0.4) c.set(rd < 0.25 ? "#d4b82a" : "#4a4a52");
    else if (rd < 5.8) c.set("#9a9a9a");
    else if (d < 25) c.set("#55555c");
    else if (dRef < 32) c.set("#8b8b84");
    else if (dPyr < 34) c.set("#d9c28a");
    else if (dBar < 33) c.set(x > 24 && x < 48 && z > 96 && z < 112 ? "#2f9e44" : "#c9a37a");
    else c.set(h > 6 ? "#5a9a4c" : "#58b04a");
    c.offsetHSL(0, 0, n - 0.03);
    cols[i * 3] = c.r;
    cols[i * 3 + 1] = c.g;
    cols[i * 3 + 2] = c.b;
  }
  tg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true }));
  g.add(terrain);

  // mar
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshPhongMaterial({ color: 0x1aa7d8, transparent: true, opacity: 0.82, shininess: 90 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  g.add(sea);
  world.seaMesh = sea;
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: 0x0b5f86 }));
  deep.rotation.x = -Math.PI / 2;
  deep.position.y = -6;
  g.add(deep);

  // líneas amarillas de la carretera
  for (let x = -90; x < -4; x += 6) if (Math.abs(x + 48) > 12) B.box(x, 0.03, 0, 2.5, 0.03, 0.25, "#f4d03f", false);
  for (let z = -90; z < 90; z += 6) {
    if (Math.abs(z) < 5) continue;
    B.box(0, heightAt(0, z) + 0.05, z, 0.25, 0.03, 2.5, "#f4d03f", false);
  }

  // ---------- PUENTE ----------
  B.bx(-58, -38, -0.5, 0, -4.8, 4.8, "#8d8d96");
  B.bx(-58, -38, 0, 1.0, -4.9, -4.5, "#b0b0ba");
  B.bx(-58, -38, 0, 1.0, 4.5, 4.9, "#b0b0ba");
  for (const px of [-55, -48, -41]) for (const pz of [-3.5, 3.5]) B.cyl(px, -3.5, pz, 0.7, 3.2, "#777780", false);
  B.lamp(-57, 5.4);
  B.lamp(-39, -5.4);
  B.lamp(-39, 5.4);
  B.lamp(-57, -5.4);

  // ---------- PLAZA EL OXXO (0,0) ----------
  // estacionamiento (rayas)
  for (let i = -4; i <= 4; i++) B.box(i * 4.2, 0.03, 13, 0.18, 0.03, 5, "#ffffff", false);
  for (let i = -4; i <= 4; i++) B.box(i * 4.2, 0.03, -3.6 + 0, 0.18, 0.03, 0.01, "#ffffff", false);
  // tienda OXXO
  B.building(0, -16, 24, 12, 5, "#f4f4f4", "s", { dw: 6, win: true, roof: "#d9121f", stair: "e", trim: "#e30613", floor: "#f0f0f0", chestRoof: true });
  B.bx(-12.1, 12.1, 3.4, 5.0, -10.1, -9.7, "#e30613", false);
  B.bx(-12.1, 12.1, 3.4, 3.7, -10.2, -9.6, "#ffd200", false);
  // interior iluminado
  B.box(-5, 4.6, -16, 8, 0.1, 1.2, "#ffffff", false, true);
  B.box(5, 4.6, -16, 8, 0.1, 1.2, "#ffffff", false, true);
  B.box(-6, 0.08, -20, 8, 2, 1, "#ffcc00");
  B.box(6, 0.08, -20, 8, 2, 1, "#e30613");
  B.box(-6, 0.08, -17, 6, 1.6, 1, "#ffcc00");
  B.box(6, 0.08, -17, 6, 1.6, 1, "#e30613");
  B.box(0, 0.08, -13.6, 5, 1.1, 1.2, "#555566");
  B.box(10.4, 0.08, -18, 1, 2.2, 3, "#7dd3fc", true, true);
  B.chests.push({ x: -9.5, y: 0.08, z: -13.2 });
  B.chests.push({ x: 0, y: 0.08, z: -21 });
  // puesto de tacos
  B.box(17, 0, 7, 5, 1.1, 2, "#c0392b");
  B.box(17, 1.1, 6.2, 5, 0.12, 0.8, "#f1f1f1", false);
  for (const sx of [-2.4, 2.4]) for (const sz of [-1, 1]) B.cyl(17 + sx, 0, 7 + sz * 1.0, 0.1, 3, "#444444", false, false, 6);
  B.box(17, 3.0, 7, 5.6, 0.2, 2.8, "#f4c20d", false);
  B.box(17, 3.2, 7, 5.6, 0.1, 1.4, "#c0392b", false);
  B.cyl(15.8, 1.22, 7, 0.38, 1.2, "#8b4a2b", false);
  B.cone(15.8, 2.42, 7, 0.3, 0.4, "#f1c40f");
  B.box(18.2, 1.22, 7, 1.0, 0.4, 0.8, "#d4a373", false);
  B.chests.push({ x: 17, y: 0, z: 4.6 });
  // autos
  const carCols = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#ecf0f1", "#9b59b6", "#e67e22", "#1abc9c"];
  [
    [-16, 13, true],
    [-8, 13, true],
    [8, 13, true],
    [-24, 8, false],
    [24, 14, true],
    [-30, -8, false],
    [30, -6, false],
    [-12, 22, true],
    [14, 24, true],
  ].forEach((a, i) => B.car(a[0] as number, a[1] as number, carCols[i % carCols.length], a[2] as boolean));
  B.chests.push({ x: -16, y: 0, z: 17 });
  B.chests.push({ x: 26, y: 0, z: 20 });
  // bandera mexicana
  B.cyl(-10, 0, 6, 0.15, 11, "#bbbbbb", true, false, 6);
  B.box(-9.0, 9, 6, 2, 0.8, 0.06, "#006847", false, true);
  B.box(-7.0, 9, 6, 2, 0.8, 0.06, "#f5f5f5", false, true);
  B.box(-5.0, 9, 6, 2, 0.8, 0.06, "#ce1126", false, true);
  [
    [-22, -22],
    [22, -22],
    [-22, 22],
    [22, 22],
    [0, 24],
    [0, -26],
  ].forEach((p) => B.lamp(p[0], p[1]));

  // ---------- REFINERÍA PEMEX (-92,0) ----------
  const refinery = () => {
    // marquesina y bombas
    for (const sx of [-7, 7]) for (const sz of [-4, 4]) B.cyl(-80 + sx, 0, 12 + sz, 0.45, 5, "#f2f2f2");
    B.box(-80, 5, 12, 17, 0.5, 10, "#007a3d", false);
    B.box(-80, 5.5, 12, 17, 0.12, 3, "#ffffff", false);
    B.box(-80, 4.85, 12, 17.2, 0.2, 10.2, "#d52b1e", false);
    for (const px of [-86, -82, -78, -74]) {
      B.box(px, 0, 12, 1.1, 1.8, 0.8, "#f2f2f2");
      B.box(px, 1.2, 12, 1.12, 0.5, 0.82, "#007a3d", false);
      B.box(px, 1.8, 12, 1.1, 0.2, 0.8, "#d52b1e", false);
    }
    B.box(-80, 5.1, 12, 14, 0.1, 0.1, "#ffffff", false, true);
    B.building(-80, 25, 14, 8, 3.8, "#f2f2f2", "n", { dw: 3, win: true, roof: "#007a3d", stair: "e", trim: "#007a3d", chestRoof: true, chestIn: true });
    B.chests.push({ x: -80, y: 0, z: 8 });
    // tanques gigantes
    const tank = (x: number, z: number, stairDir: "n" | "s" | "e" | "w", chest = true) => {
      B.cyl(x, 0, z, 6, 6, "#e8e8ec", true, false, 20);
      B.cyl(x, 2.6, z, 6.06, 0.9, "#d52b1e", false, false, 20);
      B.cyl(x, 6, z, 6.0, 0.25, "#9a9aa4", false, false, 20);
      B.bx(x - 6, x + 6, 6, 6.0, z - 6, z + 6, "#9a9aa4", false); // (no-op)
      const px = stairDir === "e" ? x + 6 : stairDir === "w" ? x - 6 : x;
      const pz = stairDir === "s" ? z + 6 : stairDir === "n" ? z - 6 : z;
      B.stairs(px, pz, stairDir, 2.6, 0, 6, "#6b6b73");
      if (chest) B.chests.push({ x: x + 1, y: 6.0, z: z + 1 });
    };
    tank(-104, -16, "w");
    tank(-86, -20, "s");
    tank(-106, 12, "w", true);
    // pasarelas altas
    const catwalk = (x0: number, x1: number, z: number) => {
      B.bx(x0, x1, 5.6, 6.0, z - 1.2, z + 1.2, "#555560");
      B.bx(x0, x1, 6.0, 6.9, z - 1.2, z - 1.05, "#d9a400");
      B.bx(x0, x1, 6.0, 6.9, z + 1.05, z + 1.2, "#d9a400");
    };
    catwalk(-98.5, -91.5, -19);
    catwalk(-80.5, -71.5, -22);
    // torre de vigilancia
    for (const sx of [-3.5, 3.5]) for (const sz of [-3.5, 3.5]) B.cyl(-68 + sx, 0, -22 + sz, 0.3, 6, "#c0392b", false, false, 6);
    B.bx(-72, -64, 5.6, 6.0, -26, -18, "#555560");
    B.bx(-72, -64, 6, 6.8, -26, -25.8, "#d9a400");
    B.bx(-72, -64, 6, 6.8, -18.2, -18, "#d9a400", true);
    B.bx(-64.2, -64, 6, 6.8, -26, -18, "#d9a400");
    B.stairs(-68, -18, "s", 3, 0, 5.6, "#6b6b73");
    B.chests.push({ x: -69, y: 6.0, z: -23 });
    // contenedores y cajas
    B.box(-98, 0, 32, 6, 2.6, 2.4, "#c0392b");
    B.box(-98, 0, 29, 6, 2.6, 2.4, "#2980b9");
    B.box(-90, 0, 33, 2.4, 2.6, 6, "#e67e22");
    B.box(-103.5, 0, 31, 2, 1.3, 2, "#a0522d");
    B.box(-106, 0, 28.5, 2, 1.3, 2, "#a0522d");
    B.chests.push({ x: -98, y: 2.6, z: 29 });
    B.chests.push({ x: -94, y: 0, z: 36 });
    B.chests.push({ x: -112, y: 0, z: -2 });
    // tuberías
    B.box(-96, 0, -4, 16, 1.2, 1.1, "#7f8c8d");
    B.box(-96, 1.3, -4, 16, 0.3, 0.3, "#d35400", false);
    B.box(-115, 0, 24, 1.1, 1.2, 12, "#7f8c8d");
    // chimenea
    B.cyl(-122, 0, -6, 2.4, 24, "#e8e8e8");
    B.cyl(-122, 6, -6, 2.45, 3, "#d52b1e", false);
    B.cyl(-122, 14, -6, 2.45, 3, "#d52b1e", false);
    [
      [-70, 8],
      [-116, -25],
      [-72, 38],
    ].forEach((p) => B.lamp(p[0], p[1]));
    B.car(-70, 14, "#2ecc71", false);
  };
  refinery();

  // ---------- COLONIA EL BARRIO (0,92) ----------
  const barrio = () => {
    const colors = ["#f97316", "#ec4899", "#22c55e", "#eab308", "#3b82f6", "#a855f7", "#14b8a6", "#ef4444"];
    const roofs = ["#7c2d12", "#831843", "#14532d", "#713f12", "#1e3a8a", "#581c87", "#134e4a", "#7f1d1d"];
    const hs: [number, number, "e" | "w", "e" | "w"][] = [
      [-12, 76, "e", "w"],
      [-12, 92, "e", "w"],
      [-12, 108, "e", "w"],
      [-30, 80, "e", "w"],
      [-30, 98, "e", "w"],
      [12, 76, "w", "e"],
      [12, 92, "w", "e"],
      [14, 108, "w", "e"],
    ];
    hs.forEach((a, i) => {
      B.building(a[0], a[1], 9, 9, 3.4 + (i % 3 === 0 ? 0.4 : 0), colors[i], a[2], {
        dw: 2.2,
        win: true,
        roof: roofs[i],
        stair: a[3],
        trim: colors[(i + 3) % 8],
        tinaco: true,
        chestRoof: true,
        chestIn: i % 2 === 0,
      });
    });
    // cancha de fútbol
    B.box(36, 0.02, 104, 22, 0.04, 14, "#2f9e44", false);
    B.box(36, 0.07, 104, 0.2, 0.03, 14, "#ffffff", false);
    B.box(36, 0.07, 104, 22, 0.03, 0.2, "#ffffff", false);
    B.cyl(36, 0.07, 104, 2.2, 0.03, "#ffffff", false, false, 16);
    B.cyl(36, 0.09, 104, 1.9, 0.03, "#2f9e44", false, false, 16);
    for (const sx of [-1, 1]) {
      const gx = 36 + sx * 11;
      B.cyl(gx, 0, 104 - 2.2, 0.1, 2.2, "#ffffff", true, false, 6);
      B.cyl(gx, 0, 104 + 2.2, 0.1, 2.2, "#ffffff", true, false, 6);
      B.box(gx, 2.2, 104, 0.2, 0.2, 4.6, "#ffffff", true);
      B.box(gx + sx * 0.6, 0, 104, 0.08, 2.2, 4.4, "#dddddd", false);
    }
    B.chests.push({ x: 36, y: 0.04, z: 104 });
    B.chests.push({ x: 24, y: 0, z: 90 });
    // banderines de papel picado
    const pc = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#ec4899"];
    for (let i = 0; i < 18; i++) B.box(-10 + i * 1.2, 5.6 - Math.sin((i / 17) * Math.PI) * -0.3, 84, 0.8, 0.8, 0.04, pc[i % 5], false);
    B.cyl(-11, 0, 84, 0.1, 6, "#444444", false, false, 6);
    B.cyl(11, 0, 84, 0.1, 6, "#444444", false, false, 6);
    B.car(-5, 84, "#3498db", false);
    B.car(6, 100, "#f1c40f", false);
    B.car(-22, 112, "#e74c3c", true);
    [
      [-5, 70],
      [5, 70],
      [-5, 114],
      [5, 114],
    ].forEach((p) => B.lamp(p[0], p[1]));
  };
  barrio();

  // ---------- PIRÁMIDE DEL SOL (0,-95) ----------
  const piramide = () => {
    const zc = -95;
    const by = heightAt(0, zc);
    const hsz = [16, 12, 8, 4];
    const cs = ["#c9b27c", "#bba46e", "#cdb886", "#b39b63"];
    hsz.forEach((hs, k) => B.bx(-hs, hs, by - 1, by + 2.5 * (k + 1), zc - hs, zc + hs, cs[k]));
    // franja decorativa
    hsz.forEach((hs, k) => B.bx(-hs - 0.05, hs + 0.05, by + 2.5 * (k + 1) - 0.4, by + 2.5 * (k + 1), zc - hs - 0.05, zc + hs + 0.05, "#8a7440", false));
    B.stairs(0, zc + 4, "s", 6, by, by + 10, "#d8c590");
    // pabellón de la cima
    const ty = by + 10;
    for (const sx of [-3, 3]) for (const sz of [-3, 3]) B.cyl(sx, ty, zc + sz, 0.5, 3.4, "#a89060");
    B.bx(-3.8, 3.8, ty + 3.4, ty + 4.0, zc - 3.8, zc + 3.8, "#8a7440");
    B.sph(0, ty + 0.9, zc, 0.35, "#ff7a00", true);
    B.chests.push({ x: 0, y: ty, z: zc - 1.5 });
    B.chests.push({ x: 0, y: by, z: zc + 20 + 2 });
    // templos pequeños
    for (const sx of [-1, 1]) {
      const tx = sx * 30,
        tz = -88;
      [8, 6, 4].forEach((hs, k) => B.bx(tx - hs, tx + hs, by - 1, by + 1.3 * (k + 1), tz - hs, tz + hs, cs[(k + 1) % 4]));
      B.chests.push({ x: tx, y: by + 3.9, z: tz });
      B.chests.push({ x: tx + sx * 10, y: by, z: tz + 6 });
    }
    // columnas / ruinas
    for (const sx of [-1, 1])
      for (const k of [0, 1, 2]) {
        B.cyl(sx * 12, by, -68 + k * 7 + 0, 0.9, 5 - k * 0.8, "#b8a373");
      }
    B.box(-20, by, -74, 7, 1.6, 1, "#a89060");
    B.box(20, by, -74, 7, 1.2, 1, "#a89060");
    B.box(-8, by, -110, 5, 2, 1, "#a89060");
    B.box(8, by, -110, 5, 1.4, 1, "#a89060");
    B.chests.push({ x: 18, y: by, z: -108 });
    B.chests.push({ x: -22, y: by, z: -108 });
    for (const [x, z] of [
      [-6, -74],
      [6, -74],
      [-16, -78],
      [16, -78],
    ]) {
      B.cyl(x, by, z, 0.12, 2, "#5a3a1e", false, false, 6);
      B.sph(x, by + 2.2, z, 0.3, "#ff7a00", true);
    }
  };
  piramide();

  // ---------- ZONAS SALVAJES ----------
  const r = mulberry32(99);
  const zones = [
    [0, 0, 36],
    [-92, 0, 42],
    [0, 92, 44],
    [0, -95, 44],
  ];
  const free = (x: number, z: number, pad = 0) => {
    for (const q of zones) if (Math.hypot(x - q[0], z - q[1]) < q[2] + pad) return false;
    if (roadDist(x, z) < 7) return false;
    if (Math.abs(x + 48) < 11) return false;
    if (heightAt(x, z) < 0.2) return false;
    return Math.hypot(x, z) < ISLAND_R - 12;
  };
  let nt = 0;
  for (let tries = 0; tries < 2000 && nt < 190; tries++) {
    const x = (r() * 2 - 1) * ISLAND_R,
      z = (r() * 2 - 1) * ISLAND_R;
    if (!free(x, z)) continue;
    B.tree(x, z, 0.8 + r() * 0.7);
    nt++;
  }
  let nr = 0;
  for (let tries = 0; tries < 800 && nr < 26; tries++) {
    const x = (r() * 2 - 1) * ISLAND_R,
      z = (r() * 2 - 1) * ISLAND_R;
    if (!free(x, z, 4)) continue;
    const s = 1.5 + r() * 2.5;
    B.box(x, heightAt(x, z) - 0.3, z, s * 1.6, s, s * 1.3, "#7b7f86");
    nr++;
  }
  // cofres salvajes
  let nc = 0;
  for (let tries = 0; tries < 800 && nc < 12; tries++) {
    const x = (r() * 2 - 1) * ISLAND_R,
      z = (r() * 2 - 1) * ISLAND_R;
    if (!free(x, z, 6)) continue;
    B.chests.push({ x, y: heightAt(x, z), z });
    nc++;
  }
  // cabañas en las colinas del este
  B.building(80, 20, 8, 8, 3.4, "#a0522d", "w", { dw: 2.2, roof: "#5d3a1a", stair: "e", chestRoof: true, chestIn: true });
  B.building(62, 62, 8, 8, 3.4, "#8b6b4a", "n", { dw: 2.2, roof: "#4a3220", stair: "e", chestRoof: true, chestIn: true });

  // ---------- MERGE ----------
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const solid = new THREE.Mesh(mergeGeometries(B.geos, false)!, mat);
  g.add(solid);
  const litMesh = new THREE.Mesh(mergeGeometries(B.lit, false)!, new THREE.MeshBasicMaterial({ vertexColors: true }));
  g.add(litMesh);
  B.boxes.forEach((b) => world.register(b));
  world.chests = B.chests;

  // letrero OXXO + etiquetas de zona
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.5), new THREE.MeshBasicMaterial({ map: labelCanvas("OXXO", "#ffd200", "#e30613", 512, 100, 80) }));
  sign.position.set(0, 4.2, -9.95);
  g.add(sign);
  const pemex = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.2), new THREE.MeshBasicMaterial({ map: labelCanvas("PEMEX", "#ffffff", "#007a3d", 512, 80, 64) }));
  pemex.position.set(-80, 5.1, 6.85);
  pemex.rotation.y = Math.PI;
  g.add(pemex);
  const zlabels: [string, number, number, number, string][] = [
    ["PLAZA EL OXXO", 0, 0, 36, "#ffd200"],
    ["REFINERÍA PEMEX", -92, 0, 40, "#34d399"],
    ["COLONIA EL BARRIO", 0, 92, 30, "#f472b6"],
    ["PIRÁMIDE DEL SOL", 0, -95, 46, "#fde047"],
  ];
  zlabels.forEach(([t, x, z, y, col]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelCanvas(t, col, null, 1024, 160, 90), depthWrite: false, transparent: true, fog: false }));
    sp.scale.set(52, 8.1, 1);
    sp.position.set(x, y, z);
    g.add(sp);
  });
  // letrero taquería
  const taq = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.7), new THREE.MeshBasicMaterial({ map: labelCanvas("TACOS AL PASTOR", "#ffffff", "#c0392b", 512, 90, 52) }));
  taq.position.set(17, 3.9, 8.45);
  g.add(taq);
  return world;
}
