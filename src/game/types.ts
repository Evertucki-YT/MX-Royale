import type { Net } from "./net";

export type Mode = "solo" | "duo" | "squad";
export type Rarity = 0 | 1 | 2 | 3;
export const RARITY_COLORS = ["#9ca3af", "#3b82f6", "#a855f7", "#fbbf24"];
export const RARITY_NAMES = ["Común", "Rara", "Épica", "Legendaria"];
export const RARITY_MULT = [1, 1.1, 1.2, 1.32];

export type ItemKind = "pistol" | "ar" | "shotgun" | "smg" | "sniper" | "shield" | "health";

export interface Item {
  kind: ItemKind;
  rarity: Rarity;
  ammo: number;
  count: number;
}

export interface WeaponDef {
  name: string;
  dmg: number;
  rate: number;
  mag: number;
  reload: number;
  spread: number;
  range: number;
  pellets: number;
  auto: boolean;
  color: number;
  zoom: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  pistol: { name: "Pistola", dmg: 20, rate: 0.32, mag: 12, reload: 1.2, spread: 0.012, range: 90, pellets: 1, auto: false, color: 0x666666, zoom: 1.3 },
  ar: { name: "Rifle de Asalto", dmg: 25, rate: 0.11, mag: 30, reload: 1.8, spread: 0.02, range: 140, pellets: 1, auto: true, color: 0x333333, zoom: 1.6 },
  shotgun: { name: "Escopeta Corredera", dmg: 13, rate: 0.85, mag: 5, reload: 2.2, spread: 0.075, range: 40, pellets: 8, auto: false, color: 0x5a3a20, zoom: 1.2 },
  smg: { name: "Subfusil Uzi", dmg: 14, rate: 0.07, mag: 30, reload: 1.5, spread: 0.035, range: 80, pellets: 1, auto: true, color: 0x222222, zoom: 1.4 },
  sniper: { name: "Francotirador", dmg: 95, rate: 1.4, mag: 5, reload: 2.5, spread: 0.002, range: 400, pellets: 1, auto: false, color: 0x1f3a2a, zoom: 4 },
};

export const ITEM_NAMES: Record<ItemKind, string> = {
  pistol: "Pistola",
  ar: "Rifle de Asalto",
  shotgun: "Escopeta",
  smg: "Uzi",
  sniper: "Francotirador",
  shield: "Poción de Escudo",
  health: "Poción de Vida",
};

export interface RosterEntry {
  id: string;
  name: string;
  human: boolean;
  team: number;
}

export interface MatchConfig {
  mode: Mode;
  roster: RosterEntry[];
  seed: number;
  myId: string;
  net: Net | null;
  isHost: boolean;
  touch: boolean;
  dropZone: number;
}

export const ZONES = [
  { name: "PLAZA EL OXXO", x: 0, z: 0, color: "#ef4444" },
  { name: "REFINERÍA PEMEX", x: -92, z: 0, color: "#f59e0b" },
  { name: "COLONIA EL BARRIO", x: 0, z: 92, color: "#ec4899" },
  { name: "PIRÁMIDE DEL SOL", x: 0, z: -95, color: "#a3e635" },
];

export interface HudState {
  phase: "countdown" | "drop" | "play" | "over";
  countdown: number;
  hp: number;
  shield: number;
  slots: (Item | null)[];
  sel: number;
  alive: number;
  kills: number;
  stormPhase: number;
  stormTime: number;
  stormShrinking: boolean;
  outside: boolean;
  prompt: string;
  feed: { id: number; text: string }[];
  reload: number;
  drink: number;
  wallCd: number;
  ads: boolean;
  scoped: boolean;
  gliding: boolean;
  falling: boolean;
  altitude: number;
  wpDist: number;
  result: null | { win: boolean; place: number; kills: number };
  zone: number;
  netMsg: string;
  fpv: boolean;
}
