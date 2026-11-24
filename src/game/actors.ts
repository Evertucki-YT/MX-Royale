import * as THREE from "three";

const matCache = new Map<number, THREE.MeshLambertMaterial>();
export function lam(color: number) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    matCache.set(color, m);
  }
  return m;
}
const basicCache = new Map<number, THREE.MeshBasicMaterial>();
export function basic(color: number, opacity = 1) {
  const k = color * 100 + Math.round(opacity * 10);
  let m = basicCache.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    basicCache.set(k, m);
  }
  return m;
}

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function bm(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo, lam(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

export interface Rig {
  group: THREE.Group;
  body: THREE.Group;
  head: THREE.Mesh;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  gunHolder: THREE.Group;
  glider: THREE.Group;
  label: THREE.Sprite;
  gunKind: string;
}

export function makeLabel(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "bold 34px Arial, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 7;
  g.strokeStyle = "rgba(0,0,0,0.9)";
  g.strokeText(text, 128, 32);
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(2.6, 0.65, 1);
  s.position.y = 2.55;
  return s;
}

export function makeRig(shirt: number, pants: number, skin: number, name: string, labelColor: string): Rig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const torso = bm(0.7, 0.7, 0.4, shirt, 0, 1.05, 0);
  body.add(torso);
  const head = bm(0.42, 0.42, 0.42, skin, 0, 1.6, 0);
  head.add(bm(0.09, 0.09, 0.02, 0x111111, -0.1, 0.04, -0.51));
  head.add(bm(0.09, 0.09, 0.02, 0x111111, 0.1, 0.04, -0.51));
  head.add(bm(0.2, 0.04, 0.02, 0x7a2a1a, 0, -0.1, -0.51));
  body.add(head);
  // gorra / sombrero
  const hat = bm(0.5, 0.12, 0.5, shirt === 0xffffff ? 0xcc0000 : 0xffffff, 0, 1.86, 0);
  body.add(hat);
  const mkLimb = (w: number, h: number, color: number, px: number, py: number) => {
    const g = new THREE.Group();
    g.position.set(px, py, 0);
    g.add(bm(w, h, w, color, 0, -h / 2, 0));
    body.add(g);
    return g;
  };
  const armL = mkLimb(0.26, 0.68, skin, -0.49, 1.38);
  const armR = mkLimb(0.26, 0.68, skin, 0.49, 1.38);
  const legL = mkLimb(0.3, 0.7, pants, -0.19, 0.7);
  const legR = mkLimb(0.3, 0.7, pants, 0.19, 0.7);
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.38, 1.05, -0.5);
  body.add(gunHolder);
  const glider = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: shirt, side: THREE.DoubleSide }));
  dome.scale.set(1.3, 0.55, 1.1);
  glider.add(dome);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.72, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, wireframe: true }));
  stripe.scale.set(1.3, 0.55, 1.1);
  glider.add(stripe);
  for (const sx of [-1, 1]) {
    const l = bm(0.03, 1.2, 0.03, 0x222222, sx * 0.9, -0.5, 0);
    l.rotation.z = sx * 0.55;
    glider.add(l);
  }
  glider.position.y = 2.9;
  glider.visible = false;
  group.add(glider);
  const label = makeLabel(name, labelColor);
  group.add(label);
  return { group, body, head, armL, armR, legL, legR, gunHolder, glider, label, gunKind: "" };
}

/** arma apuntando hacia -Z */
export function makeGun(kind: string, rarityColor: number): THREE.Group {
  const g = new THREE.Group();
  const dark = 0x2b2b2b;
  const add = (w: number, h: number, d: number, c: number, x: number, y: number, z: number) => g.add(bm(w, h, d, c, x, y, z));
  switch (kind) {
    case "pistol":
      add(0.08, 0.14, 0.3, dark, 0, 0, 0);
      add(0.08, 0.2, 0.1, 0x3a3a3a, 0, -0.14, 0.08);
      break;
    case "shotgun":
      add(0.1, 0.12, 0.8, 0x6b4423, 0, 0, 0.05);
      add(0.07, 0.07, 0.7, dark, 0, 0.06, -0.3);
      break;
    case "smg":
      add(0.1, 0.16, 0.45, dark, 0, 0, 0);
      add(0.07, 0.3, 0.09, 0x3a3a3a, 0, -0.2, 0.05);
      add(0.05, 0.05, 0.25, 0x555555, 0, 0.02, -0.33);
      break;
    case "sniper":
      add(0.09, 0.14, 1.1, 0x23402d, 0, 0, 0.1);
      add(0.05, 0.05, 0.7, dark, 0, 0.02, -0.7);
      add(0.07, 0.09, 0.3, 0x111111, 0, 0.14, 0);
      break;
    default:
      add(0.1, 0.17, 0.75, dark, 0, 0, 0.05);
      add(0.05, 0.05, 0.4, 0x444444, 0, 0.03, -0.55);
      add(0.07, 0.28, 0.1, 0x3a3a3a, 0, -0.2, 0.15);
  }
  // franja de rareza
  g.add(bm(0.11, 0.05, 0.25, rarityColor, 0, 0.1, 0.1));
  return g;
}

export function setRigGun(rig: Rig, kind: string | null, rarityColor: number) {
  const key = kind ? kind + rarityColor : "";
  if (rig.gunKind === key) return;
  rig.gunKind = key;
  while (rig.gunHolder.children.length) rig.gunHolder.remove(rig.gunHolder.children[0]);
  if (kind) rig.gunHolder.add(makeGun(kind, rarityColor));
}
