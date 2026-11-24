import Peer from "peerjs";
import type { DataConnection } from "peerjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Msg = { t: string; r?: boolean; [k: string]: any };

/** Capa P2P sobre PeerJS: topología en estrella (host + clientes). */
export class Net {
  peer: Peer;
  isHost = false;
  myId = "";
  conns = new Map<string, DataConnection>();
  hostConn: DataConnection | null = null;
  accepting = true;
  maxPlayers = 20;
  welcome: Msg = { t: "welcome" };
  onMessage: (m: Msg, from: string) => void = () => {};
  onJoin: (id: string) => void = () => {};
  onLeave: (id: string) => void = () => {};
  onHostClosed: () => void = () => {};
  closed = false;

  constructor(peer: Peer) {
    this.peer = peer;
    this.myId = peer.id;
  }

  static host(id: string): Promise<Net> {
    return new Promise((resolve, reject) => {
      let peer: Peer;
      try {
        peer = new Peer(id);
      } catch (e) {
        reject(e);
        return;
      }
      const to = window.setTimeout(() => {
        peer.destroy();
        reject(new Error("timeout"));
      }, 8000);
      peer.on("open", () => {
        clearTimeout(to);
        const n = new Net(peer);
        n.isHost = true;
        peer.on("connection", (c) => n.accept(c));
        peer.on("error", () => {});
        resolve(n);
      });
      peer.on("error", (err) => {
        clearTimeout(to);
        peer.destroy();
        reject(err);
      });
    });
  }

  static join(id: string, timeout = 7000): Promise<Net> {
    return new Promise((resolve, reject) => {
      let peer: Peer;
      let done = false;
      try {
        peer = new Peer();
      } catch (e) {
        reject(e);
        return;
      }
      const fail = (e: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(to);
        try {
          peer.destroy();
        } catch {
          /* */
        }
        reject(e);
      };
      const to = window.setTimeout(() => fail(new Error("timeout")), timeout);
      peer.on("error", (err) => fail(err));
      peer.on("open", () => {
        const conn = peer.connect(id, { reliable: true });
        const n = new Net(peer);
        n.hostConn = conn;
        let pending: Msg[] = [];
        conn.on("data", (d) => {
          const m = d as Msg;
          if (!done) {
            if (m.t === "full") return fail(new Error("full"));
            if (m.t === "welcome") {
              done = true;
              clearTimeout(to);
              n.welcome = m;
              resolve(n);
              return;
            }
          }
          if (done) n.onMessage(m, id);
          else pending.push(m);
        });
        conn.on("close", () => {
          if (!done) fail(new Error("closed"));
          else if (!n.closed) n.onHostClosed();
        });
        conn.on("error", () => {
          if (!done) fail(new Error("conn"));
        });
        pending = [];
      });
    });
  }

  private accept(c: DataConnection) {
    c.on("open", () => {
      if (!this.accepting || this.conns.size >= this.maxPlayers - 1) {
        c.send({ t: "full" });
        setTimeout(() => c.close(), 300);
        return;
      }
      this.conns.set(c.peer, c);
      c.send(this.welcome);
      this.onJoin(c.peer);
    });
    c.on("data", (d) => {
      const m = d as Msg;
      if (m.r) this.broadcast(m, c.peer);
      this.onMessage(m, c.peer);
    });
    const left = () => {
      if (this.conns.delete(c.peer)) this.onLeave(c.peer);
    };
    c.on("close", left);
    c.on("error", left);
  }

  broadcast(m: Msg, except?: string) {
    this.conns.forEach((c, id) => {
      if (id !== except && c.open) c.send(m);
    });
  }
  sendTo(id: string, m: Msg) {
    const c = this.conns.get(id);
    if (c && c.open) c.send(m);
  }
  sendHost(m: Msg) {
    if (this.hostConn && this.hostConn.open) this.hostConn.send(m);
  }
  /** Cliente → host; host → todos. relay=true: el host lo reenvía a los demás clientes */
  send(m: Msg, relay = false) {
    if (this.isHost) this.broadcast(m);
    else this.sendHost(relay ? { ...m, r: true } : m);
  }

  close() {
    this.closed = true;
    try {
      this.conns.forEach((c) => c.close());
      this.hostConn?.close();
      this.peer.destroy();
    } catch {
      /* */
    }
  }
}

/** Busca sala pública; si no hay ninguna abierta crea una como host. */
export async function openPublic(mode: string, onStatus: (s: string) => void): Promise<Net> {
  for (let i = 0; i < 3; i++) {
    onStatus(`Buscando sala pública ${i + 1}/3...`);
    try {
      return await Net.join(`mx-royale-pub-${i}`, 5000);
    } catch {
      /* siguiente */
    }
  }
  for (let i = 0; i < 3; i++) {
    onStatus(`Creando sala pública ${i + 1}...`);
    try {
      const n = await Net.host(`mx-royale-pub-${i}`);
      n.welcome = { t: "welcome", mode };
      return n;
    } catch {
      /* siguiente */
    }
  }
  throw new Error("No se pudo crear sala");
}

export function randomCode(): string {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
  return s;
}

export async function hostPrivate(mode: string): Promise<{ net: Net; code: string }> {
  for (let i = 0; i < 5; i++) {
    const code = randomCode();
    try {
      const n = await Net.host(`mx-royale-priv-${code}`);
      n.welcome = { t: "welcome", mode };
      return { net: n, code };
    } catch {
      /* otro código */
    }
  }
  throw new Error("No se pudo crear sala privada");
}

export function joinPrivate(code: string): Promise<Net> {
  return Net.join(`mx-royale-priv-${code.toUpperCase()}`, 8000);
}
