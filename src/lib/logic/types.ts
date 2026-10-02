export type NodeType =
  | "INPUT"
  | "PB"
  | "LIMIT_SW"
  | "LOW_LIMIT"
  | "HIGH_LIMIT"
  | "AND"
  | "OR"
  | "NOT"
  | "ON_DELAY"
  | "OFF_DELAY"
  | "PULSE"
  | "SR"
  | "OUTPUT"
  | "LAMP"
  | "ANN"
  | "SV"
  | "PULSE_SIG";

export type SignalSource = "HARDWIRE" | "IRP" | "ARP" | "CRT" | "DCS";

export interface LogicNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  label: string;
  tag?: string;
  service?: string;
  addresses: string[];
  source?: SignalSource;
  sec?: number;
  inputs?: number;
  note?: string;
}

export interface Wire {
  id: string;
  from: string;
  fromPort: number;
  to: string;
  toPort: number;
  label?: string;
}

export interface Diagram {
  name: string;
  nodes: LogicNode[];
  wires: Wire[];
}

export type Selection = { kind: "node" | "wire"; id: string } | null;
