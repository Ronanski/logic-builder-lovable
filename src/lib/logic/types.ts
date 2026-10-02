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
  | "PULSE_SIG"
  | "TEXT";

export type GateStyle = "dcs" | "traditional" | "block";

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
  /** Elements sharing a group id move/select together */
  group?: string;
  /** Per-symbol override of the diagram gate style */
  style?: GateStyle;
  fontSize?: number;
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
  gateStyle?: GateStyle;
}

export type Selection = { kind: "node" | "wire"; id: string } | null;
