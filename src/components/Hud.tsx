import { useEffect, useRef, useState } from "react";
import { input } from "../game/input";
import type { Engine } from "../game/engine";
import { RARITY_COLORS, RARITY_NAMES, WEAPONS, ZONES } from "../game/types";
import type { HudState, Item } from "../game/types";
import TouchControls from "./TouchControls";

interface Props {
  hud: HudState;
  engine: Engine;
  touch: boolean;
  hit: { n: number; kill: boolean };
  hurt: number;
  onExit: () => void;
}

const ICONS: Record<string, string> = { pistol: "🔫", ar: "🔫", shotgun: "💥", smg: "⚡", sniper: "🎯", shield: "🧪", health: "🧪" };
const LABEL: Record<string, string> = { pistol: "Pistola", ar: "Rifle", shotgun: "Escopeta", smg: "Uzi", sniper: "Sniper", shield: "Escudo", health: "Vida" };

function Slot({ it, i, sel, onTap }: { it: Item | null; i: number; sel: boolean; onTap: () => void }) {
  const isPotion = it && (it.kind === "shield" || it.kind === "health");
  const col = it ? (isPotion ? (it.kind === "shield" ? "#3b82f6" : "#22c55e") : RARITY_COLORS[it.rarity]) : "#475569";
  return (
    <button
      onPointerDown={(e) => {
        e.stopPropagation();
        onTap();
      }}
      className="relative flex h-14 w-14 flex-col items-center justify-center rounded-xl border-4 bg-slate-900/70 text-white backdrop-blur-sm transition sm:h-16 sm:w-16"
      style={{ borderColor: sel ? "#fde047" : col, boxShadow: sel ? `0 0 14px #fde047, inset 0 0 12px ${col}88` : `inset 0 0 10px ${col}55`, transform: sel ? "translateY(-6px) scale(1.08)" : undefined }}
    >
      <span className="absolute left-1 top-0 text-[10px] font-bold text-white/70">{i + 1}</span>
      {it ? (
        <>
          <span className="text-xl leading-none sm:text-2xl" style={{ filter: isPotion ? (it.kind === "shield" ? "hue-rotate(0deg)" : "hue-rotate(-90deg)") : "none" }}>
            {ICONS[it.kind]}
          </span>
          <span className="font-blocky mt-0.5 text-[8px] leading-none" style={{ color: col }}>
            {LABEL[it.kind]}
          </span>
          <span className="absolute bottom-0 right-1 text-[10px] font-bold text-white">{isPotion ? "x" + it.count : it.ammo}</span>
        </>
      ) : (
        <span className="text-slate-500">—</span>
      )}
    </button>
  );
}

export default function Hud({ hud, engine, touch, hit, hurt, onExit }: Props) {
  const mapRef = useRef<HTMLCanvasElement>(null);
  const [locked, setLocked] = useState(false);
  const [hideResult, setHideResult] = useState(false);

  useEffect(() => {
    engine.minimap = mapRef.current;
    return () => {
      engine.minimap = null;
    };
  }, [engine]);
  useEffect(() => {
    const t = setInterval(() => setLocked(input.locked), 150);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!hud.result) setHideResult(false);
  }, [hud.result]);

  const sel = hud.slots[hud.sel];
  const gun = sel && WEAPONS[sel.kind];
  const needLock = !touch && input.wantLock && !locked && !hud.result;
  const showResult = hud.result && !(hideResult && !hud.result.win);
  const phaseLabel = hud.stormShrinking ? "LA TORMENTA SE CIERRA" : "TORMENTA EN";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden text-white">
      {/* viñetas */}
      {hud.outside && <div className="animate-storm absolute inset-0" style={{ boxShadow: "inset 0 0 160px 60px rgba(190,30,255,0.85)" }} />}
      {hurt > 0 && <div key={hurt} className="animate-hurt absolute inset-0" style={{ boxShadow: "inset 0 0 140px 40px rgba(255,0,0,0.9)" }} />}
      {hud.scoped && (
        <div className="absolute inset-0 bg-black" style={{ maskImage: "radial-gradient(circle at center, transparent 0, transparent 30vmin, black 30.5vmin)", WebkitMaskImage: "radial-gradient(circle at center, transparent 0, transparent 30vmin, black 30.5vmin)" }}>
          <div className="absolute left-1/2 top-0 h-full w-px bg-black/80" />
        </div>
      )}
      {hud.scoped && (
        <>
          <div className="absolute left-1/2 top-1/2 h-px w-[60vmin] -translate-x-1/2 bg-black" />
          <div className="absolute left-1/2 top-1/2 h-[60vmin] w-px -translate-y-1/2 bg-black" />
        </>
      )}

      {/* mira */}
      {!hud.scoped && hud.phase !== "countdown" && !hud.falling && !hud.gliding && !hud.result?.win && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`rounded-full border-2 border-white/90 transition-all ${hud.ads ? "h-2 w-2" : "h-4 w-4"}`} style={{ boxShadow: "0 0 3px #000" }} />
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
        </div>
      )}
      {/* hitmarker */}
      {hit.n > 0 && (
        <div key={hit.n} className="animate-hit absolute left-1/2 top-1/2" style={{ width: hit.kill ? 48 : 34, height: hit.kill ? 48 : 34 }}>
          <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 rotate-45 rounded bg-red-600" style={{ boxShadow: "0 0 4px #fff" }} />
          <div className="absolute left-0 top-1/2 h-1 w-full -translate-y-1/2 -rotate-45 rounded bg-red-600" style={{ boxShadow: "0 0 4px #fff" }} />
        </div>
      )}

      {/* minimapa */}
      <div className="absolute left-2 top-2 sm:left-4 sm:top-4">
        <div className="rounded-full border-4 border-slate-900 bg-slate-900/60 p-0.5 shadow-xl">
          <canvas ref={mapRef} width={160} height={160} className="h-[100px] w-[100px] rounded-full sm:h-[150px] sm:w-[150px]" />
        </div>
      </div>

      {/* estado central superior */}
      <div className="absolute left-1/2 top-2 flex -translate-x-1/2 flex-col items-center gap-1 sm:top-3">
        <div className="flex items-center gap-2">
          <div className="font-blocky rounded-lg border-2 border-black/60 bg-slate-900/80 px-3 py-1 text-sm">👥 {hud.alive}</div>
          <div className="font-blocky rounded-lg border-2 border-black/60 bg-slate-900/80 px-3 py-1 text-sm">💀 {hud.kills}</div>
        </div>
        {hud.phase !== "countdown" && (
          <div className={`font-blocky rounded-lg border-2 border-black/60 px-3 py-1 text-[11px] sm:text-xs ${hud.stormShrinking ? "bg-purple-700/90" : "bg-slate-900/80"}`}>
            🌪 {phaseLabel} <b className="text-yellow-300">{hud.stormTime}s</b> · FASE {hud.stormPhase}
          </div>
        )}
      </div>

      {/* feed */}
      <div className="absolute right-3 top-14 flex max-w-[55vw] flex-col items-end gap-1 sm:top-16">
        {hud.feed.map((f) => (
          <div key={f.id} className="animate-slide rounded bg-black/55 px-2 py-0.5 text-[11px] font-semibold sm:text-xs">
            {f.text}
          </div>
        ))}
      </div>

      {/* descenso */}
      {(hud.falling || hud.gliding) && (
        <div className="absolute left-1/2 top-24 flex -translate-x-1/2 flex-col items-center gap-1 text-center sm:top-28">
          <div className="font-blocky rounded-xl border-2 border-black/60 bg-slate-900/80 px-4 py-1 text-sm" style={{ color: ZONES[hud.zone].color }}>
            ➤ {ZONES[hud.zone].name} · {hud.wpDist}m
          </div>
          <div className="rounded bg-black/50 px-2 py-0.5 text-xs">Altura {hud.altitude}m · {hud.falling ? (touch ? "Toca SALTAR para abrir el planeador" : "ESPACIO / A: abrir planeador") : "Planeando"}</div>
          <div className="rounded bg-black/40 px-2 py-0.5 text-[10px]">Mira hacia la zona y avanza (W / joystick arriba)</div>
        </div>
      )}

      {/* elegir zona */}
      {hud.phase === "countdown" && !hud.result && (
        <div className="pointer-events-auto absolute inset-x-0 top-1/4 flex flex-col items-center gap-3 px-3">
          <div className="font-blocky text-2xl text-white drop-shadow-[0_3px_0_#000] sm:text-4xl">¡SALTO EN {hud.countdown}!</div>
          <div className="font-blocky text-xs text-yellow-200 sm:text-sm">ELIGE TU ZONA DE CAÍDA</div>
          <div className="grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-4">
            {ZONES.map((z, i) => (
              <button
                key={z.name}
                onClick={() => engine.setZone(i)}
                className={`font-blocky rounded-xl border-4 px-2 py-2 text-[11px] transition sm:text-xs ${hud.zone === i ? "scale-105 border-yellow-300 text-slate-900" : "border-black/70 bg-slate-800/90 text-white hover:bg-slate-700"}`}
                style={hud.zone === i ? { background: z.color } : undefined}
              >
                {z.name}
              </button>
            ))}
          </div>
          <button onClick={() => {
              engine.skipCountdown();
              if (!touch) setTimeout(() => engine.canvas.requestPointerLock?.(), 0);
            }} className="btn3d bg-gradient-to-b from-orange-400 to-red-600 px-8 py-2 shadow-[0_5px_0_#6b1d0a]">
            🪂 ¡Saltar ya!
          </button>
        </div>
      )}

      {/* barras de vida */}
      <div className={`absolute left-2 w-[42vw] max-w-[260px] sm:left-4 ${touch ? "bottom-[88px]" : "bottom-24"}`}>
        <div className="mb-1 h-5 overflow-hidden rounded-md border-2 border-black/70 bg-black/60">
          <div className="relative h-full bg-gradient-to-b from-sky-300 to-blue-600 transition-all" style={{ width: hud.shield + "%" }}>
            <span className="absolute inset-0 flex items-center pl-2 text-[11px] font-bold">🛡 {hud.shield}</span>
          </div>
        </div>
        <div className="h-5 overflow-hidden rounded-md border-2 border-black/70 bg-black/60">
          <div className="relative h-full bg-gradient-to-b from-lime-300 to-green-600 transition-all" style={{ width: hud.hp + "%" }}>
            <span className="absolute inset-0 flex items-center pl-2 text-[11px] font-bold">❤ {hud.hp}</span>
          </div>
        </div>
      </div>

      {/* munición / rareza */}
      {gun && sel && (
        <div className="absolute bottom-[88px] right-[calc(50%-150px)] hidden text-right sm:block">
          <div className="font-blocky text-sm drop-shadow" style={{ color: RARITY_COLORS[sel.rarity] }}>
            {RARITY_NAMES[sel.rarity]} · {gun.name}
          </div>
          <div className="font-blocky text-2xl">
            {sel.ammo}
            <span className="text-sm text-white/60"> / {gun.mag}</span>
          </div>
        </div>
      )}

      {/* progreso de recarga / poción */}
      {(hud.reload > 0 || hud.drink > 0) && (
        <div className="absolute left-1/2 top-[58%] w-48 -translate-x-1/2">
          <div className="font-blocky mb-1 text-center text-xs drop-shadow">{hud.drink > 0 ? "BEBIENDO..." : "RECARGANDO..."}</div>
          <div className="h-3 overflow-hidden rounded-full border-2 border-black/70 bg-black/60">
            <div className={`h-full ${hud.drink > 0 ? "bg-sky-400" : "bg-yellow-300"}`} style={{ width: (hud.drink > 0 ? hud.drink : hud.reload) * 100 + "%" }} />
          </div>
        </div>
      )}

      {/* prompt */}
      {hud.prompt && !touch && (
        <div className="font-blocky absolute bottom-40 left-1/2 -translate-x-1/2 rounded-xl border-2 border-yellow-300 bg-black/70 px-4 py-2 text-sm text-yellow-200">{hud.prompt}</div>
      )}
      {hud.prompt && touch && (
        <div className="font-blocky absolute bottom-[205px] left-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-3 py-1 text-xs text-yellow-200">{hud.prompt.replace("Toca ABRIR", "Cofre")}</div>
      )}

      {/* enfriamiento de pared (PC) */}
      {!touch && hud.wallCd > 0 && (
        <div className="absolute bottom-28 right-4 h-2 w-20 overflow-hidden rounded bg-black/60">
          <div className="h-full bg-cyan-300" style={{ width: (1 - hud.wallCd) * 100 + "%" }} />
        </div>
      )}

      {/* barra de armas */}
      <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
        {hud.slots.map((s, i) => (
          <Slot key={i} it={s} i={i} sel={hud.sel === i} onTap={() => engine.selectSlot(i)} />
        ))}
      </div>

      {/* controles táctiles */}
      {touch && !hud.result && <TouchControls engine={engine} hasPrompt={!!hud.prompt} falling={hud.falling || hud.gliding} />}

      {/* clic para jugar / pausa */}
      {needLock && (
        <div
          className="pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-[2px]"
          onClick={() => engine.canvas.requestPointerLock?.()}
        >
          <div className="font-blocky text-3xl">HAZ CLIC PARA JUGAR</div>
          <div className="text-sm text-white/80">ESC para pausar · WASD mover · Clic disparar · Q pared · E cofre</div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onExit();
            }}
            className="btn3d bg-slate-700 px-6 py-2 text-sm shadow-[0_4px_0_#111]"
          >
            Salir al menú
          </button>
        </div>
      )}

      {/* red */}
      {hud.netMsg && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/70">
          <div className="font-blocky text-xl text-center px-4">{hud.netMsg}</div>
          <button onClick={onExit} className="btn3d bg-gradient-to-b from-sky-400 to-blue-600 px-8 py-3 shadow-[0_5px_0_#10306e]">
            Volver al menú
          </button>
        </div>
      )}

      {/* resultado */}
      {showResult && hud.result && (
        <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm">
          <div className={`animate-popin mx-3 flex max-w-lg flex-col items-center gap-3 rounded-3xl border-4 p-6 text-center shadow-2xl ${hud.result.win ? "border-yellow-300 bg-gradient-to-b from-yellow-500/40 to-orange-700/50" : "border-red-400 bg-slate-900/90"}`}>
            {hud.result.win ? (
              <>
                <div className="font-blocky logo-text text-5xl sm:text-7xl">¡BOOYAH!</div>
                <div className="font-blocky text-xl text-yellow-200 sm:text-3xl drop-shadow">¡VICTORIA MAGISTRAL!</div>
                <div className="mx-stripe h-2 w-48 rounded-full border-2 border-black/60" />
                <div className="font-blocky text-lg">🏆 PUESTO #1 · 💀 {hud.result.kills} eliminaciones</div>
              </>
            ) : (
              <>
                <div className="font-blocky text-4xl text-red-400 drop-shadow sm:text-5xl">ELIMINADO</div>
                <div className="font-blocky text-xl">Puesto #{hud.result.place} de 20</div>
                <div className="text-lg">💀 {hud.result.kills} eliminaciones</div>
              </>
            )}
            <div className="rounded-full border-2 border-yellow-300/70 bg-black/60 px-5 py-2">
              <span className="font-blocky text-base credit-shine">✨ Creado por: Ever Baruc ✨</span>
            </div>
            <div className="flex gap-3">
              <button onClick={onExit} className="btn3d bg-gradient-to-b from-lime-400 to-green-600 px-6 py-3 shadow-[0_5px_0_#0d4a1f]">
                🏠 Menú principal
              </button>
              {!hud.result.win && (
                <button onClick={() => setHideResult(true)} className="btn3d bg-slate-700 px-6 py-3 shadow-[0_5px_0_#111]">
                  👁 Seguir viendo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {hud.result && !hud.result.win && hideResult && (
        <button onClick={onExit} className="btn3d pointer-events-auto absolute bottom-24 right-3 bg-slate-700 px-4 py-2 text-xs shadow-[0_4px_0_#111]">
          Salir
        </button>
      )}
    </div>
  );
}
