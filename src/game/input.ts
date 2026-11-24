// Entrada unificada: teclado/ratón, táctil y control de Xbox (Gamepad API)
const dz = (v: number, d = 0.16) => {
  const a = Math.abs(v);
  if (a < d) return 0;
  const n = (a - d) / (1 - d);
  return Math.sign(v) * n;
};

class Input {
  // combinado
  mx = 0;
  my = 0;
  lookX = 0; // radianes acumulados
  lookY = 0;
  fire = false;
  aim = false;
  jumpHeld = false;
  sprint = false;
  // eventos de un solo disparo
  jumpPressed = false;
  reloadPressed = false;
  wallPressed = false;
  rampPressed = false;
  interactPressed = false;
  contextPressed = false;
  slotPressed = -1;
  cyclePressed = 0;
  viewPressed = false;
  firePressed = false;
  // fuentes
  kbx = 0;
  kby = 0;
  touchX = 0;
  touchY = 0;
  touchFire = false;
  touchAim = false;
  touchJump = false;
  touchSprint = false;
  padX = 0;
  padY = 0;
  mouseFire = false;
  mouseAim = false;
  padFire = false;
  padAim = false;
  padJump = false;
  padSprint = false;
  kbJump = false;
  kbSprint = false;
  touchMode = false;
  padConnected = false;
  locked = false;
  wantLock = false;
  sens = 0.0023;
  private keys = new Set<string>();
  private prevBtn: boolean[] = [];
  private attached = false;
  canvas: HTMLElement | null = null;

  attach(canvas: HTMLElement) {
    if (this.attached) return;
    this.attached = true;
    this.canvas = canvas;
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (["Space", "ArrowUp", "ArrowDown", "Tab"].includes(k) && this.wantLock) e.preventDefault();
      this.keys.add(k);
      if (k === "Space") this.jumpPressed = true;
      if (k === "KeyR") this.reloadPressed = true;
      if (k === "KeyQ") this.wallPressed = true;
      if (k === "KeyF") this.rampPressed = true;
      if (k === "KeyE") this.interactPressed = true;
      if (k === "KeyV") this.viewPressed = true;
      if (k === "Digit1") this.slotPressed = 0;
      if (k === "Digit2") this.slotPressed = 1;
      if (k === "Digit3") this.slotPressed = 2;
      if (k === "Digit4") this.slotPressed = 3;
      this.recalcKeys();
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.recalcKeys();
    });
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.recalcKeys();
      this.mouseFire = false;
      this.mouseAim = false;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (this.touchMode) return;
      if (!this.locked && this.wantLock) {
        canvas.requestPointerLock?.();
        return;
      }
      if (e.button === 0) {
        this.mouseFire = true;
        this.firePressed = true;
      }
      if (e.button === 2) this.mouseAim = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseFire = false;
      if (e.button === 2) this.mouseAim = false;
    });
    window.addEventListener("mousemove", (e) => {
      if (this.locked) {
        this.lookX += e.movementX * this.sens;
        this.lookY += e.movementY * this.sens;
      }
    });
    window.addEventListener("wheel", (e) => {
      if (this.wantLock) this.cyclePressed = e.deltaY > 0 ? 1 : -1;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.mouseFire = false;
        this.mouseAim = false;
      }
    });
    window.addEventListener("gamepadconnected", () => (this.padConnected = true));
    window.addEventListener("gamepaddisconnected", () => (this.padConnected = false));
  }

  private recalcKeys() {
    const k = this.keys;
    this.kbx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    this.kby = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    this.kbJump = k.has("Space");
    this.kbSprint = k.has("ShiftLeft") || k.has("ShiftRight");
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  pollPad(dt: number) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let p: Gamepad | null = null;
    for (const g of pads) if (g && g.connected) {
      p = g;
      break;
    }
    if (!p) {
      this.padX = this.padY = 0;
      this.padFire = this.padAim = this.padJump = this.padSprint = false;
      return;
    }
    this.padConnected = true;
    const b = (i: number) => !!p!.buttons[i]?.pressed;
    const v = (i: number) => p!.buttons[i]?.value ?? 0;
    this.padX = dz(p.axes[0] ?? 0);
    this.padY = -dz(p.axes[1] ?? 0);
    const rx = dz(p.axes[2] ?? 0, 0.14),
      ry = dz(p.axes[3] ?? 0, 0.14);
    // curva suave para mayor precisión
    const sp = this.padAim ? 1.4 : 2.9;
    this.lookX += Math.sign(rx) * Math.pow(Math.abs(rx), 1.6) * sp * dt;
    this.lookY += Math.sign(ry) * Math.pow(Math.abs(ry), 1.6) * sp * dt;
    this.padFire = v(7) > 0.35;
    this.padAim = v(6) > 0.35;
    this.padJump = b(0);
    this.padSprint = b(10);
    const edge = (i: number) => b(i) && !this.prevBtn[i];
    if (edge(0)) this.jumpPressed = true;
    if (edge(1)) this.wallPressed = true;
    if (edge(2)) this.contextPressed = true;
    if (edge(3)) this.cyclePressed = 1;
    if (edge(4)) this.cyclePressed = -1;
    if (edge(5)) this.cyclePressed = 1;
    if (edge(12)) this.rampPressed = true;
    if (edge(14)) this.slotPressed = 0;
    if (edge(15)) this.slotPressed = 1;
    this.prevBtn = p.buttons.map((x) => x.pressed);
  }

  /** combina las fuentes; llamar una vez por frame */
  update(dt: number) {
    this.pollPad(dt);
    const sources: [number, number][] = [
      [this.kbx, this.kby],
      [this.touchX, this.touchY],
      [this.padX, this.padY],
    ];
    let best: [number, number] = [0, 0];
    for (const s of sources) if (Math.hypot(s[0], s[1]) > Math.hypot(best[0], best[1])) best = s;
    this.mx = best[0];
    this.my = best[1];
    const wasFire = this.fire;
    this.fire = this.mouseFire || this.touchFire || this.padFire;
    if (this.fire && !wasFire) this.firePressed = true;
    this.aim = this.mouseAim || this.touchAim || this.padAim;
    this.jumpHeld = this.kbJump || this.touchJump || this.padJump;
    this.sprint = this.kbSprint || this.touchSprint || this.padSprint;
  }

  clearEvents() {
    this.jumpPressed = false;
    this.reloadPressed = false;
    this.wallPressed = false;
    this.rampPressed = false;
    this.interactPressed = false;
    this.contextPressed = false;
    this.slotPressed = -1;
    this.cyclePressed = 0;
    this.viewPressed = false;
    this.firePressed = false;
  }
  takeLook(): [number, number] {
    const r: [number, number] = [this.lookX, this.lookY];
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }
}

export const input = new Input();
