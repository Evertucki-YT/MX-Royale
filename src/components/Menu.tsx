import { useCallback, useEffect, useRef, useState } from "react";
import { Net, openPublic, hostPrivate, joinPrivate } from "../game/net";
import type { Msg } from "../game/net";
import { BOT_NAMES } from "../game/engine";
import type { MatchConfig, Mode, RosterEntry } from "../game/types";
import { sound } from "../game/audio";

const TOTAL = 20;
const teamSize = (m: Mode) => (m === "solo" ? 1 : m === "duo" ? 2 : 4);

function buildRoster(humans: { id: string; name: string }[], mode: Mode): RosterEntry[] {
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  const list: { id: string; name: string; human: boolean }[] = humans.map((h) => ({ ...h, human: true }));
  let i = 0;
  while (list.length < TOTAL) {
    list.push({ id: `bot${i}`, name: names[i % names.length] + (i >= names.length ? i : ""), human: false });
    i++;
  }
  const ts = teamSize(mode);
  return list.map((p, idx) => ({ ...p, team: Math.floor(idx / ts) }));
}

interface Props {
  touch: boolean;
  setTouch: (v: boolean) => void;
  onStart: (cfg: MatchConfig) => void;
}

type View = "main" | "join" | "busy" | "lobby" | "error";

export default function Menu({ touch, setTouch, onStart }: Props) {
  const [name, setName] = useState(() => localStorage.getItem("mx-name") || "");
  const [mode, setMode] = useState<Mode>("solo");
  const [view, setView] = useState<View>("main");
  const [status, setStatus] = useState("");
  const [code, setCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [players, setPlayers] = useState<string[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [wait, setWait] = useState(6);
  const [err, setErr] = useState("");
  const netRef = useRef<Net | null>(null);
  const humansRef = useRef<{ id: string; name: string }[]>([]);
  const modeRef = useRef<Mode>("solo");
  const startedRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const finalName = () => {
    const n = (name.trim() || "Jugador" + Math.floor(Math.random() * 900 + 100)).slice(0, 12);
    localStorage.setItem("mx-name", name.trim());
    return n;
  };

  const beginAudio = () => {
    sound.init();
    sound.startMusic("menu");
  };

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    netRef.current?.close();
    netRef.current = null;
    humansRef.current = [];
    startedRef.current = false;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const startSolo = () => {
    beginAudio();
    const n = finalName();
    const roster = buildRoster([{ id: "me", name: n }], mode);
    onStart({ mode, roster, seed: Math.floor(Math.random() * 2 ** 31), myId: "me", net: null, isHost: true, touch, dropZone: Math.floor(Math.random() * 4) });
  };

  const hostStart = useCallback(() => {
    const net = netRef.current;
    if (!net || startedRef.current) return;
    startedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    const roster = buildRoster(humansRef.current, modeRef.current);
    const seed = Math.floor(Math.random() * 2 ** 31);
    net.accepting = false;
    net.broadcast({ t: "start", roster, seed, mode: modeRef.current });
    netRef.current = null; // el motor toma el control de la red
    onStart({ mode: modeRef.current, roster, seed, myId: net.myId, net, isHost: true, touch, dropZone: Math.floor(Math.random() * 4) });
  }, [onStart, touch]);

  const setupHost = useCallback(
    (net: Net, myName: string, pub: boolean) => {
      humansRef.current = [{ id: net.myId, name: myName }];
      setPlayers([myName]);
      setIsHost(true);
      setIsPublic(pub);
      const push = () => {
        const names = humansRef.current.map((h) => h.name);
        setPlayers(names);
        net.broadcast({ t: "lobby", players: names, mode: modeRef.current });
      };
      net.onMessage = (m: Msg, from: string) => {
        if (m.t === "hello") {
          if (!humansRef.current.find((h) => h.id === from)) humansRef.current.push({ id: from, name: String(m.name).slice(0, 12) });
          push();
        }
      };
      net.onLeave = (id) => {
        humansRef.current = humansRef.current.filter((h) => h.id !== id);
        push();
      };
      setView("lobby");
      if (pub) {
        setWait(6);
        let left = 6;
        timerRef.current = window.setInterval(() => {
          left--;
          setWait(left);
          if (left <= 0) hostStart();
        }, 1000);
      }
    },
    [hostStart]
  );

  const setupClient = useCallback(
    (net: Net, myName: string) => {
      setIsHost(false);
      if (net.welcome.mode) {
        modeRef.current = net.welcome.mode as Mode;
        setMode(net.welcome.mode as Mode);
      }
      net.onMessage = (m: Msg) => {
        if (m.t === "lobby") {
          setPlayers(m.players);
          if (m.mode) setMode(m.mode);
        } else if (m.t === "start") {
          startedRef.current = true;
          netRef.current = null;
          onStart({ mode: m.mode, roster: m.roster, seed: m.seed, myId: net.myId, net, isHost: false, touch, dropZone: Math.floor(Math.random() * 4) });
        }
      };
      net.onHostClosed = () => {
        if (startedRef.current) return;
        cleanup();
        setErr("El anfitrión cerró la sala.");
        setView("error");
      };
      net.sendHost({ t: "hello", name: myName });
      setView("lobby");
    },
    [onStart, touch, cleanup]
  );

  const startPublic = async () => {
    beginAudio();
    const n = finalName();
    modeRef.current = mode;
    setView("busy");
    setStatus("Conectando con la red P2P...");
    try {
      const net = await openPublic(mode, setStatus);
      netRef.current = net;
      if (net.isHost) setupHost(net, n, true);
      else {
        setIsPublic(true);
        setupClient(net, n);
      }
    } catch {
      setErr("No se pudo conectar con el servidor P2P (¿sin internet?). Puedes jugar contra Bots.");
      setView("error");
    }
  };

  const startPrivate = async () => {
    beginAudio();
    const n = finalName();
    modeRef.current = mode;
    setView("busy");
    setStatus("Creando sala privada...");
    try {
      const { net, code } = await hostPrivate(mode);
      netRef.current = net;
      setCode(code);
      setupHost(net, n, false);
    } catch {
      setErr("No se pudo crear la sala (¿sin conexión al servidor P2P?).");
      setView("error");
    }
  };

  const joinPriv = async () => {
    beginAudio();
    if (joinCode.length < 4) return;
    const n = finalName();
    setView("busy");
    setStatus(`Uniéndose a la sala ${joinCode}...`);
    try {
      const net = await joinPrivate(joinCode);
      netRef.current = net;
      setCode(joinCode.toUpperCase());
      setIsPublic(false);
      setupClient(net, n);
    } catch (e) {
      const msg = (e as Error)?.message === "full" ? "La sala está llena o ya empezó." : "No se encontró la sala. Revisa el código.";
      setErr(msg);
      setView("error");
    }
  };

  const back = () => {
    cleanup();
    setView("main");
  };

  const modes: { id: Mode; label: string; icon: string }[] = [
    { id: "solo", label: "SOLO", icon: "👤" },
    { id: "duo", label: "DÚOS", icon: "👥" },
    { id: "squad", label: "ESCUADRONES", icon: "🛡️" },
  ];

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center overflow-y-auto p-3 bg-gradient-to-b from-black/45 via-black/10 to-black/55" onPointerDown={beginAudio}>
      <div className="my-auto flex w-full max-w-xl flex-col items-center gap-3 py-2">
        {/* LOGO */}
        <div className="animate-floaty text-center">
          <div className="font-blocky logo-text text-5xl sm:text-7xl leading-none">MX ROYALE</div>
          <div className="mx-stripe mx-auto mt-2 h-2 w-64 rounded-full border-2 border-black/60 sm:w-96" />
          <div className="font-blocky mt-2 text-xs text-white drop-shadow sm:text-sm tracking-[0.3em]">BATTLE ROYALE · ISLA MEXICANA</div>
        </div>

        <div className="w-full rounded-3xl border-4 border-white/25 bg-slate-900/70 p-4 shadow-2xl backdrop-blur-md sm:p-5">
          {view === "main" && (
            <div className="flex flex-col gap-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={12}
                placeholder="Tu apodo..."
                className="font-blocky w-full rounded-xl border-4 border-slate-950 bg-white px-4 py-3 text-center text-lg text-slate-900 outline-none placeholder:text-slate-400 focus:ring-4 focus:ring-yellow-300"
              />
              <div className="grid grid-cols-3 gap-2">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`font-blocky rounded-xl border-4 px-1 py-2 text-[11px] sm:text-sm transition ${
                      mode === m.id ? "border-yellow-300 bg-yellow-400 text-slate-900 shadow-[0_0_20px_rgba(250,204,21,0.6)]" : "border-slate-950 bg-slate-700 text-white hover:bg-slate-600"
                    }`}
                  >
                    <div className="text-lg">{m.icon}</div>
                    {m.label}
                  </button>
                ))}
              </div>
              <button onClick={startPublic} className="btn3d bg-gradient-to-b from-yellow-300 to-orange-500 py-4 text-lg sm:text-xl shadow-[0_6px_0_#7c3a00]">
                🌎 Buscar partida pública
              </button>
              <button onClick={startPrivate} className="btn3d bg-gradient-to-b from-sky-400 to-blue-600 py-4 text-lg sm:text-xl shadow-[0_6px_0_#10306e]">
                🔑 Sala privada con amigos
              </button>
              <button onClick={startSolo} className="btn3d bg-gradient-to-b from-lime-400 to-green-600 py-4 text-lg sm:text-xl shadow-[0_6px_0_#0d4a1f]">
                🤖 Jugar solo con bots
              </button>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                <button onClick={() => setView("join")} className="font-blocky rounded-lg bg-slate-700 px-3 py-2 text-white hover:bg-slate-600">
                  Unirme con código
                </button>
                <button onClick={() => setTouch(!touch)} className={`font-blocky rounded-lg px-3 py-2 ${touch ? "bg-emerald-500 text-white" : "bg-slate-700 text-white hover:bg-slate-600"}`}>
                  📱 Modo móvil: {touch ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          )}

          {view === "join" && (
            <div className="flex flex-col gap-3 text-center">
              <div className="font-blocky text-xl text-white">UNIRSE A SALA PRIVADA</div>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
                placeholder="CÓDIGO"
                className="font-blocky w-full rounded-xl border-4 border-slate-950 bg-white px-4 py-3 text-center text-3xl tracking-[0.5em] text-slate-900 outline-none focus:ring-4 focus:ring-sky-300"
              />
              <button onClick={joinPriv} disabled={joinCode.length < 4} className="btn3d bg-gradient-to-b from-sky-400 to-blue-600 py-3 text-lg shadow-[0_6px_0_#10306e] disabled:opacity-40">
                Entrar a la sala
              </button>
              <button onClick={back} className="font-blocky rounded-lg bg-slate-700 py-2 text-white hover:bg-slate-600">
                ← Volver
              </button>
            </div>
          )}

          {view === "busy" && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="h-14 w-14 animate-spin rounded-full border-8 border-white/20 border-t-yellow-300" />
              <div className="font-blocky text-white">{status}</div>
              <button onClick={back} className="font-blocky rounded-lg bg-slate-700 px-5 py-2 text-white hover:bg-slate-600">
                Cancelar
              </button>
            </div>
          )}

          {view === "lobby" && (
            <div className="flex flex-col gap-3 text-center">
              <div className="font-blocky text-xl text-white">{isPublic ? "SALA PÚBLICA" : "SALA PRIVADA"}</div>
              {!isPublic && code && (
                <div>
                  <div className="text-xs text-slate-300">Comparte este código con tus amigos:</div>
                  <div className="font-blocky mt-1 inline-block rounded-2xl border-4 border-yellow-300 bg-slate-950 px-6 py-2 text-5xl tracking-[0.35em] text-yellow-300">{code}</div>
                </div>
              )}
              <div className="text-sm text-slate-200">
                Modo: <b className="text-yellow-300">{mode === "solo" ? "SOLO" : mode === "duo" ? "DÚOS" : "ESCUADRONES"}</b> · Jugadores reales: <b>{players.length}</b> / {TOTAL}
              </div>
              <div className="flex max-h-32 flex-wrap justify-center gap-2 overflow-y-auto">
                {players.map((p, i) => (
                  <span key={i} className="font-blocky animate-popin rounded-full border-2 border-black/50 bg-emerald-500 px-3 py-1 text-sm text-white">
                    {i === 0 ? "👑 " : ""}
                    {p}
                  </span>
                ))}
              </div>
              {isHost && isPublic && (
                <div className="text-sm text-slate-200">
                  Esperando jugadores reales... <b className="text-yellow-300">{Math.max(0, wait)}s</b>
                  <div className="text-xs text-slate-400">Luego se completa con bots hasta {TOTAL} jugadores</div>
                </div>
              )}
              {!isHost && <div className="text-sm text-slate-200">Esperando a que el anfitrión inicie la partida...</div>}
              {isHost && !isPublic && (
                <button onClick={hostStart} className="btn3d bg-gradient-to-b from-lime-400 to-green-600 py-3 text-lg shadow-[0_6px_0_#0d4a1f]">
                  ▶ Iniciar partida (rellena con bots)
                </button>
              )}
              {isHost && isPublic && (
                <button onClick={hostStart} className="btn3d bg-gradient-to-b from-lime-400 to-green-600 py-3 text-lg shadow-[0_6px_0_#0d4a1f]">
                  ▶ Empezar ya
                </button>
              )}
              <button onClick={back} className="font-blocky rounded-lg bg-slate-700 py-2 text-white hover:bg-slate-600">
                ← Salir de la sala
              </button>
            </div>
          )}

          {view === "error" && (
            <div className="flex flex-col gap-3 text-center">
              <div className="text-4xl">⚠️</div>
              <div className="font-blocky text-white">{err}</div>
              <button onClick={startSolo} className="btn3d bg-gradient-to-b from-lime-400 to-green-600 py-3 shadow-[0_6px_0_#0d4a1f]">
                🤖 Jugar contra bots
              </button>
              <button onClick={back} className="font-blocky rounded-lg bg-slate-700 py-2 text-white hover:bg-slate-600">
                ← Volver
              </button>
            </div>
          )}
        </div>

        {/* CRÉDITOS */}
        <div className="rounded-full border-2 border-yellow-300/70 bg-black/60 px-5 py-2 shadow-[0_0_25px_rgba(255,200,0,0.35)] backdrop-blur">
          <span className="font-blocky text-sm sm:text-base credit-shine">✨ Creado por: Ever Baruc ✨</span>
        </div>
        <div className="max-w-md text-center text-[10px] leading-snug text-slate-200/80 sm:text-xs">
          PC: WASD · Espacio saltar · Shift correr/deslizar · Clic disparar · Clic der. apuntar · R recargar · Q pared · F rampa · E cofre · 1-4 armas · V cámara
          <br />
          🎮 Control de Xbox compatible · 📱 Controles táctiles
        </div>
      </div>
    </div>
  );
}
