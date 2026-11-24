import { useRef, useState } from "react";
import { input } from "../game/input";
import type { Engine } from "../game/engine";

const LOOK_SENS = 0.0048;

interface Props {
  engine: Engine;
  hasPrompt: boolean;
  falling: boolean;
}

export default function TouchControls({ engine, hasPrompt, falling }: Props) {
  const baseRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const joy = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const [auto, setAuto] = useState(true);
  const [aim, setAim] = useState(false);
  const [joyShown, setJoyShown] = useState(false);
  const R = 62;

  const place = (x: number, y: number) => {
    if (baseRef.current) {
      baseRef.current.style.left = x - R + "px";
      baseRef.current.style.top = y - R + "px";
    }
  };
  const down = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (e.clientX < window.innerWidth / 2) {
      if (joy.current) return;
      joy.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      place(e.clientX, e.clientY);
      setJoyShown(true);
      if (thumbRef.current) thumbRef.current.style.transform = "translate(0px,0px)";
    } else if (!look.current) {
      look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  };
  const move = (e: React.PointerEvent) => {
    const j = joy.current;
    if (j && j.id === e.pointerId) {
      let dx = e.clientX - j.ox,
        dy = e.clientY - j.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // joystick flotante: la base sigue al dedo
        const k = (d - R) / d;
        j.ox += dx * k;
        j.oy += dy * k;
        place(j.ox, j.oy);
        dx = e.clientX - j.ox;
        dy = e.clientY - j.oy;
      }
      input.touchX = dx / R;
      input.touchY = -dy / R;
      if (thumbRef.current) thumbRef.current.style.transform = `translate(${dx}px,${dy}px)`;
    }
    const l = look.current;
    if (l && l.id === e.pointerId) {
      input.lookX += (e.clientX - l.x) * LOOK_SENS;
      input.lookY += (e.clientY - l.y) * LOOK_SENS;
      l.x = e.clientX;
      l.y = e.clientY;
    }
  };
  const up = (e: React.PointerEvent) => {
    if (joy.current && joy.current.id === e.pointerId) {
      joy.current = null;
      input.touchX = 0;
      input.touchY = 0;
      setJoyShown(false);
    }
    if (look.current && look.current.id === e.pointerId) look.current = null;
  };

  // botones con arrastre para mirar
  const btnLook = useRef<{ id: number; x: number; y: number } | null>(null);
  const holdBtn = (onDown: () => void, onUp: () => void, lookToo = false) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      if (lookToo) btnLook.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      onDown();
    },
    onPointerMove: (e: React.PointerEvent) => {
      const l = btnLook.current;
      if (lookToo && l && l.id === e.pointerId) {
        input.lookX += (e.clientX - l.x) * LOOK_SENS;
        input.lookY += (e.clientY - l.y) * LOOK_SENS;
        l.x = e.clientX;
        l.y = e.clientY;
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      if (btnLook.current?.id === e.pointerId) btnLook.current = null;
      onUp();
    },
    onPointerCancel: () => {
      btnLook.current = null;
      onUp();
    },
  });

  const btn = "absolute flex items-center justify-center rounded-full border-2 border-white/50 bg-white/15 text-white backdrop-blur-[2px] active:bg-white/40 font-blocky select-none touch-none";

  return (
    <div className="absolute inset-0 z-10" style={{ touchAction: "none" }}>
      {/* capa de gestos: izquierda=joystick, derecha=cámara */}
      <div className="absolute inset-0 touch-none" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div ref={baseRef} className={`pointer-events-none absolute h-[124px] w-[124px] rounded-full border-4 border-white/40 bg-white/10 transition-opacity ${joyShown ? "opacity-100" : "opacity-0"}`}>
        <div ref={thumbRef} className="absolute left-1/2 top-1/2 -ml-[27px] -mt-[27px] h-[54px] w-[54px] rounded-full border-2 border-white/70 bg-white/40" />
      </div>
      {!joyShown && (
        <div className="pointer-events-none absolute bottom-24 left-10 h-[110px] w-[110px] rounded-full border-2 border-dashed border-white/25 bg-white/5" />
      )}

      {/* botones derecha */}
      <div className="pointer-events-none absolute bottom-3 right-3 h-[250px] w-[270px]">
        <div
          {...holdBtn(
            () => {
              input.touchFire = true;
            },
            () => {
              input.touchFire = false;
            },
            true
          )}
          className={`${btn} pointer-events-auto bottom-4 right-14 h-[92px] w-[92px] border-red-300/80 bg-red-500/35 text-3xl`}
        >
          🔥
          <span className="absolute -bottom-4 text-[10px] opacity-80">DISPARAR</span>
        </div>
        <div
          {...holdBtn(
            () => {
              input.touchJump = true;
              input.jumpPressed = true;
            },
            () => {
              input.touchJump = false;
            }
          )}
          className={`${btn} pointer-events-auto bottom-[112px] right-2 h-[70px] w-[70px] text-2xl`}
        >
          ⤒<span className="absolute -bottom-3.5 text-[9px] opacity-80">{falling ? "PLANEAR" : "SALTAR"}</span>
        </div>
        <div
          {...holdBtn(
            () => {
              const v = !input.touchAim;
              input.touchAim = v;
              setAim(v);
            },
            () => {}
          )}
          className={`${btn} pointer-events-auto bottom-[118px] right-[104px] h-[66px] w-[66px] text-2xl ${aim ? "!bg-sky-400/50 !border-sky-200" : ""}`}
        >
          🎯<span className="absolute -bottom-3.5 text-[9px] opacity-80">APUNTAR</span>
        </div>
        <div
          {...holdBtn(
            () => engine.doWall("wall"),
            () => {}
          )}
          className={`${btn} pointer-events-auto bottom-[20px] right-[170px] h-[66px] w-[66px] text-2xl`}
        >
          🧱<span className="absolute -bottom-3.5 text-[9px] opacity-80">PARED</span>
        </div>
        <div
          {...holdBtn(
            () => engine.doWall("ramp"),
            () => {}
          )}
          className={`${btn} pointer-events-auto bottom-[100px] right-[190px] h-[42px] w-[42px] text-base`}
        >
          ◢
        </div>
        <div
          {...holdBtn(
            () => {
              input.reloadPressed = true;
            },
            () => {}
          )}
          className={`${btn} pointer-events-auto bottom-[195px] right-[130px] h-[44px] w-[44px] text-lg`}
        >
          ⟳
        </div>
      </div>

      {/* auto-disparo y cámara */}
      <div className="absolute right-3 top-28 flex flex-col items-end gap-2">
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            const v = !auto;
            setAuto(v);
            engine.autoFire = v;
          }}
          className={`font-blocky rounded-full border-2 px-3 py-1 text-[11px] backdrop-blur ${auto ? "border-emerald-300 bg-emerald-500/50 text-white" : "border-white/40 bg-black/40 text-white/80"}`}
        >
          AUTO-DISPARO: {auto ? "ON" : "OFF"}
        </button>
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            engine.toggleView();
          }}
          className="font-blocky rounded-full border-2 border-white/40 bg-black/40 px-3 py-1 text-[11px] text-white/90 backdrop-blur"
        >
          👁 CÁMARA
        </button>
      </div>

      {hasPrompt && (
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            engine.interact();
          }}
          className="font-blocky absolute bottom-40 left-1/2 -translate-x-1/2 rounded-2xl border-4 border-yellow-200 bg-yellow-400/80 px-6 py-3 text-lg text-slate-900 shadow-lg animate-popin"
        >
          ABRIR
        </button>
      )}
    </div>
  );
}
