import { inputCount, isSink, isSource, nodeSize, SYMBOLS } from "./library";
import type { Diagram, LogicNode, NodeType, SignalSource, Wire } from "./types";

export interface RecNode extends LogicNode { confidence: number; include: boolean; nx: number; ny: number }
export interface RecWire extends Wire { confidence: number; include: boolean }
export interface Recognition { title: string; nodes: RecNode[]; wires: RecWire[]; warnings: string[] }

const ALIASES: Record<string, NodeType> = {
  TON: "ON_DELAY", ONDELAY: "ON_DELAY", TOF: "OFF_DELAY", OFFDELAY: "OFF_DELAY", PULSE_DELAY: "PULSE", TP: "PULSE",
  FLIPFLOP: "SR", RS: "SR", SET_RESET: "SR", LAMP_DISPLAY: "LAMP", ALARM: "ANN", SOLENOID: "SV", PUSHBUTTON: "PB",
  PUSH_BUTTON: "PB", LIMIT: "LIMIT_SW", IN: "INPUT", OUT: "OUTPUT", INVERTER: "NOT",
};
const SOURCES: SignalSource[] = ["HARDWIRE", "IRP", "ARP", "CRT", "DCS"];

function normType(t: unknown): NodeType {
  const s = String(t ?? "").toUpperCase().replace(/[\s-]/g, "_");
  if (s in SYMBOLS) return s as NodeType;
  return ALIASES[s.replace(/_/g, "")] ?? ALIASES[s] ?? "INPUT";
}

export async function recognizeImage(image: string, hints?: string, onProgress?: (chars: number) => void): Promise<Recognition> {
  const res = await fetch("/api/recognize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, hints }),
  });
  if (!res.ok || !res.body) {
    const j = await res.json().catch(() => ({}));
    const base = j.error ?? `Recognition failed (${res.status})`;
    if (res.status === 402) throw new Error(`${base} — AI credits are needed to read drawings.`);
    if (res.status === 429) throw new Error(`${base} — too many requests, please wait a moment.`);
    throw new Error(base);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", finalText = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") { text += ev.delta; onProgress?.(text.length); }
        else if (ev.type === "response.output_text.done" && ev.text) finalText = ev.text;
        else if (ev.type === "error" || ev.type === "response.failed")
          throw new Error(ev.error?.message ?? ev.response?.error?.message ?? "Recognition failed");
      } catch (e) {
        if (e instanceof Error && !(e instanceof SyntaxError)) throw e;
      }
    }
  }
  const out = finalText || text;
  const a = out.indexOf("{"), b = out.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("The drawing could not be read. Try a sharper image.");
  return normalize(JSON.parse(out.slice(a, b + 1)));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(raw: any): Recognition {
  const ids = new Map<string, string>();
  const nodes: RecNode[] = (raw.nodes ?? []).map((n: any, i: number) => {
    const id = `r${i}`;
    ids.set(String(n.id ?? id), id);
    const type = normType(n.type);
    const conf = Math.max(0, Math.min(1, Number(n.confidence ?? 0.5)));
    return {
      id, type, x: 0, y: 0,
      nx: Math.max(0, Math.min(1, Number(n.x ?? 0.5))), ny: Math.max(0, Math.min(1, Number(n.y ?? 0.5))),
      label: String(n.label || n.service || SYMBOLS[type].name),
      tag: n.tag ? String(n.tag) : undefined,
      service: n.service ? String(n.service) : undefined,
      addresses: Array.isArray(n.addresses) ? n.addresses.map(String).filter(Boolean) : [],
      source: SOURCES.includes(n.source) ? n.source : isSource(type) ? (type === "PB" ? "CRT" : "HARDWIRE") : isSink(type) ? "DCS" : undefined,
      sec: SYMBOLS[type].category === "Timer" ? Number(n.sec) || 1 : undefined,
      inputs: SYMBOLS[type].variableInputs ? Math.max(2, Math.min(32, Number(n.inputs) || 2)) : undefined,
      note: n.note ? String(n.note) : undefined,
      confidence: conf, include: true,
    };
  });
  const wires: RecWire[] = [];
  (raw.wires ?? []).forEach((w: any, i: number) => {
    const from = ids.get(String(w.from)), to = ids.get(String(w.to));
    if (!from || !to) return;
    wires.push({
      id: `rw${i}`, from, to, fromPort: Number(w.fromPort) || 0, toPort: Number(w.toPort) || 0,
      label: w.label ? String(w.label) : undefined,
      confidence: Math.max(0, Math.min(1, Number(w.confidence ?? 0.5))), include: true,
    });
  });
  // grow gate inputs to fit referenced ports
  for (const w of wires) {
    const n = nodes.find((x) => x.id === w.to)!;
    if (SYMBOLS[n.type].variableInputs) n.inputs = Math.max(n.inputs ?? 2, Math.min(32, w.toPort + 1));
  }
  return { title: String(raw.title ?? "Imported diagram"), nodes, wires, warnings: (raw.warnings ?? []).map(String) };
}

export function recognitionToDiagram(r: Recognition, name: string): Diagram {
  const W = 1400, H = 1000;
  const nodes: LogicNode[] = r.nodes.filter((n) => n.include).map(({ confidence: _c, include: _i, nx, ny, ...n }) => {
    const node: LogicNode = { ...n };
    const s = nodeSize(node);
    node.x = isSource(n.type) ? 0 : isSink(n.type) ? W : Math.round((260 + nx * (W - 320)) / 10) * 10 - s.w / 2;
    node.y = Math.round((ny * H) / 10) * 10 - s.h / 2;
    return node;
  });
  // de-overlap per column
  const cols = new Map<number, LogicNode[]>();
  nodes.forEach((n) => { const k = Math.round(n.x / 80); (cols.get(k) ?? cols.set(k, []).get(k)!).push(n); });
  cols.forEach((list) => {
    list.sort((a, b) => a.y - b.y);
    for (let i = 1; i < list.length; i++) {
      const p = list[i - 1], min = p.y + nodeSize(p).h + 8;
      if (list[i].y < min) list[i].y = min;
    }
  });
  const keep = new Set(nodes.map((n) => n.id));
  const wires: Wire[] = r.wires
    .filter((w) => w.include && keep.has(w.from) && keep.has(w.to))
    .map(({ confidence: _c, include: _i, ...w }) => {
      const to = nodes.find((n) => n.id === w.to)!;
      return { ...w, toPort: Math.min(w.toPort, inputCount(to) - 1), fromPort: Math.min(w.fromPort, SYMBOLS[nodes.find((n) => n.id === w.from)!.type].outputs - 1) };
    });
  return { name, nodes, wires };
}
