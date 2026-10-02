import type { LogicNode, NodeType, SignalSource } from "./types";

export type SymbolCategory = "Input" | "Logic" | "Timer" | "Memory" | "Output" | "Annotation";

export interface SymbolDef {
  type: NodeType;
  name: string;
  category: SymbolCategory;
  description: string;
  recognition: string;
  truth?: string;
  outputs: number;
  defaultInputs: number;
  variableInputs?: boolean;
}

export const SYMBOLS: Record<NodeType, SymbolDef> = {
  INPUT: {
    type: "INPUT", name: "Input signal", category: "Input", outputs: 1, defaultInputs: 0,
    description: "Field or system signal entering the logic (FROM column). Single or multiple addresses, hardwired or from IRP/ARP/CRT/DCS.",
    recognition: "Row in the left FROM/LOCATION/NO./TAG NO./SERVICE table with a line leaving to the right. Tag like M.0134/234 or I.0012/332.",
  },
  PB: {
    type: "PB", name: "Push button (CRT)", category: "Input", outputs: 1, defaultInputs: 0,
    description: "Momentary command button, typically a CRT soft push button. Signal is 1 only while pressed.",
    recognition: "Input whose service says COMMAND, PB, PUSH, START/STOP, RESET, or originates from CRT.",
  },
  LIMIT_SW: {
    type: "LIMIT_SW", name: "Limit switch", category: "Input", outputs: 1, defaultInputs: 0,
    description: "Mechanical position switch contact.",
    recognition: "Small lever drawn between two circles; or service text with POSITION, OPENED, CLOSED.",
  },
  LOW_LIMIT: {
    type: "LOW_LIMIT", name: "Low limit", category: "Input", outputs: 1, defaultInputs: 0,
    description: "Process value below low setpoint.",
    recognition: "Square box containing /L.",
  },
  HIGH_LIMIT: {
    type: "HIGH_LIMIT", name: "High limit", category: "Input", outputs: 1, defaultInputs: 0,
    description: "Process value above high setpoint.",
    recognition: "Square box containing H/.",
  },
  AND: {
    type: "AND", name: "AND", category: "Logic", outputs: 1, defaultInputs: 2, variableInputs: true,
    description: "Output is 1 only when every input is 1.",
    recognition: "Thick vertical bar with inputs on the left and a small box labelled AND on the right.",
    truth: "A B | C\n0 0 | 0\n1 0 | 0\n0 1 | 0\n1 1 | 1",
  },
  OR: {
    type: "OR", name: "OR", category: "Logic", outputs: 1, defaultInputs: 2, variableInputs: true,
    description: "Output is 1 when any input is 1.",
    recognition: "Thick vertical bar with inputs on the left and a circle labelled OR on the right.",
    truth: "A B | C\n0 0 | 0\n1 0 | 1\n0 1 | 1\n1 1 | 1",
  },
  NOT: {
    type: "NOT", name: "NOT", category: "Logic", outputs: 1, defaultInputs: 1,
    description: "Inverts the signal.",
    recognition: "Small square with an X (⊠) on the line, labelled NOT.",
    truth: "A | B\n0 | 1\n1 | 0",
  },
  ON_DELAY: {
    type: "ON_DELAY", name: "On delay", category: "Timer", outputs: 1, defaultInputs: 1,
    description: "Output turns 1 after the input has been 1 continuously for X seconds; turns 0 immediately.",
    recognition: "D-shaped symbol with X / SEC inside and caption ON DELAY.",
  },
  OFF_DELAY: {
    type: "OFF_DELAY", name: "Off delay", category: "Timer", outputs: 1, defaultInputs: 1,
    description: "Output turns 1 immediately; stays 1 for X seconds after the input returns to 0.",
    recognition: "D-shaped symbol with X / SEC inside and caption OFF DELAY.",
  },
  PULSE: {
    type: "PULSE", name: "Pulse", category: "Timer", outputs: 1, defaultInputs: 1,
    description: "On a rising edge, output is 1 for exactly X seconds.",
    recognition: "D-shaped symbol with X / SEC inside and caption PULSE DELAY.",
  },
  SR: {
    type: "SR", name: "Set / Reset memory", category: "Memory", outputs: 2, defaultInputs: 2,
    description: "S sets output C to 1, R resets it to 0 (reset dominant). D is the inverted output. Holds state when both are 0.",
    recognition: "Two stacked boxes labelled S and R, output to the right, sometimes a NOT branch for the inverse output.",
    truth: "S R | C D\n1 0 | 1 0\n0 1 | 0 1\n1 1 | 0 1\n0 0 | hold",
  },
  OUTPUT: {
    type: "OUTPUT", name: "Output signal", category: "Output", outputs: 0, defaultInputs: 1,
    description: "Signal leaving the logic (right SERVICE/TO column) — command, interlock or display.",
    recognition: "Row in the right SERVICE/NO./LOCATION/TO table receiving a line; address like 0.0087/407/727/1047.",
  },
  LAMP: {
    type: "LAMP", name: "Indicating lamp", category: "Output", outputs: 0, defaultInputs: 1,
    description: "Indicating display or lamp.",
    recognition: "Bow-tie / rectangle with crossed corners.",
  },
  ANN: {
    type: "ANN", name: "Annunciator", category: "Output", outputs: 0, defaultInputs: 1,
    description: "Announce display or alarm.",
    recognition: "Text (ANN) in parentheses.",
  },
  SV: {
    type: "SV", name: "Solenoid", category: "Output", outputs: 0, defaultInputs: 1,
    description: "Solenoid valve coil.",
    recognition: "Circle containing SV.",
  },
  PULSE_SIG: {
    type: "PULSE_SIG", name: "Pulse ON/OFF control", category: "Output", outputs: 0, defaultInputs: 1,
    description: "Pulse signal for on/off control.",
    recognition: "Box with up and down triangles ▲▼.",
  },
  TEXT: {
    type: "TEXT", name: "Text / note", category: "Annotation", outputs: 0, defaultInputs: 0,
    description: "Free text label for titles, notes and remarks. Has no effect on the logic.",
    recognition: "Free-standing text not attached to a symbol.",
  },
};

export const MAX_GATE_INPUTS = 32;
export const GATE_STYLES = [
  { id: "dcs", name: "DCS (bar + square/circle)" },
  { id: "traditional", name: "Traditional (ANSI)" },
  { id: "block", name: "Block (with names)" },
] as const;
export const isGate = (t: NodeType) => t === "AND" || t === "OR" || t === "NOT";

export const SOURCE_LABEL: Record<SignalSource, string> = {
  HARDWIRE: "HW",
  IRP: "IRP",
  ARP: "ARP",
  CRT: "CRT",
  DCS: "DCS",
};

export const isSource = (t: NodeType) => SYMBOLS[t].category === "Input";
export const isSink = (t: NodeType) => SYMBOLS[t].category === "Output";

export function inputCount(n: LogicNode) {
  const d = SYMBOLS[n.type];
  if (d.variableInputs) return Math.max(2, Math.min(MAX_GATE_INPUTS, n.inputs ?? d.defaultInputs));
  return d.defaultInputs;
}

export function nodeSize(n: LogicNode) {
  const t = n.type;
  if (isSource(t) || isSink(t)) return { w: 230, h: 40 };
  if (t === "TEXT") {
    const fs = n.fontSize ?? 12;
    const lines = (n.label || " ").split("\n");
    return { w: Math.max(30, Math.ceil(Math.max(...lines.map((l) => l.length)) * fs * 0.62) + 8), h: Math.ceil(lines.length * fs * 1.3) + 6 };
  }
  if (t === "AND" || t === "OR") return { w: 60, h: Math.max(40, inputCount(n) * 20) };
  if (t === "NOT") return { w: 32, h: 28 };
  if (t === "SR") return { w: 48, h: 60 };
  return { w: 60, h: 46 };
}

export function inPort(n: LogicNode, i: number) {
  const { h } = nodeSize(n);
  const k = inputCount(n);
  return { x: n.x, y: n.y + (h * (i + 1)) / (k + 1) };
}

export function outPort(n: LogicNode, i: number) {
  const { w, h } = nodeSize(n);
  const m = SYMBOLS[n.type].outputs;
  return { x: n.x + w, y: n.y + (h * (i + 1)) / (m + 1) };
}

export function portName(n: LogicNode, i: number, dir: "in" | "out") {
  if (n.type === "SR") return dir === "in" ? (i === 0 ? "S" : "R") : i === 0 ? "C" : "D";
  if (dir === "in") return String.fromCharCode(65 + i);
  return "OUT";
}

export function newNode(type: NodeType, x: number, y: number, id: string): LogicNode {
  const d = SYMBOLS[type];
  return {
    id, type, x, y,
    label: type === "TEXT" ? "Text" : d.name,
    tag: isSource(type) || isSink(type) ? "" : undefined,
    service: isSource(type) || isSink(type) ? d.name : undefined,
    addresses: [],
    source: isSource(type) ? (type === "PB" ? "CRT" : "HARDWIRE") : isSink(type) ? "DCS" : undefined,
    sec: d.category === "Timer" ? 1 : undefined,
    inputs: d.variableInputs ? 2 : undefined,
    fontSize: type === "TEXT" ? 12 : undefined,
  };
}

export function recognitionGuide() {
  return Object.values(SYMBOLS)
    .filter((s) => s.category !== "Annotation")
    .map((s) => `- ${s.type}: ${s.name}. Looks like: ${s.recognition}`)
    .join("\n");
}
