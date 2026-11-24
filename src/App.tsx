import { useCallback, useEffect, useRef, useState } from "react";
import { Engine } from "./game/engine";
import { sound } from "./game/audio";
import type { HudState, MatchConfig } from "./game/types";
import Menu from "./components/Menu";
import Hud from "./components/Hud";

function detectTouch() {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const [hud, setHud] = useState<HudState | null>(null);
  const [touch, setTouch] = useState(detectTouch);
  const [muted, setMuted] = useState(false);
  const [hit, setHit] = useState({ n: 0, kill: false });
  const [hurt, setHurt] = useState(0);

  useEffect(() => {
    const e = new Engine(canvasRef.current!);
    e.onHud = (h) => setHud(h);
    e.onEvent = (ev) => {
      if (ev === "hurt") setHurt((n) => n + 1);
      else setHit((p) => ({ n: p.n + 1, kill: ev === "kill" }));
    };
    (window as unknown as { __mx?: Engine }).__mx = e;
    setEngine(e);
    return () => e.dispose();
  }, []);

  const start = useCallback(
    (cfg: MatchConfig) => {
      if (!engine) return;
      setHud(null);
      setHit({ n: 0, kill: false });
      setHurt(0);
      engine.startMatch(cfg);
      setScreen("game");
    },
    [engine]
  );

  const exit = useCallback(() => {
    engine?.endMatch(true);
    setScreen("menu");
    setHud(null);
  }, [engine]);

  const toggleMute = () => {
    sound.init();
    const m = !muted;
    setMuted(m);
    sound.setMuted(m);
  };
  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="relative h-full w-full select-none bg-sky-900">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {screen === "menu" && <Menu touch={touch} setTouch={setTouch} onStart={start} />}
      {screen === "game" && engine && hud && <Hud hud={hud} engine={engine} touch={touch} hit={hit} hurt={hurt} onExit={exit} />}
      {/* botones globales */}
      <div className="absolute right-2 top-2 z-40 flex gap-2 sm:right-4 sm:top-3">
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleMute}
          title="Silenciar música"
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/40 bg-black/55 text-lg text-white backdrop-blur hover:bg-black/75"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={fullscreen}
          title="Pantalla completa"
          className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white/40 bg-black/55 text-lg text-white backdrop-blur hover:bg-black/75"
        >
          ⛶
        </button>
      </div>
      {screen === "game" && (
        <div className="pointer-events-none absolute bottom-1 right-2 z-10 text-[10px] font-semibold text-white/60">MX ROYALE · Creado por: Ever Baruc</div>
      )}
    </div>
  );
}
