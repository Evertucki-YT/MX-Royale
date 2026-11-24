import * as THREE from "three";
import { buildWorld, World, heightAt, ISLAND_R, SEA_Y, mulberry32, rayBox, roadDist } from "./map";
import type { Box } from "./map";
import { sound } from "./audio";
import { input } from "./input";
import { makeRig, setRigGun, makeGun, lam, basic } from "./actors";
import type { Rig } from "./actors";
import { WEAPONS, RARITY_COLORS, RARITY_MULT, ZONES } from "./types";
import type { HudState, Item, ItemKind, MatchConfig, RosterEntry, WeaponDef } from "./types";
import type { Msg } from "./net";

type AState = "wait" | "fall" | "glide" | "ground";
const R = 0.4,
  H = 1.8,
  G = 24,
  JUMP = 8.2,
  STEP = 0.65;
const GUNS: ItemKind[] = ["pistol", "ar", "shotgun", "smg", "sniper"];
const isGun = (k: ItemKind) => GUNS.includes(k);
const KIND_CODE: ItemKind[] = ["pistol", "ar", "shotgun", "smg", "sniper", "shield", "health"];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angDiff = (a: number, b: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

interface AI {
  zone: number;
  tx: number;
  tz: number;
  mode: "loot" | "roam" | "fight";
  chest: number;
  think: number;
  target: string | null;
  react: number;
  strafe: number;
  strafeT: number;
  lx: number;
  lz: number;
  stuckT: number;
  unstick: number;
  unstickDir: number;
  wx: number;
  wz: number;
  skip: Set<number>;
  looted: number;
  jumpT: number;
}

interface Actor {
  id: string;
  name: string;
  team: number;
  isBot: boolean;
  local: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  hp: number;
  shield: number;
  alive: boolean;
  state: AState;
  onGround: boolean;
  coyote: number;
  slots: (Item | null)[];
  sel: number;
  fireCd: number;
  reloadT: number;
  drinkT: number;
  rig: Rig;
  tx: number;
  ty: number;
  tz: number;
  tyaw: number;
  kills: number;
  slideT: number;
  walk: number;
  recoil: number;
  deadT: number;
  speed: number;
  ai?: AI;
  stormAcc: number;
  stormOut: number;
  lastHurtBy: string;
  wpX: number;
  wpZ: number;
  removed: boolean;
}

interface ChestState {
  x: number;
  y: number;
  z: number;
  open: boolean;
  group: THREE.Group;
  lid: THREE.Group;
  beam: THREE.Mesh;
}
interface Drop {
  id: string;
  item: Item;
  x: number;
  y: number;
  z: number;
  group: THREE.Group;
  t: number;
}
interface Struct {
  boxes: Box[];
  meshes: THREE.Mesh[];
  born: number;
}
interface Tracer {
  mesh: THREE.Mesh;
  life: number;
}
interface Puff {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vz: number;
}

const SHIRTS = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xff6fa5, 0x34495e, 0xd35400];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
export const BOT_NAMES = ["Chuy", "Paco", "Lupita", "Memo", "Chava", "Beto", "Nacho", "Rosa", "Toño", "Güero", "Pepe", "Mari", "Tlaloc", "Xochitl", "Chapo", "Neto", "Yaretzi", "Lalo", "Jimena", "Checo", "Diego", "Frida", "Zapata", "Mole", "Tamal"];

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  canvas: HTMLCanvasElement;
  onHud: (h: HudState) => void = () => {};
  onEvent: (e: "hit" | "kill" | "hurt") => void = () => {};
  minimap: HTMLCanvasElement | null = null;
  autoFire = true;
  mode: "menu" | "match" = "menu";
  cfg: MatchConfig | null = null;
  actors: Actor[] = [];
  byId = new Map<string, Actor>();
  me: Actor | null = null;
  chests: ChestState[] = [];
  drops: Drop[] = [];
  structs: Struct[] = [];
  tracers: Tracer[] = [];
  puffs: Puff[] = [];
  phase: HudState["phase"] = "countdown";
  countdown = 10;
  matchT = 0;
  zone = 0;
  feed: { id: number; text: string; t: number }[] = [];
  feedId = 0;
  result: HudState["result"] = null;
  wallCd = 0;
  fpvPref = false;
  adsT = 0;
  hudT = 0;
  netT = 0;
  checkT = 0;
  stormT = 0;
  circles: { x: number; z: number; r: number }[] = [];
  stormMesh: THREE.Mesh;
  nextMesh: THREE.Mesh;
  lastStormK = -1;
  netMsg = "";
  viewmodel: THREE.Group | null = null;
  vmKind = "";
  menuT = 0;
  last = 0;
  raf = 0;
  prevSprint = false;
  prompt = "";
  promptKind: "" | "chest" | "drop" = "";
  promptIdx = -1;
  spectate: Actor | null = null;
  mapBase: HTMLCanvasElement;
  fov = 75;
  bobT = 0;
  disposed = false;
  private tmpV2 = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const mobile = /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent) || ("ontouchstart" in window && window.innerWidth < 1000);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1200);
    this.scene.add(this.camera);
    this.scene.fog = new THREE.Fog(0xa8dcf5, 160, 620);
    // cielo
    const sc = document.createElement("canvas");
    sc.width = 8;
    sc.height = 256;
    const sg = sc.getContext("2d")!;
    const gr = sg.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, "#3a8dde");
    gr.addColorStop(0.55, "#8fd0f7");
    gr.addColorStop(1, "#d9f1ff");
    sg.fillStyle = gr;
    sg.fillRect(0, 0, 8, 256);
    const skyTex = new THREE.CanvasTexture(sc);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = skyTex;
    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x6a8a4a, 1.15));
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.5);
    sun.position.set(90, 140, 60);
    this.scene.add(sun);
    this.world = buildWorld();
    this.scene.add(this.world.group);
    // nubes
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const cr = mulberry32(5);
    for (let i = 0; i < 22; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(14 + cr() * 16, 4 + cr() * 3, 10 + cr() * 8), cloudMat);
        m.position.set(j * 9 - 14, cr() * 2, cr() * 6);
        c.add(m);
      }
      c.position.set((cr() * 2 - 1) * 380, 190 + cr() * 60, (cr() * 2 - 1) * 380);
      this.scene.add(c);
    }
    // cofres
    this.world.chests.forEach((c) => this.chests.push(this.makeChest(c.x, c.y, c.z)));
    // tormenta
    const stormGeo = new THREE.CylinderGeometry(1, 1, 400, 64, 1, true);
    this.stormMesh = new THREE.Mesh(
      stormGeo,
      new THREE.MeshBasicMaterial({ color: 0xb02bff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
    );
    this.stormMesh.position.y = 150;
    this.stormMesh.visible = false;
    this.scene.add(this.stormMesh);
    this.nextMesh = new THREE.Mesh(
      stormGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
    );
    this.nextMesh.position.y = 150;
    this.nextMesh.visible = false;
    this.scene.add(this.nextMesh);
    // pools
    const tg = new THREE.BoxGeometry(0.05, 0.05, 1);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true }));
      m.visible = false;
      this.scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    const pg = new THREE.SphereGeometry(0.5, 6, 4);
    for (let i = 0; i < 50; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
      m.visible = false;
      this.scene.add(m);
      this.puffs.push({ mesh: m, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
    }
    this.mapBase = this.renderMapBase();
    input.attach(canvas);
    window.addEventListener("resize", this.resize);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
  }

  resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ---------------------------------------------------------------- construcción
  makeChest(x: number, y: number, z: number): ChestState {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = ((x * 7 + z * 13) % 6.28) as number;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.65, 0.75), lam(0x8b5a2b));
    body.position.y = 0.33;
    group.add(body);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.12, 0.79), basic(0xffc21a));
    band.position.y = 0.4;
    group.add(band);
    const lid = new THREE.Group();
    lid.position.set(0, 0.66, -0.375);
    const lm = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.3, 0.79), basic(0xffb300));
    lm.position.set(0, 0.15, 0.375);
    lid.add(lm);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.06), basic(0xffffff));
    clasp.position.set(0, 0.05, 0.78);
    lid.add(clasp);
    group.add(lid);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 16, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 8;
    group.add(beam);
    this.scene.add(group);
    return { x, y, z, open: false, group, lid, beam };
  }

  renderMapBase() {
    const S = 180;
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const g = c.getContext("2d")!;
    const img = g.createImageData(S, S);
    for (let py = 0; py < S; py++)
      for (let px = 0; px < S; px++) {
        const x = (px / S - 0.5) * 2 * (ISLAND_R + 15);
        const z = (py / S - 0.5) * 2 * (ISLAND_R + 15);
        const h = heightAt(x, z);
        let r = 20,
          gg = 90,
          b = 150;
        if (h > -0.4) {
          const rd = roadDist(x, z);
          if (rd < 4.5) [r, gg, b] = [90, 90, 98];
          else if (h < 0.4) [r, gg, b] = [226, 210, 150];
          else {
            const k = Math.min(1, h / 9);
            [r, gg, b] = [70 + k * 70, 150 - k * 30, 70 + k * 30];
          }
        } else if (h > -3.5 && Math.hypot(x, z) < ISLAND_R) [r, gg, b] = [40, 140, 200];
        const i = (py * S + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = gg;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  createActor(e: RosterEntry, idx: number, localId: string): Actor {
    const rnd = mulberry32(idx * 977 + 13);
    const isLocal = e.id === localId;
    const shirt = SHIRTS[Math.floor(rnd() * SHIRTS.length)];
    const rig = makeRig(shirt, 0x2c3e50 + Math.floor(rnd() * 0x202020), SKINS[Math.floor(rnd() * SKINS.length)], e.name, "#ffffff");
    this.scene.add(rig.group);
    const a: Actor = {
      id: e.id,
      name: e.name,
      team: e.team,
      isBot: !e.human,
      local: isLocal,
      x: 0,
      y: 150,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      hp: 100,
      shield: 0,
      alive: true,
      state: "wait",
      onGround: false,
      coyote: 0,
      slots: [{ kind: "pistol", rarity: 0, ammo: WEAPONS.pistol.mag, count: 1 }, null, null, null],
      sel: 0,
      fireCd: 0,
      reloadT: 0,
      drinkT: 0,
      rig,
      tx: 0,
      ty: 150,
      tz: 0,
      tyaw: 0,
      kills: 0,
      slideT: 0,
      walk: 0,
      recoil: 0,
      deadT: 0,
      speed: 0,
      stormAcc: 0,
      stormOut: 0,
      lastHurtBy: "",
      wpX: 0,
      wpZ: 0,
      removed: false,
    };
    if (a.isBot) {
      const zi = Math.floor(rnd() * 4);
      const zn = ZONES[zi];
      a.ai = {
        zone: zi,
        tx: zn.x + (rnd() - 0.5) * 40,
        tz: zn.z + (rnd() - 0.5) * 40,
        mode: "loot",
        chest: -1,
        think: rnd() * 0.5,
        target: null,
        react: 0,
        strafe: 1,
        strafeT: 1,
        lx: 0,
        lz: 0,
        stuckT: 0,
        unstick: 0,
        unstickDir: 1,
        wx: 0,
        wz: 0,
        skip: new Set(),
        looted: 0,
        jumpT: 2,
      };
    }
    return a;
  }

  // ---------------------------------------------------------------- partida
  startMatch(cfg: MatchConfig) {
    this.endMatch(false);
    this.cfg = cfg;
    this.mode = "match";
    this.phase = "countdown";
    this.countdown = 10;
    this.matchT = 0;
    this.result = null;
    this.feed = [];
    this.netMsg = "";
    this.wallCd = 0;
    this.lastStormK = -1;
    this.stormT = 0;
    this.zone = cfg.dropZone;
    input.touchMode = cfg.touch;
    input.wantLock = false;
    input.touchAim = false;
    input.touchFire = false;
    input.touchJump = false;
    input.touchX = input.touchY = 0;
    input.releaseLock();
    // tormenta determinista
    const rr = mulberry32((cfg.seed ^ 0x5eed) >>> 0);
    const Rs = [160, 105, 68, 40, 20, 8, 1];
    this.circles = [{ x: 0, z: 0, r: Rs[0] }];
    for (let k = 1; k < Rs.length; k++) {
      const p = this.circles[k - 1];
      let cx = p.x,
        cz = p.z;
      for (let tries = 0; tries < 8; tries++) {
        const ang = rr() * Math.PI * 2;
        const d = rr() * Math.max(0, p.r - Rs[k]) * 0.85;
        cx = p.x + Math.cos(ang) * d;
        cz = p.z + Math.sin(ang) * d;
        if (Math.hypot(cx, cz) < 80) break;
      }
      this.circles.push({ x: cx, z: cz, r: Rs[k] });
    }
    // actores
    this.actors = [];
    this.byId.clear();
    const teamCenters = new Map<number, [number, number, number]>();
    cfg.roster.forEach((e, i) => {
      const a = this.createActor(e, i, cfg.myId);
      if (!teamCenters.has(e.team)) {
        const r2 = mulberry32((cfg.seed + e.team * 31) >>> 0);
        const ang = r2() * Math.PI * 2;
        const d = 10 + r2() * 55;
        teamCenters.set(e.team, [Math.cos(ang) * d, Math.sin(ang) * d, ang]);
      }
      const tc = teamCenters.get(e.team)!;
      a.x = tc[0] + (Math.random() - 0.5) * 6;
      a.z = tc[1] + (Math.random() - 0.5) * 6;
      a.y = 150 + (Math.random() - 0.5) * 6;
      a.tx = a.x;
      a.tz = a.z;
      a.ty = a.y;
      this.actors.push(a);
      this.byId.set(a.id, a);
      if (a.local) this.me = a;
    });
    const me = this.me!;
    const zn = ZONES[this.zone];
    me.yaw = Math.atan2(-(zn.x - me.x), -(zn.z - me.z));
    me.pitch = -0.5;
    // reiniciar cofres
    this.chests.forEach((c) => {
      c.open = false;
      c.lid.rotation.x = 0;
      c.beam.visible = true;
    });
    this.stormMesh.visible = true;
    this.nextMesh.visible = true;
    // red
    const net = cfg.net;
    if (net) {
      net.onMessage = this.onNet;
      net.onLeave = (id) => {
        const a = this.byId.get(id);
        if (a && a.alive) this.handleKill({ t: "kill", v: id, k: "" });
        if (net.isHost) net.broadcast({ t: "kill", v: id, k: "" });
      };
      net.onHostClosed = () => {
        this.netMsg = "El anfitrión se desconectó. La partida terminó.";
      };
      net.accepting = false;
    }
    sound.init();
    sound.startMusic("combat");
    sound.setIntensity(0);
    input.clearEvents();
  }

  endMatch(toMenu = true) {
    for (const a of this.actors) this.scene.remove(a.rig.group);
    this.actors = [];
    this.byId.clear();
    this.me = null;
    this.spectate = null;
    this.drops.forEach((d) => this.scene.remove(d.group));
    this.drops = [];
    this.structs.forEach((s) => this.removeStruct(s));
    this.structs = [];
    this.tracers.forEach((t) => (t.mesh.visible = false));
    this.puffs.forEach((p) => (p.mesh.visible = false));
    if (this.cfg?.net) {
      this.cfg.net.onMessage = () => {};
      this.cfg.net.close();
    }
    this.cfg = null;
    if (this.viewmodel) {
      this.camera.remove(this.viewmodel);
      this.viewmodel = null;
      this.vmKind = "";
    }
    this.stormMesh.visible = false;
    this.nextMesh.visible = false;
    this.chests.forEach((c) => {
      c.open = false;
      c.lid.rotation.x = 0;
      c.beam.visible = true;
    });
    this.camera.fov = 75;
    this.camera.updateProjectionMatrix();
    if (toMenu) {
      this.mode = "menu";
      input.wantLock = false;
      input.releaseLock();
      sound.startMusic("menu");
    }
  }

  private removeStruct(s: Struct) {
    s.boxes.forEach((b) => this.world.unregister(b));
    s.meshes.forEach((m) => this.scene.remove(m));
  }

  // ---------------------------------------------------------------- bucle
  loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.mode === "menu") this.updateMenu(dt);
    else this.updateMatch(dt);
    this.renderer.render(this.scene, this.camera);
  };

  updateMenu(dt: number) {
    this.menuT += dt;
    const t = this.menuT * 0.07;
    const r = 175;
    this.camera.position.set(Math.cos(t) * r, 70 + Math.sin(t * 2) * 12, Math.sin(t) * r);
    this.camera.lookAt(0, 4, 0);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    this.chests.forEach((c) => (c.beam.visible = true));
  }

  private simulates(a: Actor) {
    const net = this.cfg?.net;
    return a.local || (a.isBot && (!net || net.isHost));
  }

  stormAt(t: number) {
    const C = this.circles;
    const k = Math.min(6, Math.floor(t / 40));
    if (k >= 6) return { x: C[6].x, z: C[6].z, r: C[6].r, k, shrinking: false, left: 0, next: C[6] };
    const lt = t - 40 * k;
    const a = C[k],
      b = C[k + 1];
    if (lt < 15) return { x: a.x, z: a.z, r: a.r, k, shrinking: false, left: 15 - lt, next: b };
    const f = (lt - 15) / 25;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, r: a.r + (b.r - a.r) * f, k, shrinking: true, left: 40 - lt, next: b };
  }

  updateMatch(dt: number) {
    const me = this.me;
    const cfg = this.cfg;
    if (!me || !cfg) return;
    input.update(dt);
    input.wantLock = !cfg.touch && this.phase !== "countdown" && !this.result;
    if (this.result && input.locked) input.releaseLock();
    // fase
    if (this.phase === "countdown") {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = "drop";
        this.actors.forEach((a) => {
          if (a.state === "wait") a.state = "fall";
        });
      }
    } else {
      this.matchT += dt;
    }
    const storm = this.stormAt(this.matchT);
    if (this.phase !== "countdown") {
      if (storm.k !== this.lastStormK) {
        this.lastStormK = storm.k;
      }
      const shrinkNow = storm.shrinking ? 1 : 0;
      const key = storm.k * 2 + shrinkNow;
      if (key !== (this as unknown as { _sk?: number })._sk) {
        (this as unknown as { _sk?: number })._sk = key;
        if (shrinkNow && me.alive) sound.stormWarn();
      }
    }
    // sonido intensidad
    const aliveN = this.actors.filter((a) => a.alive).length;
    sound.setIntensity((aliveN <= 5 ? 1 : 0) + (storm.k >= 4 ? 1 : 0));

    // tormenta visual
    this.stormMesh.scale.set(storm.r, 1, storm.r);
    this.stormMesh.position.set(storm.x, 150, storm.z);
    (this.stormMesh.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(performance.now() / 300) * 0.08;
    this.nextMesh.scale.set(storm.next.r, 1, storm.next.r);
    this.nextMesh.position.set(storm.next.x, 150, storm.next.z);

    // jugador local
    if (me.alive) this.updateLocal(me, dt, storm);
    else this.updateSpectator(dt);

    // actores
    for (const a of this.actors) {
      if (a.local) {
        this.afterUpdate(a, dt);
        continue;
      }
      if (this.simulates(a) && a.alive) {
        this.updateBot(a, dt, storm);
        this.afterUpdate(a, dt);
      } else {
        this.updateRemote(a, dt);
      }
    }
    // daño por tormenta
    if (this.phase !== "countdown") this.stormDamage(dt, storm);

    // cofres, drops, estructuras, efectos
    this.updateWorldFx(dt);
    this.autoPickups(dt);
    if (this.matchT > 0) this.checkWin(dt);

    // red
    if (cfg.net) {
      this.netT += dt;
      if (this.netT > 1 / 15) {
        this.netT = 0;
        this.sendNet();
      }
    }
    // cámara
    this.updateCamera(dt, storm);
    // minimapa + HUD
    this.hudT += dt;
    if (this.hudT > 0.1) {
      this.hudT = 0;
      this.drawMinimap(storm);
      this.emitHud(storm);
    }
    input.clearEvents();
  }

  // ---------------------------------------------------------------- jugador local
  private weaponOf(a: Actor): { it: Item; def: WeaponDef } | null {
    const it = a.slots[a.sel];
    if (it && isGun(it.kind)) return { it, def: WEAPONS[it.kind] };
    return null;
  }

  selectSlot(i: number) {
    const a = this.me;
    if (!a || !a.alive) return;
    if (a.sel === i) {
      const it = a.slots[i];
      if (it && !isGun(it.kind)) this.startDrink(a);
      return;
    }
    a.sel = i;
    a.reloadT = 0;
    a.drinkT = 0;
  }

  private startDrink(a: Actor) {
    const it = a.slots[a.sel];
    if (!it || isGun(it.kind) || a.drinkT > 0) return;
    if (it.kind === "shield" && a.shield >= 100) return;
    if (it.kind === "health" && a.hp >= 100) return;
    a.drinkT = 2;
    if (a.local) sound.drink();
  }

  private startReload(a: Actor) {
    const w = this.weaponOf(a);
    if (!w || a.reloadT > 0 || w.it.ammo >= w.def.mag) return;
    a.reloadT = w.def.reload;
    if (a.local) sound.reload();
  }

  setZone(i: number) {
    this.zone = i;
    const a = this.me;
    if (a && this.phase === "countdown") {
      const z = ZONES[i];
      a.yaw = Math.atan2(-(z.x - a.x), -(z.z - a.z));
    }
  }
  skipCountdown() {
    if (this.phase === "countdown") this.countdown = 0;
  }
  toggleView() {
    this.fpvPref = !this.fpvPref;
  }
  interact() {
    input.interactPressed = true;
  }
  doWall(kind: "wall" | "ramp") {
    if (kind === "wall") input.wallPressed = true;
    else input.rampPressed = true;
  }

  private updateLocal(a: Actor, dt: number, storm: ReturnType<Engine["stormAt"]>) {
    const [lx, ly] = input.takeLook();
    const w = this.weaponOf(a);
    const zoom = this.adsT > 0.3 && w ? w.def.zoom : 1;
    const sm = 1 / Math.pow(zoom, 0.75);
    a.yaw -= lx * sm;
    a.pitch = clamp(a.pitch - ly * sm, -1.45, 1.45);
    if (input.viewPressed) this.toggleView();
    this.wallCd = Math.max(0, this.wallCd - dt);
    // selección de arma
    if (input.slotPressed >= 0 && input.slotPressed < 4) this.selectSlot(input.slotPressed);
    if (input.cyclePressed !== 0) {
      for (let i = 1; i <= 4; i++) {
        const n = (a.sel + input.cyclePressed * i + 8) % 4;
        if (a.slots[n]) {
          this.selectSlot(n);
          break;
        }
      }
    }
    if (this.phase === "countdown") {
      a.state = "wait";
      return;
    }
    if (a.state === "fall" || a.state === "glide") {
      if (input.jumpPressed) a.state = a.state === "fall" ? "glide" : "fall";
      this.airMove(a, dt, input.my, input.mx);
      this.aimsFov(a, false, dt);
      return;
    }
    if (this.phase === "drop" && a.state === "ground") this.phase = "play";
    if (this.phase === "over" && this.result?.win) {
      /* sigue jugable */
    }
    // movimiento
    const moving = Math.hypot(input.mx, input.my) > 0.1;
    const sprintReq = input.sprint && input.my > 0.2 && !input.aim;
    if (input.sprint && !this.prevSprint && !input.touchMode && moving && a.onGround && a.slideT <= 0) a.slideT = 0.7;
    this.prevSprint = input.sprint;
    if (!moving) a.slideT = 0;
    let speed = 6.0;
    if (sprintReq) speed = 9.0;
    if (input.aim && w) speed = 3.4;
    if (a.drinkT > 0) speed = 3.2;
    if (input.touchMode && Math.hypot(input.mx, input.my) > 0.92 && !input.aim) speed = 8.2;
    const fx = -Math.sin(a.yaw),
      fz = -Math.cos(a.yaw);
    const rx = Math.cos(a.yaw),
      rz = -Math.sin(a.yaw);
    let wx = fx * input.my + rx * input.mx;
    let wz = fz * input.my + rz * input.mx;
    const l = Math.hypot(wx, wz);
    if (l > 1) {
      wx /= l;
      wz /= l;
    }
    if (a.slideT > 0) {
      a.slideT -= dt;
      const s = 12 * (a.slideT / 0.7) + 5;
      wx = fx * s;
      wz = fz * s;
    } else {
      wx *= speed;
      wz *= speed;
    }
    this.groundMove(a, dt, wx, wz, input.jumpHeld || input.jumpPressed);

    // cobertura rápida
    if (input.wallPressed) this.placeStruct(a, "wall");
    if (input.rampPressed) this.placeStruct(a, "ramp");

    // interacción
    this.updatePrompt(a);
    if (input.interactPressed || input.contextPressed) {
      if (this.prompt) this.doInteract(a);
      else if (input.contextPressed) this.startReload(a);
    }
    if (input.reloadPressed) this.startReload(a);

    // ADS
    const wantAds = input.aim && !!w;
    const ads = wantAds;
    this.aimsFov(a, ads, dt);

    // disparo
    a.fireCd -= dt;
    let fire = input.fire;
    if (input.touchMode && this.autoFire && w && !fire) {
      const t = this.crosshairEnemy(a, w.def.range);
      if (t) fire = true;
    }
    if (a.reloadT > 0) {
      a.reloadT -= dt;
      if (a.reloadT <= 0 && w) w.it.ammo = w.def.mag;
    }
    if (a.drinkT > 0) {
      a.drinkT -= dt;
      if (a.drinkT <= 0) this.finishDrink(a);
    }
    const it = a.slots[a.sel];
    if (it && !isGun(it.kind)) {
      if (input.firePressed) this.startDrink(a);
    } else if (w && fire && a.fireCd <= 0 && a.reloadT <= 0 && a.drinkT <= 0) {
      if (w.it.ammo <= 0) this.startReload(a);
      else {
        const dir = this.aimDir(a);
        const o = this.camOrigin(a);
        const moveSpread = clamp(a.speed / 9, 0, 1) * 0.8 + (a.onGround ? 0 : 1.2);
        const spreadMul = (ads ? 0.35 : 1) * (1 + moveSpread);
        this.shoot(a, o, dir, w.def, w.it, spreadMul, 1);
        w.it.ammo--;
        a.fireCd = w.def.rate;
        a.recoil = 1;
        a.pitch += (w.def.pellets > 1 ? 0.03 : w.def.dmg > 60 ? 0.045 : 0.008) * (ads ? 0.6 : 1);
        a.yaw += (Math.random() - 0.5) * 0.006;
        if (w.it.ammo <= 0) this.startReload(a);
      }
    }
    void storm;
  }

  private aimsFov(a: Actor, ads: boolean, dt: number) {
    void a;
    this.adsT += ((ads ? 1 : 0) - this.adsT) * Math.min(1, dt * 12);
  }

  private finishDrink(a: Actor) {
    const it = a.slots[a.sel];
    if (!it) return;
    if (it.kind === "shield") a.shield = Math.min(100, a.shield + 50);
    if (it.kind === "health") a.hp = Math.min(100, a.hp + 100);
    it.count--;
    if (it.count <= 0) a.slots[a.sel] = null;
    if (a.local) sound.drinkDone();
  }

  private crosshairEnemy(a: Actor, range: number): Actor | null {
    const o = this.camOrigin(a);
    const d = this.aimDir(a);
    const r = this.trace(o, d, Math.min(range, 120), a);
    return r.actor;
  }

  aimDir(a: Actor, out = new THREE.Vector3()) {
    const cp = Math.cos(a.pitch);
    return out.set(-Math.sin(a.yaw) * cp, Math.sin(a.pitch), -Math.cos(a.yaw) * cp);
  }
  /** origen del disparo del jugador local (cabeza + hacia adelante) */
  camOrigin(a: Actor) {
    const d = this.aimDir(a);
    const camDist = this.fpv() ? 0 : 3.2;
    return new THREE.Vector3(a.x, a.y + 1.55, a.z).addScaledVector(d, camDist * 0.9 + 0.5);
  }

  fpv() {
    const a = this.me;
    if (!a || !a.alive || a.state === "fall" || a.state === "glide" || a.state === "wait") return false;
    const w = this.weaponOf(a);
    if (w && w.it.kind === "sniper" && this.adsT > 0.6) return true;
    return this.fpvPref;
  }

  // ---------------------------------------------------------------- física
  private airMove(a: Actor, dt: number, my: number, mx: number) {
    const fall = a.state === "fall";
    const fx = -Math.sin(a.yaw),
      fz = -Math.cos(a.yaw),
      rx = Math.cos(a.yaw),
      rz = -Math.sin(a.yaw);
    let sp = fall ? 14 + 22 * Math.max(0, my) : 8 + 8 * Math.max(0, my);
    if (my < -0.3) sp *= 0.4;
    const wx = fx * sp + rx * mx * 9;
    const wz = fz * sp + rz * mx * 9;
    const f = Math.min(1, 2.2 * dt);
    a.vx += (wx - a.vx) * f;
    a.vz += (wz - a.vz) * f;
    const tvy = fall ? -34 : -7.5;
    a.vy += (tvy - a.vy) * Math.min(1, 3 * dt);
    const py = a.y;
    const nx = a.x + a.vx * dt,
      nz = a.z + a.vz * dt;
    let ny = a.y + a.vy * dt;
    const gh = heightAt(nx, nz);
    const b = this.world.hit(nx, ny, nz, R, H);
    let landed = false;
    if (b) {
      if (py >= b.y1 - 0.3) {
        ny = b.y1;
        landed = true;
        a.x = nx;
        a.z = nz;
      } else {
        // choca de lado: no avanzar
        ny = a.y + a.vy * dt;
        a.vx *= -0.2;
        a.vz *= -0.2;
      }
    } else {
      a.x = nx;
      a.z = nz;
    }
    if (ny <= gh) {
      ny = gh;
      landed = true;
    }
    a.y = ny;
    if (Math.hypot(a.x, a.z) > ISLAND_R + 30) {
      a.x *= 0.995;
      a.z *= 0.995;
    }
    if (fall && a.y - heightAt(a.x, a.z) < 55) a.state = "glide";
    if (landed) {
      a.state = "ground";
      a.onGround = true;
      a.vy = 0;
      a.vx *= 0.2;
      a.vz *= 0.2;
    }
  }

  private moveAxis(a: Actor, dx: number, dz: number) {
    const nx = a.x + dx,
      nz = a.z + dz;
    const b = this.world.hit(nx, a.y, nz, R, H);
    if (!b) {
      a.x = nx;
      a.z = nz;
      return;
    }
    if (b.y1 - a.y <= STEP && a.vy <= 2) {
      const ny = b.y1 + 0.001;
      if (!this.world.hit(nx, ny, nz, R, H)) {
        a.x = nx;
        a.z = nz;
        a.y = ny;
        a.onGround = true;
        a.vy = Math.max(0, a.vy);
        return;
      }
    }
    if (dx !== 0) a.vx = 0;
    if (dz !== 0) a.vz = 0;
  }

  groundMove(a: Actor, dt: number, wx: number, wz: number, jump: boolean) {
    const gh0 = heightAt(a.x, a.z);
    if (gh0 < SEA_Y + 0.05) {
      wx *= 0.55;
      wz *= 0.55;
    }
    const f = Math.min(1, (a.onGround ? 14 : 3.5) * dt);
    a.vx += (wx - a.vx) * f;
    a.vz += (wz - a.vz) * f;
    if (jump && (a.onGround || a.coyote > 0)) {
      a.vy = JUMP;
      a.onGround = false;
      a.coyote = 0;
    }
    a.vy = Math.max(-45, a.vy - G * dt);
    this.moveAxis(a, a.vx * dt, 0);
    this.moveAxis(a, 0, a.vz * dt);
    const prevY = a.y;
    const was = a.onGround;
    a.y += a.vy * dt;
    a.onGround = false;
    const gh = heightAt(a.x, a.z);
    if (a.y <= gh) {
      a.y = gh;
      if (a.vy < 0) a.vy = 0;
      a.onGround = true;
    } else if (was && a.vy <= 0 && a.y - gh < 0.3 && !this.world.hit(a.x, a.y - 0.35, a.z, R * 0.8, 0.3)) {
      a.y = gh;
      a.vy = 0;
      a.onGround = true;
    }
    for (let i = 0; i < 3; i++) {
      const b = this.world.hit(a.x, a.y, a.z, R, H);
      if (!b) break;
      if (prevY >= b.y1 - 0.12 && a.vy <= 0) {
        a.y = b.y1;
        a.vy = 0;
        a.onGround = true;
      } else if (a.vy > 0 && prevY + H <= b.y0 + 0.15) {
        a.y = b.y0 - H - 0.001;
        a.vy = 0;
      } else if (b.y1 - a.y < 1.0) {
        a.y = b.y1;
        a.vy = Math.max(a.vy, 0);
        a.onGround = true;
      } else {
        const ox1 = a.x + R - b.x0,
          ox2 = b.x1 - (a.x - R),
          oz1 = a.z + R - b.z0,
          oz2 = b.z1 - (a.z - R);
        const mx = Math.min(ox1, ox2),
          mz = Math.min(oz1, oz2);
        if (mx < mz) a.x += ox1 < ox2 ? -ox1 : ox2;
        else a.z += oz1 < oz2 ? -oz1 : oz2;
      }
    }
    if (a.onGround) a.coyote = 0.12;
    else a.coyote -= dt;
    const d = Math.hypot(a.x, a.z);
    if (d > ISLAND_R - 3) {
      const k = (ISLAND_R - 3) / d;
      a.x *= k;
      a.z *= k;
    }
    a.speed = Math.hypot(a.vx, a.vz);
  }

  // ---------------------------------------------------------------- estructuras
  private placeStruct(a: Actor, kind: "wall" | "ramp") {
    if (this.wallCd > 0 || !a.alive || a.state !== "ground") return;
    this.wallCd = 1.4;
    const fx = -Math.sin(a.yaw),
      fz = -Math.cos(a.yaw);
    const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : fz > 0 ? 2 : 0; // 0 N,1 E,2 S,3 W
    this.buildStruct(kind, a.x, a.y, a.z, dir, true);
    this.cfg?.net?.send({ t: "wall", k: kind, x: a.x, y: a.y, z: a.z, d: dir }, true);
    sound.build();
  }

  buildStruct(kind: "wall" | "ramp", px: number, py: number, pz: number, dir: number, _local = false) {
    void _local;
    const dx = [0, 1, 0, -1][dir],
      dz = [-1, 0, 1, 0][dir];
    const s: Struct = { boxes: [], meshes: [], born: this.matchT };
    const addBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: number) => {
      const b: Box = { x0, x1, y0, y1, z0, z1 };
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.92 }));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this.scene.add(m);
      this.world.register(b);
      s.boxes.push(b);
      s.meshes.push(m);
    };
    const by = py - 0.15;
    if (kind === "wall") {
      const cx = px + dx * 2.4,
        cz = pz + dz * 2.4;
      const hw = 2.1;
      if (dx !== 0) addBox(cx - 0.2, cx + 0.2, by, by + 3.2, cz - hw, cz + hw, 0x4cc9f0);
      else addBox(cx - hw, cx + hw, by, by + 3.2, cz - 0.2, cz + 0.2, 0x4cc9f0);
    } else {
      const hw = 1.6;
      for (let i = 0; i < 4; i++) {
        const a0 = 1.5 + i * 0.9,
          a1 = a0 + 0.9;
        const top = py + 0.6 * (i + 1) - 0.15;
        if (dx > 0) addBox(px + a0, px + a1, by, top, pz - hw, pz + hw, 0xf9c74f);
        else if (dx < 0) addBox(px - a1, px - a0, by, top, pz - hw, pz + hw, 0xf9c74f);
        else if (dz > 0) addBox(px - hw, px + hw, by, top, pz + a0, pz + a1, 0xf9c74f);
        else addBox(px - hw, px + hw, by, top, pz - a1, pz - a0, 0xf9c74f);
      }
    }
    this.structs.push(s);
    while (this.structs.length > 26) this.removeStruct(this.structs.shift()!);
  }

  // ---------------------------------------------------------------- combate
  private trace(o: THREE.Vector3, d: THREE.Vector3, max: number, shooter: Actor) {
    let tMax = max;
    const tw = this.world.ray(o.x, o.y, o.z, d.x, d.y, d.z, max);
    if (tw >= 0) tMax = Math.min(tMax, tw);
    // terreno
    for (let t = 1; t < tMax; t += 2) {
      const px = o.x + d.x * t,
        py = o.y + d.y * t,
        pz = o.z + d.z * t;
      if (py < heightAt(px, pz)) {
        tMax = t;
        break;
      }
    }
    let best: Actor | null = null;
    let head = false;
    for (const t of this.actors) {
      if (!t.alive || t === shooter || t.team === shooter.team || t.state === "wait") continue;
      const hgt = t.slideT > 0 ? 1.1 : H;
      const box: Box = { x0: t.x - 0.4, x1: t.x + 0.4, y0: t.y, y1: t.y + hgt, z0: t.z - 0.4, z1: t.z + 0.4 };
      const tt = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, box);
      if (tt >= 0 && tt < tMax) {
        tMax = tt;
        best = t;
        head = o.y + d.y * tt > t.y + hgt - 0.38;
      }
    }
    return { t: tMax, actor: best, head };
  }

  private muzzle(a: Actor, out: THREE.Vector3) {
    if (a.local && this.fpv() && this.viewmodel) {
      this.viewmodel.getWorldPosition(out);
      const d = this.aimDir(a, this.tmpV2);
      out.addScaledVector(d, 0.6);
      return out;
    }
    a.rig.gunHolder.getWorldPosition(out);
    const d = this.aimDir(a, this.tmpV2);
    out.addScaledVector(d, 0.5);
    return out;
  }

  shoot(a: Actor, o: THREE.Vector3, d: THREE.Vector3, def: WeaponDef, item: Item, spreadMul: number, dmgMul: number) {
    const mult = RARITY_MULT[item.rarity];
    const dmgTo = new Map<Actor, { dmg: number; head: boolean }>();
    const mz = this.muzzle(a, new THREE.Vector3());
    let firstEnd: THREE.Vector3 | null = null;
    for (let p = 0; p < def.pellets; p++) {
      const dir = d.clone();
      const sp = def.spread * spreadMul;
      dir.x += (Math.random() - 0.5) * 2 * sp;
      dir.y += (Math.random() - 0.5) * 2 * sp;
      dir.z += (Math.random() - 0.5) * 2 * sp;
      dir.normalize();
      const r = this.trace(o, dir, def.range, a);
      const end = o.clone().addScaledVector(dir, r.t);
      if (!firstEnd) firstEnd = end;
      this.addTracer(mz, end);
      if (r.actor) {
        let dmg = def.dmg * mult * dmgMul;
        if (def.pellets > 1) dmg *= 1 - (r.t / def.range) * 0.7;
        if (r.head) dmg *= 1.7;
        const cur = dmgTo.get(r.actor) ?? { dmg: 0, head: false };
        cur.dmg += dmg;
        cur.head = cur.head || r.head;
        dmgTo.set(r.actor, cur);
        this.puff(end, 0xff2a2a, 0.25, 0.3);
      } else if (r.t < def.range - 0.5) {
        this.puff(end, 0xcccccc, 0.2, 0.35);
      }
    }
    // muzzle flash
    this.puff(mz, 0xffd24d, 0.35, 0.06);
    const kind = def === WEAPONS.pistol ? "pistol" : (Object.keys(WEAPONS).find((k) => WEAPONS[k] === def) ?? "ar");
    const local = a.local;
    const cam = this.me;
    const dist = cam ? Math.hypot(cam.x - a.x, cam.z - a.z) : 0;
    sound.shot(kind, local ? 1 : clamp(1 - dist / 130, 0, 1) * 0.9);
    a.recoil = 1;
    dmgTo.forEach((v, t) => {
      const amount = Math.round(v.dmg);
      if (local) {
        const kill = t.hp + t.shield <= amount;
        this.onEvent(kill ? "kill" : "hit");
        sound.hitmarker(kill);
      }
      this.routeDamage(t.id, amount, a.id);
    });
    if (this.cfg?.net && firstEnd) {
      this.cfg.net.send({ t: "shot", id: a.id, o: [mz.x, mz.y, mz.z], e: [firstEnd.x, firstEnd.y, firstEnd.z], w: kind }, true);
    }
  }

  routeDamage(toId: string, dmg: number, fromId: string) {
    const t = this.byId.get(toId);
    if (!t || !t.alive) return;
    const net = this.cfg?.net;
    if (!net) {
      this.applyDamage(t, dmg, fromId);
      return;
    }
    if (net.isHost) {
      if (t.local || t.isBot) this.applyDamage(t, dmg, fromId);
      else net.sendTo(toId, { t: "dmg", to: toId, dmg, from: fromId });
    } else {
      // predicción local para feedback visual en remotos
      net.sendHost({ t: "dmg", to: toId, dmg, from: fromId });
    }
  }

  applyDamage(t: Actor, dmg: number, fromId: string) {
    if (!t.alive || t.state === "wait") return;
    const sh = Math.min(t.shield, dmg);
    t.shield -= sh;
    t.hp -= dmg - sh;
    t.lastHurtBy = fromId;
    if (t.local) {
      sound.hurt();
      this.onEvent("hurt");
    }
    if (t.hp <= 0) {
      t.hp = 0;
      this.die(t, fromId);
    }
  }

  private die(t: Actor, fromId: string) {
    const m: Msg = { t: "kill", v: t.id, k: fromId };
    this.handleKill(m);
    this.cfg?.net?.send(m, true);
  }

  handleKill(m: Msg) {
    const v = this.byId.get(m.v);
    if (!v || !v.alive) return;
    v.alive = false;
    v.hp = 0;
    v.deadT = 0;
    const k = this.byId.get(m.k);
    if (k && k !== v) {
      k.kills++;
      this.addFeed(`${k.name} eliminó a ${v.name}`);
    } else this.addFeed(m.k === "storm" ? `${v.name} murió en la tormenta` : `${v.name} fue eliminado`);
    // soltar loot
    const mid = this.cfg ? this.cfg.seed : 1;
    void mid;
    if (v.local) {
      sound.jingle(false);
      this.spectate = k && k.alive ? k : null;
    }
    if (this.spectate === v) this.spectate = null;
  }

  private addFeed(text: string) {
    this.feed.push({ id: this.feedId++, text, t: 5 });
    if (this.feed.length > 5) this.feed.shift();
  }

  private addTracer(a: THREE.Vector3, b: THREE.Vector3) {
    const tr = this.tracers.find((t) => t.life <= 0);
    if (!tr) return;
    tr.life = 0.09;
    const len = a.distanceTo(b);
    tr.mesh.visible = true;
    tr.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    tr.mesh.scale.set(1, 1, len);
    tr.mesh.lookAt(b);
    (tr.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  puff(p: THREE.Vector3, color: number, size: number, life: number) {
    const pf = this.puffs.find((q) => q.life <= 0);
    if (!pf) return;
    pf.life = pf.max = life;
    pf.mesh.visible = true;
    pf.mesh.position.copy(p);
    pf.mesh.scale.setScalar(size);
    (pf.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    pf.vx = (Math.random() - 0.5) * 2;
    pf.vy = Math.random() * 2;
    pf.vz = (Math.random() - 0.5) * 2;
  }

  // ---------------------------------------------------------------- loot
  private rollItem(rng: () => number, kind?: "weapon" | "shield" | "health"): Item {
    if (kind === "shield") return { kind: "shield", rarity: 1, ammo: 0, count: 1 };
    if (kind === "health") return { kind: "health", rarity: 0, ammo: 0, count: 1 };
    const r = rng();
    const rarity = (r < 0.45 ? 0 : r < 0.75 ? 1 : r < 0.92 ? 2 : 3) as 0 | 1 | 2 | 3;
    const k = rng();
    const wk: ItemKind = k < 0.32 ? "ar" : k < 0.55 ? "smg" : k < 0.82 ? "shotgun" : "sniper";
    return { kind: wk, rarity, ammo: WEAPONS[wk].mag, count: 1 };
  }

  openChest(i: number, broadcast: boolean) {
    const c = this.chests[i];
    if (!c || c.open || !this.cfg) return;
    c.open = true;
    c.lid.rotation.x = -1.9;
    c.beam.visible = false;
    const me = this.me;
    const dist = me ? Math.hypot(me.x - c.x, me.z - c.z) : 0;
    if (dist < 60) sound.chest();
    const rng = mulberry32((this.cfg.seed * 31 + i * 7919 + 13) >>> 0);
    const items: Item[] = [this.rollItem(rng), this.rollItem(rng, "shield")];
    if (rng() < 0.65) items.push(this.rollItem(rng, "health"));
    if (rng() < 0.3) items.push(this.rollItem(rng));
    items.forEach((it, j) => {
      const ang = (j / items.length) * Math.PI * 2 + rng();
      this.spawnDrop(`${i}:${j}`, it, c.x + Math.cos(ang) * 1.3, c.y, c.z + Math.sin(ang) * 1.3);
    });
    if (broadcast) this.cfg.net?.send({ t: "chest", i }, true);
  }

  private spawnDrop(id: string, item: Item, x: number, y: number, z: number) {
    const group = new THREE.Group();
    const col = parseInt(RARITY_COLORS[item.rarity].slice(1), 16);
    if (isGun(item.kind)) {
      const g = makeGun(item.kind, col);
      g.scale.setScalar(1.5);
      g.position.y = 0.7;
      group.add(g);
    } else {
      const c = item.kind === "shield" ? 0x2f8cff : 0x34e06b;
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 10), basic(c));
      bottle.position.y = 0.7;
      group.add(bottle);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), basic(0xffffff));
      cap.position.y = 1.05;
      group.add(cap);
    }
    const beamCol = isGun(item.kind) ? col : item.kind === "shield" ? 0x2f8cff : 0x34e06b;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6, 8, 1, true), new THREE.MeshBasicMaterial({ color: beamCol, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = 3;
    group.add(beam);
    group.position.set(x, Math.max(y, heightAt(x, z)), z);
    this.scene.add(group);
    this.drops.push({ id, item, x, y: group.position.y, z, group, t: Math.random() * 6 });
  }

  removeDrop(id: string) {
    const i = this.drops.findIndex((d) => d.id === id);
    if (i < 0) return;
    this.scene.remove(this.drops[i].group);
    this.drops.splice(i, 1);
  }

  /** ¿en qué slot cabe automáticamente? -1 si no */
  private pickSlot(a: Actor, it: Item): number {
    if (!isGun(it.kind)) {
      const s = a.slots.findIndex((x) => x && x.kind === it.kind && x.count < 5);
      if (s >= 0) return s;
      return a.slots.findIndex((x) => !x);
    }
    const same = a.slots.findIndex((x) => x && x.kind === it.kind);
    if (same >= 0) return (a.slots[same]!.rarity < it.rarity ? same : -1);
    const e = a.slots.findIndex((x) => !x);
    if (e >= 0) return e;
    // reemplaza pistola inicial
    return a.slots.findIndex((x) => x && x.kind === "pistol");
  }

  private applyPick(a: Actor, it: Item, s: number) {
    const cur = a.slots[s];
    if (cur && !isGun(it.kind) && cur.kind === it.kind) cur.count += it.count;
    else a.slots[s] = { ...it };
    if (a.local) sound.pickup();
  }

  private autoPickups(dt: number) {
    for (const d of this.drops) {
      d.t += dt;
      d.group.rotation.y += dt * 1.6;
      d.group.children[0].position.y = 0.7 + Math.sin(d.t * 3) * 0.1;
    }
    for (const a of this.actors) {
      if (!a.alive || a.state !== "ground" || !this.simulates(a)) continue;
      for (const d of this.drops) {
        if (Math.abs(d.x - a.x) < 1.6 && Math.abs(d.z - a.z) < 1.6 && Math.abs(d.y - a.y) < 2.5) {
          const s = this.pickSlot(a, d.item);
          if (s >= 0) {
            this.applyPick(a, d.item, s);
            this.removeDrop(d.id);
            this.cfg?.net?.send({ t: "pick", id: d.id }, true);
            break;
          }
        }
      }
    }
  }

  private updatePrompt(a: Actor) {
    this.prompt = "";
    this.promptKind = "";
    this.promptIdx = -1;
    let bd = 3.2;
    this.chests.forEach((c, i) => {
      if (c.open) return;
      const d = Math.hypot(c.x - a.x, c.z - a.z);
      if (d < bd && Math.abs(c.y - a.y) < 2.5) {
        bd = d;
        this.promptKind = "chest";
        this.promptIdx = i;
      }
    });
    if ((this.promptKind as string) === "chest") {
      this.prompt = input.padConnected ? "X: Abrir cofre" : input.touchMode ? "Toca ABRIR" : "E: Abrir cofre";
      return;
    }
    let dd = 2.6;
    this.drops.forEach((d, i) => {
      const dist = Math.hypot(d.x - a.x, d.z - a.z);
      if (dist < dd && Math.abs(d.y - a.y) < 2.5) {
        dd = dist;
        this.promptKind = "drop";
        this.promptIdx = i;
      }
    });
    if ((this.promptKind as string) === "drop") {
      const d = this.drops[this.promptIdx];
      this.prompt = `${input.touchMode ? "ABRIR" : input.padConnected ? "X" : "E"}: Cambiar por ${d.item.kind === "shield" ? "Escudo" : d.item.kind === "health" ? "Vida" : WEAPONS[d.item.kind].name}`;
    }
  }

  private doInteract(a: Actor) {
    if (this.promptKind === "chest") {
      this.openChest(this.promptIdx, true);
    } else if ((this.promptKind as string) === "drop") {
      const d = this.drops[this.promptIdx];
      if (!d) return;
      const s = this.pickSlot(a, d.item);
      const slot = s >= 0 ? s : a.sel;
      this.applyPick(a, d.item, slot);
      this.removeDrop(d.id);
      this.cfg?.net?.send({ t: "pick", id: d.id }, true);
    }
  }

  // ---------------------------------------------------------------- bots
  private updateBot(a: Actor, dt: number, storm: ReturnType<Engine["stormAt"]>) {
    const ai = a.ai!;
    if (a.state === "wait") return;
    if (a.state === "fall" || a.state === "glide") {
      const dx = ai.tx - a.x,
        dz = ai.tz - a.z;
      const want = Math.atan2(-dx, -dz);
      a.yaw += clamp(angDiff(a.yaw, want), -2 * dt, 2 * dt);
      const hd = Math.hypot(dx, dz);
      this.airMove(a, dt, hd > 12 ? 1 : 0.2, 0);
      return;
    }
    a.fireCd -= dt;
    // temporizadores
    if (a.reloadT > 0) {
      a.reloadT -= dt;
      const w = this.weaponOf(a);
      if (a.reloadT <= 0 && w) w.it.ammo = w.def.mag;
    }
    if (a.drinkT > 0) {
      a.drinkT -= dt;
      if (a.drinkT <= 0) this.finishDrink(a);
    }
    ai.react -= dt;
    ai.think -= dt;
    if (ai.think <= 0) {
      ai.think = 0.25 + Math.random() * 0.2;
      this.botThink(a, storm);
    }
    // movimiento
    let wx = 0,
      wz = 0;
    let speed = 5.8;
    const fx = -Math.sin(a.yaw),
      fz = -Math.cos(a.yaw),
      rx = Math.cos(a.yaw),
      rz = -Math.sin(a.yaw);
    let jump = false;
    const tgt = ai.target ? this.byId.get(ai.target) : null;
    const stormOut = Math.hypot(a.x - storm.x, a.z - storm.z) > storm.r - 6;
    if (a.drinkT > 0) {
      speed = 0;
    } else if (ai.mode === "fight" && tgt && tgt.alive) {
      const dx = tgt.x - a.x,
        dz = tgt.z - a.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(-dx, -dz);
      const diff = angDiff(a.yaw, want);
      a.yaw += clamp(diff, -3.2 * dt, 3.2 * dt);
      const ty = tgt.y + 1.2 - (a.y + 1.5);
      a.pitch += clamp(Math.atan2(ty, d) - a.pitch, -2 * dt, 2 * dt);
      const w = this.weaponOf(a);
      const pref = !w ? 15 : w.it.kind === "shotgun" ? 9 : w.it.kind === "smg" ? 16 : w.it.kind === "sniper" ? 50 : w.it.kind === "ar" ? 26 : 18;
      let f = 0;
      if (stormOut) {
        const cd = Math.atan2(-(storm.x - a.x), -(storm.z - a.z));
        const df = angDiff(a.yaw, cd);
        f = Math.cos(df);
      } else if (d > pref + 6) f = 1;
      else if (d < pref - 6) f = -0.8;
      ai.strafeT -= dt;
      if (ai.strafeT <= 0) {
        ai.strafe = Math.random() < 0.5 ? -1 : 1;
        ai.strafeT = 0.8 + Math.random() * 1.6;
      }
      wx = fx * f + rx * ai.strafe * 0.8;
      wz = fz * f + rz * ai.strafe * 0.8;
      ai.jumpT -= dt;
      if (ai.jumpT <= 0) {
        jump = true;
        ai.jumpT = 1.5 + Math.random() * 3;
      }
      // disparar
      if (w && ai.react <= 0 && a.fireCd <= 0 && a.reloadT <= 0 && Math.abs(diff) < 0.25 && d < w.def.range * 0.9) {
        if (w.it.ammo <= 0) this.startReload(a);
        else {
          const o = new THREE.Vector3(a.x, a.y + 1.5, a.z);
          const aim = new THREE.Vector3(tgt.x + (Math.random() - 0.5) * 0.5, tgt.y + 1.1 + (Math.random() - 0.5) * 0.4, tgt.z + (Math.random() - 0.5) * 0.5);
          const dir = aim.sub(o).normalize();
          const sp = 0.7 + d / 40;
          this.shoot(a, o, dir, w.def, w.it, sp, 0.6);
          w.it.ammo--;
          a.fireCd = w.def.rate * (w.def.auto ? 1.7 : 1.3) + Math.random() * 0.12;
        }
      }
    } else {
      let gx = ai.wx,
        gz = ai.wz;
      if (ai.mode === "loot" && ai.chest >= 0) {
        const c = this.chests[ai.chest];
        gx = c.x;
        gz = c.z;
        const d = Math.hypot(c.x - a.x, c.z - a.z);
        if (d < 2.4 && Math.abs(c.y - a.y) < 2.5) {
          if (!c.open) this.openChest(ai.chest, true);
          ai.chest = -1;
          ai.looted++;
          ai.think = 0.2;
        }
      }
      if (stormOut) {
        gx = storm.x;
        gz = storm.z;
        speed = 7.5;
      }
      const dx = gx - a.x,
        dz = gz - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.5) {
        const want = Math.atan2(-dx, -dz);
        a.yaw += clamp(angDiff(a.yaw, want), -4 * dt, 4 * dt);
        a.pitch *= 0.9;
        wx = fx;
        wz = fz;
      } else if (ai.mode === "roam") ai.think = 0;
    }
    // atasco
    if (speed > 0 && (wx !== 0 || wz !== 0)) {
      ai.stuckT += dt;
      if (ai.stuckT > 0.6) {
        const moved = Math.hypot(a.x - ai.lx, a.z - ai.lz);
        ai.lx = a.x;
        ai.lz = a.z;
        ai.stuckT = 0;
        if (moved < 0.8) {
          ai.unstick = 0.9;
          ai.unstickDir = Math.random() < 0.5 ? -1 : 1;
          if (ai.mode === "loot" && Math.random() < 0.3 && ai.chest >= 0) {
            ai.skip.add(ai.chest);
            ai.chest = -1;
          }
          if (ai.mode === "roam") ai.think = 0;
        }
      }
    }
    if (ai.unstick > 0) {
      ai.unstick -= dt;
      wx = wx * 0.3 + rx * ai.unstickDir;
      wz = wz * 0.3 + rz * ai.unstickDir;
      jump = true;
    }
    const l = Math.hypot(wx, wz);
    if (l > 0) {
      wx = (wx / l) * speed;
      wz = (wz / l) * speed;
    }
    this.groundMove(a, dt, wx, wz, jump);
  }

  private botThink(a: Actor, storm: ReturnType<Engine["stormAt"]>) {
    const ai = a.ai!;
    // buscar enemigo
    let best: Actor | null = null;
    let bd = 75;
    const eye = new THREE.Vector3(a.x, a.y + 1.5, a.z);
    for (const t of this.actors) {
      if (!t.alive || t.team === a.team || t.state === "wait" || t.state === "fall") continue;
      const d = Math.hypot(t.x - a.x, t.z - a.z);
      if (d >= bd) continue;
      const dir = new THREE.Vector3(t.x - a.x, t.y + 1.1 - eye.y, t.z - a.z);
      const len = dir.length();
      dir.normalize();
      const wl = this.world.ray(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, len);
      if (wl < 0 || wl > len - 1) {
        bd = d;
        best = t;
      }
    }
    const stormOut = Math.hypot(a.x - storm.x, a.z - storm.z) > storm.r - 6;
    if (best && !(stormOut && bd > 20)) {
      if (ai.target !== best.id) ai.react = 0.35 + Math.random() * 0.5;
      ai.target = best.id;
      ai.mode = "fight";
      // mejor arma
      let bs = -1,
        bi = a.sel;
      a.slots.forEach((it, i) => {
        if (!it || !isGun(it.kind)) return;
        let s = { pistol: 1, ar: 3, smg: 2.4, shotgun: bd < 18 ? 3.4 : 0.6, sniper: bd > 45 ? 3.6 : 0.8 }[it.kind as string] ?? 1;
        s *= RARITY_MULT[it.rarity];
        if (it.ammo <= 0) s *= 0.5;
        if (s > bs) {
          bs = s;
          bi = i;
        }
      });
      if (bi !== a.sel) {
        a.sel = bi;
        a.reloadT = 0;
      }
      return;
    }
    ai.target = null;
    // curarse
    if (a.hp + a.shield < 90 && a.drinkT <= 0) {
      const si = a.slots.findIndex((x) => x && ((x.kind === "shield" && a.shield < 60) || (x.kind === "health" && a.hp < 60)));
      if (si >= 0) {
        a.sel = si;
        a.drinkT = 2;
        return;
      }
    }
    if (a.slots[a.sel] && !isGun(a.slots[a.sel]!.kind) && a.drinkT <= 0) {
      const gi = a.slots.findIndex((x) => x && isGun(x.kind));
      if (gi >= 0) a.sel = gi;
    }
    // loot
    const hasGun = a.slots.some((x) => x && isGun(x.kind) && x.kind !== "pistol");
    if (!stormOut && ai.looted < (hasGun ? 4 : 8) && this.phase !== "countdown") {
      if (ai.chest < 0 || this.chests[ai.chest].open) {
        let bc = -1,
          bdist = 95;
        this.chests.forEach((c, i) => {
          if (c.open || ai.skip.has(i)) return;
          if (c.y - heightAt(c.x, c.z) > 1.6) return;
          const d = Math.hypot(c.x - a.x, c.z - a.z);
          if (d < bdist) {
            bdist = d;
            bc = i;
          }
        });
        ai.chest = bc;
      }
      if (ai.chest >= 0) {
        ai.mode = "loot";
        return;
      }
    }
    ai.mode = "roam";
    const d = Math.hypot(ai.wx - a.x, ai.wz - a.z);
    if (d < 5 || (ai.wx === 0 && ai.wz === 0)) {
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.random() * Math.max(2, storm.r * 0.55);
      ai.wx = storm.x + Math.cos(ang) * rr;
      ai.wz = storm.z + Math.sin(ang) * rr;
      // evitar agua profunda
      if (heightAt(ai.wx, ai.wz) < -0.8) {
        ai.wx = storm.x;
        ai.wz = storm.z;
      }
    }
  }

  // ---------------------------------------------------------------- remotos y animación
  private updateRemote(a: Actor, dt: number) {
    const f = Math.min(1, dt * 12);
    a.x += (a.tx - a.x) * f;
    a.y += (a.ty - a.y) * f;
    a.z += (a.tz - a.z) * f;
    a.yaw += angDiff(a.yaw, a.tyaw) * f;
    a.speed = Math.hypot(a.tx - a.x, a.tz - a.z) * 12;
    if (a.fireCd > 0) a.fireCd -= dt;
    this.afterUpdate(a, dt);
  }

  private afterUpdate(a: Actor, dt: number) {
    const rig = a.rig;
    const g = rig.group;
    g.position.set(a.x, a.y, a.z);
    g.rotation.y = a.yaw;
    const it = a.slots[a.sel];
    const gunKind = it && isGun(it.kind) ? it.kind : null;
    setRigGun(rig, gunKind, it ? parseInt(RARITY_COLORS[it.rarity].slice(1), 16) : 0);
    const air = a.state === "fall" || a.state === "glide" || a.state === "wait";
    rig.glider.visible = a.state === "glide" && a.alive;
    const isMe = a.local;
    const hideLocal = isMe && this.fpv();
    g.visible = a.alive || a.deadT < 4;
    rig.body.visible = !hideLocal;
    rig.label.visible = !isMe && a.alive;
    if (!isMe) {
      const me = this.me;
      const team = me && a.team === me.team;
      (rig.label.material as THREE.SpriteMaterial).opacity = 1;
      const d = me ? Math.hypot(me.x - a.x, me.z - a.z) : 0;
      rig.label.visible = a.alive && (team || d < 45);
      rig.label.material.color.set(team ? 0x66ff88 : 0xffffff);
    }
    // animación
    a.walk += a.speed * dt * 1.6;
    const sw = a.onGround ? Math.sin(a.walk) * Math.min(1, a.speed / 6) * 0.9 : 0;
    if (!a.alive) {
      a.deadT += dt;
      rig.body.rotation.x = Math.max(rig.body.rotation.x - dt * 4, -Math.PI / 2);
      rig.body.position.y = 0.3;
      return;
    }
    rig.body.rotation.x = 0;
    rig.body.position.y = a.slideT > 0 ? -0.5 : 0;
    rig.body.rotation.x = a.slideT > 0 ? 0.6 : 0;
    if (air && a.state !== "wait") {
      rig.armL.rotation.set(0, 0, 1.4);
      rig.armR.rotation.set(0, 0, -1.4);
      rig.legL.rotation.x = 0.3;
      rig.legR.rotation.x = -0.3;
      if (a.state === "fall") rig.body.rotation.x = -1.2;
    } else {
      rig.legL.rotation.x = sw;
      rig.legR.rotation.x = -sw;
      rig.armL.rotation.set(-sw * 0.6, 0, 0);
      if (gunKind) {
        a.recoil = Math.max(0, a.recoil - dt * 8);
        rig.armR.rotation.set(Math.PI / 2 * 0.92 + a.pitch * 0.6 + a.recoil * 0.15, 0, 0);
        rig.gunHolder.rotation.x = a.pitch * 0.6 + a.recoil * 0.1;
        rig.gunHolder.position.z = -0.5 + a.recoil * 0.08;
      } else rig.armR.rotation.set(sw * 0.6, 0, 0);
    }
    if (a.drinkT > 0) rig.armR.rotation.set(2.4, 0, 0);
  }

  private updateWorldFx(dt: number) {
    // cofres
    const t = performance.now() / 1000;
    this.chests.forEach((c) => {
      if (!c.open) c.group.children[1].scale.y = 1 + Math.sin(t * 4 + c.x) * 0.15;
    });
    for (const tr of this.tracers) {
      if (tr.life > 0) {
        tr.life -= dt;
        (tr.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, tr.life / 0.09);
        if (tr.life <= 0) tr.mesh.visible = false;
      }
    }
    for (const p of this.puffs) {
      if (p.life > 0) {
        p.life -= dt;
        const k = Math.max(0, p.life / p.max);
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.scale.multiplyScalar(1 - dt * 3);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = k;
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
    // estructuras caducan
    for (let i = this.structs.length - 1; i >= 0; i--) {
      if (this.matchT - this.structs[i].born > 30 && this.phase !== "countdown") {
        this.removeStruct(this.structs[i]);
        this.structs.splice(i, 1);
      }
    }
    for (const f of this.feed) f.t -= dt;
    this.feed = this.feed.filter((f) => f.t > 0);
  }

  private stormDamage(dt: number, storm: ReturnType<Engine["stormAt"]>) {
    const dps = [1, 2, 4, 6, 8, 10, 14][storm.k];
    let anyOut = false;
    for (const a of this.actors) {
      if (!a.alive || a.state === "wait" || !this.simulates(a)) continue;
      const out = Math.hypot(a.x - storm.x, a.z - storm.z) > storm.r;
      if (out) {
        a.stormOut += dt;
        a.stormAcc += dt;
        if (a.local) anyOut = true;
        if (a.stormAcc >= 1) {
          a.stormAcc = 0;
          const dmg = dps * (1 + Math.min(1, a.stormOut / 12));
          this.applyDamage(a, dmg, "storm");
          if (a.local) sound.stormTick();
        }
      } else {
        a.stormOut = Math.max(0, a.stormOut - dt * 2);
        a.stormAcc = 0;
      }
    }
    void anyOut;
  }

  private checkWin(dt: number) {
    this.checkT += dt;
    if (this.checkT < 0.4) return;
    this.checkT = 0;
    const me = this.me!;
    const teams = new Set<number>();
    this.actors.forEach((a) => a.alive && teams.add(a.team));
    if (this.result) return;
    if (teams.size <= 1 && this.phase !== "countdown") {
      const win = teams.has(me.team);
      this.result = { win, place: win ? 1 : 2, kills: me.kills };
      this.phase = "over";
      sound.jingle(win);
      return;
    }
    if (!teams.has(me.team)) {
      this.result = { win: false, place: teams.size + 1, kills: me.kills };
    }
  }

  // ---------------------------------------------------------------- cámara
  private updateSpectator(dt: number) {
    const me = this.me!;
    const [lx, ly] = input.takeLook();
    me.yaw -= lx;
    me.pitch = clamp(me.pitch - ly, -1.2, 1.2);
    me.fireCd -= dt;
    if (!this.spectate || !this.spectate.alive) {
      this.spectate = this.actors.find((a) => a.alive && a.team === me.team) ?? this.actors.find((a) => a.alive) ?? null;
    }
    if (input.firePressed || input.interactPressed) {
      const alive = this.actors.filter((a) => a.alive);
      if (alive.length) this.spectate = alive[(alive.indexOf(this.spectate as Actor) + 1) % alive.length];
    }
  }

  private updateCamera(dt: number, storm: ReturnType<Engine["stormAt"]>) {
    void storm;
    const me = this.me!;
    const cam = this.camera;
    const target = me.alive ? me : this.spectate ?? me;
    const w = this.weaponOf(me);
    const fpv = me.alive && this.fpv();
    const air = target.state === "fall" || target.state === "glide" || target.state === "wait";
    const adsK = this.adsT;
    const zoom = w && me.alive ? 1 + (w.def.zoom - 1) * adsK : 1;
    const baseFov = input.touchMode ? 72 : 78;
    const targetFov = air ? 85 : baseFov / (fpv ? zoom : 1 + (zoom - 1) * 0.5);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 10);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    const yaw = me.alive ? me.yaw : me.yaw;
    const pitch = me.pitch;
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const head = new THREE.Vector3(target.x, target.y + (target.slideT > 0 ? 1.0 : 1.55), target.z);
    if (fpv) {
      cam.position.copy(head);
    } else {
      const dist = air ? 7 : 3.4 - adsK * 1.4;
      const shoulder = air ? 0 : 0.75 - adsK * 0.2;
      const desired = head.clone().addScaledVector(dir, -dist).addScaledVector(right, shoulder);
      desired.y += air ? 0.5 : 0.35;
      // colisión de cámara
      const toCam = desired.clone().sub(head);
      const len = toCam.length();
      toCam.normalize();
      const hitT = this.world.ray(head.x, head.y, head.z, toCam.x, toCam.y, toCam.z, len);
      if (hitT >= 0) desired.copy(head).addScaledVector(toCam, Math.max(0.4, hitT - 0.3));
      const gh = heightAt(desired.x, desired.z);
      if (desired.y < gh + 0.4) desired.y = gh + 0.4;
      cam.position.copy(desired);
    }
    cam.lookAt(cam.position.clone().add(dir));
    // viewmodel
    const showVm = fpv && me.alive && !!w;
    if (showVm && w) {
      if (this.vmKind !== w.it.kind + w.it.rarity) {
        if (this.viewmodel) cam.remove(this.viewmodel);
        this.viewmodel = makeGun(w.it.kind, parseInt(RARITY_COLORS[w.it.rarity].slice(1), 16));
        this.viewmodel.scale.setScalar(1.2);
        cam.add(this.viewmodel);
        this.vmKind = w.it.kind + w.it.rarity;
      }
      const vm = this.viewmodel!;
      const scoped = w.it.kind === "sniper" && adsK > 0.6;
      vm.visible = !scoped;
      this.bobT += dt * me.speed * 1.5;
      const bob = me.onGround ? Math.sin(this.bobT) * 0.01 : 0;
      vm.position.set(0.22 - adsK * 0.22, -0.2 + adsK * 0.07 + bob, -0.5 + me.recoil * 0.07);
      vm.rotation.set(me.recoil * 0.05, 0, 0);
    } else if (this.viewmodel) {
      this.viewmodel.visible = false;
    }
  }

  // ---------------------------------------------------------------- red
  private sendNet() {
    const net = this.cfg?.net;
    const me = this.me;
    if (!net || !me) return;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const row = (a: Actor) => [
      a.id,
      r2(a.x),
      r2(a.y),
      r2(a.z),
      r2(a.yaw),
      r2(a.pitch),
      Math.round(a.hp),
      Math.round(a.shield),
      a.alive ? 1 : 0,
      KIND_CODE.indexOf(a.slots[a.sel]?.kind ?? "pistol"),
      (a.state === "glide" ? 1 : a.state === "fall" ? 2 : 0) + (a.slideT > 0 ? 4 : 0),
      a.slots[a.sel]?.rarity ?? 0,
    ];
    if (net.isHost) {
      const rows = this.actors.filter((a) => this.simulates(a) || a.local || !a.isBot).map(row);
      net.broadcast({ t: "snap", a: rows });
    } else {
      net.sendHost({ t: "st", s: row(me) });
    }
  }

  private applyRow(r: (string | number)[], fromHost: boolean) {
    const a = this.byId.get(r[0] as string);
    if (!a || a.local) return;
    if (!fromHost && a.isBot) return;
    a.tx = r[1] as number;
    a.ty = r[2] as number;
    a.tz = r[3] as number;
    a.tyaw = r[4] as number;
    a.pitch = r[5] as number;
    a.hp = r[6] as number;
    a.shield = r[7] as number;
    const flag = r[10] as number;
    a.state = a.state === "wait" && this.phase === "countdown" ? "wait" : (flag & 3) === 1 ? "glide" : (flag & 3) === 2 ? "fall" : "ground";
    a.onGround = (flag & 3) === 0;
    a.slideT = flag & 4 ? 0.1 : 0;
    const kind = KIND_CODE[r[9] as number] ?? "pistol";
    a.slots[a.sel] = { kind, rarity: ((r[11] as number) ?? 0) as 0 | 1 | 2 | 3, ammo: 10, count: 1 };
    if (a.state !== "wait" && Math.hypot(a.tx - a.x, a.tz - a.z) > 60) {
      a.x = a.tx;
      a.y = a.ty;
      a.z = a.tz;
    }
  }

  onNet = (m: Msg, from: string) => {
    const net = this.cfg?.net;
    if (!net) return;
    switch (m.t) {
      case "st":
        if (net.isHost) this.applyRow(m.s, false);
        break;
      case "snap":
        for (const r of m.a) this.applyRow(r, true);
        break;
      case "shot": {
        const a = this.byId.get(m.id);
        if (!a || a.local) return;
        this.addTracer(new THREE.Vector3(...(m.o as [number, number, number])), new THREE.Vector3(...(m.e as [number, number, number])));
        const me = this.me;
        const d = me ? Math.hypot(me.x - m.o[0], me.z - m.o[2]) : 0;
        sound.shot(m.w, clamp(1 - d / 130, 0, 1) * 0.9);
        a.recoil = 1;
        break;
      }
      case "dmg":
        if (net.isHost) this.routeDamage(m.to, m.dmg, m.from);
        else {
          const t = this.byId.get(m.to);
          if (t && t.local) this.applyDamage(t, m.dmg, m.from);
        }
        break;
      case "kill":
        this.handleKill(m);
        break;
      case "chest":
        this.openChest(m.i, false);
        break;
      case "pick":
        this.removeDrop(m.id);
        break;
      case "wall":
        this.buildStruct(m.k, m.x, m.y, m.z, m.d);
        break;
    }
    void from;
  };

  // ---------------------------------------------------------------- UI
  private drawMinimap(storm: ReturnType<Engine["stormAt"]>) {
    const cv = this.minimap;
    const me = this.me;
    if (!cv || !me) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const S = cv.width;
    const W = (ISLAND_R + 15) * 2;
    const px = (x: number) => (x / W + 0.5) * S;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    g.clip();
    g.drawImage(this.mapBase, 0, 0, S, S);
    // zona
    g.fillStyle = "rgba(160,30,255,0.32)";
    g.beginPath();
    g.rect(0, 0, S, S);
    g.arc(px(storm.x), px(storm.z), (storm.r / W) * S, 0, Math.PI * 2, true);
    g.fill();
    g.strokeStyle = "#c06bff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(px(storm.x), px(storm.z), (storm.r / W) * S, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(px(storm.next.x), px(storm.next.z), (storm.next.r / W) * S, 0, Math.PI * 2);
    g.stroke();
    // nombres de zonas
    g.fillStyle = "#fff";
    g.font = "bold 9px Arial";
    g.textAlign = "center";
    ZONES.forEach((z) => {
      g.fillStyle = z.color;
      g.beginPath();
      g.arc(px(z.x), px(z.z), 3, 0, Math.PI * 2);
      g.fill();
    });
    // waypoint
    if (this.phase === "countdown" || this.phase === "drop") {
      const z = ZONES[this.zone];
      g.strokeStyle = "#ffe600";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px(z.x), px(z.z), 7, 0, Math.PI * 2);
      g.stroke();
    }
    // actores
    for (const a of this.actors) {
      if (!a.alive || a === me) continue;
      if (a.team === me.team) {
        g.fillStyle = "#4ade80";
        g.beginPath();
        g.arc(px(a.x), px(a.z), 3, 0, Math.PI * 2);
        g.fill();
      }
    }
    // yo
    g.save();
    g.translate(px(me.x), px(me.z));
    g.rotate(-me.yaw);
    g.fillStyle = "#fff";
    g.strokeStyle = "#000";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.restore();
  }

  private emitHud(storm: ReturnType<Engine["stormAt"]>) {
    const me = this.me;
    if (!me) return;
    const alive = this.actors.filter((a) => a.alive).length;
    const w = this.weaponOf(me);
    const z = ZONES[this.zone];
    const out = Math.hypot(me.x - storm.x, me.z - storm.z) > storm.r;
    const gh = heightAt(me.x, me.z);
    this.onHud({
      phase: this.phase,
      countdown: Math.max(0, Math.ceil(this.countdown)),
      hp: Math.max(0, Math.round(me.hp)),
      shield: Math.round(me.shield),
      slots: me.slots.map((s) => (s ? { ...s } : null)),
      sel: me.sel,
      alive,
      kills: me.kills,
      stormPhase: storm.k + 1,
      stormTime: Math.ceil(storm.left),
      stormShrinking: storm.shrinking,
      outside: out && me.alive,
      prompt: me.alive ? this.prompt : "",
      feed: this.feed.map((f) => ({ id: f.id, text: f.text })),
      reload: me.reloadT > 0 && w ? 1 - me.reloadT / w.def.reload : 0,
      drink: me.drinkT > 0 ? 1 - me.drinkT / 2 : 0,
      wallCd: this.wallCd / 1.4,
      ads: this.adsT > 0.5,
      scoped: !!w && w.it.kind === "sniper" && this.adsT > 0.6 && me.alive,
      gliding: me.state === "glide",
      falling: me.state === "fall",
      altitude: Math.max(0, Math.round(me.y - gh)),
      wpDist: Math.round(Math.hypot(z.x - me.x, z.z - me.z)),
      result: this.result,
      zone: this.zone,
      netMsg: this.netMsg,
      fpv: this.fpv(),
    });
  }
}
