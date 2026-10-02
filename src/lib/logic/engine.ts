import { inputCount, isSource, SYMBOLS } from "./library";
import type { Diagram } from "./types";

export interface SimState {
  out: Record<string, boolean[]>;
  forced: Record<string, boolean>;
  mem: Record<string, { since?: number | null; prev?: boolean; offAt?: number | null; until?: number | null; q?: boolean }>;
}

export const emptySim = (): SimState => ({ out: {}, forced: {}, mem: {} });

export function inputsOf(d: Diagram, s: SimState, nodeId: string) {
  const n = d.nodes.find((x) => x.id === nodeId);
  if (!n) return [];
  const res: boolean[] = [];
  for (let i = 0; i < inputCount(n); i++) {
    const w = d.wires.find((w) => w.to === nodeId && w.toPort === i);
    res.push(w ? !!s.out[w.from]?.[w.fromPort] : false);
  }
  return res;
}

export function step(d: Diagram, prev: SimState, now: number): SimState {
  const s: SimState = { out: { ...prev.out }, forced: prev.forced, mem: { ...prev.mem } };
  const src = new Map<string, [string, number]>();
  for (const w of d.wires) src.set(`${w.to}:${w.toPort}`, [w.from, w.fromPort]);
  const get = (id: string, i: number) => {
    const r = src.get(`${id}:${i}`);
    return r ? !!s.out[r[0]]?.[r[1]] : false;
  };

  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    for (const n of d.nodes) {
      const ins = Array.from({ length: inputCount(n) }, (_, i) => get(n.id, i));
      const m = s.mem[n.id] ?? {};
      const ms = (n.sec ?? 1) * 1000;
      let o: boolean[];
      if (isSource(n.type)) o = [!!s.forced[n.id]];
      else
        switch (n.type) {
          case "AND": o = [ins.every(Boolean)]; break;
          case "OR": o = [ins.some(Boolean)]; break;
          case "NOT": o = [!ins[0]]; break;
          case "ON_DELAY": o = [ins[0] && m.since != null && now - m.since >= ms]; break;
          case "OFF_DELAY": o = [ins[0] || !!m.prev || (m.offAt != null && now - m.offAt < ms)]; break;
          case "PULSE": o = [(m.until != null && now < m.until) || (ins[0] && !m.prev)]; break;
          case "SR": {
            const q = ins[1] ? false : ins[0] ? true : !!m.q;
            o = [q, !q];
            break;
          }
          default: o = [];
        }
      const old = s.out[n.id];
      if (!old || old.length !== o.length || old.some((v, i) => v !== o[i])) {
        s.out[n.id] = o;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // commit memory with settled inputs
  for (const n of d.nodes) {
    const cat = SYMBOLS[n.type].category;
    if (cat !== "Timer" && cat !== "Memory") continue;
    const i0 = get(n.id, 0);
    const m = { ...(s.mem[n.id] ?? {}) };
    const ms = (n.sec ?? 1) * 1000;
    if (n.type === "ON_DELAY") m.since = i0 ? (m.since ?? now) : null;
    if (n.type === "OFF_DELAY") {
      if (i0) { m.prev = true; m.offAt = null; }
      else if (m.prev) { m.prev = false; m.offAt = now; }
    }
    if (n.type === "PULSE") {
      if (i0 && !m.prev && (m.until == null || now >= m.until)) m.until = now + ms;
      m.prev = i0;
    }
    if (n.type === "SR") m.q = !!s.out[n.id]?.[0];
    s.mem[n.id] = m;
  }
  return s;
}

/** Remaining timer seconds for display */
export function timerRemaining(s: SimState, nodeId: string, type: string, sec: number, now: number) {
  const m = s.mem[nodeId];
  if (!m) return null;
  const ms = sec * 1000;
  if (type === "ON_DELAY" && m.since != null) return Math.max(0, ms - (now - m.since)) / 1000;
  if (type === "OFF_DELAY" && m.offAt != null) return Math.max(0, ms - (now - m.offAt)) / 1000;
  if (type === "PULSE" && m.until != null && now < m.until) return (m.until - now) / 1000;
  return null;
}

export function trace(d: Diagram, sel: { kind: "node" | "wire"; id: string } | null) {
  const upN = new Set<string>(), downN = new Set<string>(), upW = new Set<string>(), downW = new Set<string>();
  if (!sel) return null;
  const walk = (start: string, dir: "up" | "down") => {
    const stack = [start];
    const seenN = dir === "up" ? upN : downN;
    const seenW = dir === "up" ? upW : downW;
    while (stack.length) {
      const id = stack.pop()!;
      if (seenN.has(id)) continue;
      seenN.add(id);
      for (const w of d.wires) {
        if (dir === "up" && w.to === id) { seenW.add(w.id); stack.push(w.from); }
        if (dir === "down" && w.from === id) { seenW.add(w.id); stack.push(w.to); }
      }
    }
  };
  if (sel.kind === "node") { walk(sel.id, "up"); walk(sel.id, "down"); }
  else {
    const w = d.wires.find((x) => x.id === sel.id);
    if (!w) return null;
    walk(w.from, "up"); walk(w.to, "down"); upW.add(w.id);
  }
  return { upN, downN, upW, downW };
}
