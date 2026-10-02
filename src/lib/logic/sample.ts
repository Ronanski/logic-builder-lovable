import type { Diagram, LogicNode, NodeType, SignalSource } from "./types";

const R = (n: number) => 40 + n * 34;
const io = (id: string, type: NodeType, row: number, tag: string, service: string, addresses: string[], source: SignalSource, right = false): LogicNode => ({
  id, type, x: right ? 1180 : 0, y: R(row) - 20, label: service, tag, service, addresses, source,
});
const g = (id: string, type: NodeType, x: number, row: number, extra: Partial<LogicNode> = {}): LogicNode => ({
  id, type, x, y: R(row) - 20, label: type, addresses: [], ...extra,
});

export function sampleDiagram(): Diagram {
  const nodes: LogicNode[] = [
    io("i1", "PB", 1, "M.011F/21F", "BURNER A CLEANING ON", ["M.011F", "M.021F", "M.161F", "M.171F"], "CRT"),
    io("i2", "INPUT", 2, "M.0134/234", "BURNER A LIGHTING CYCLE", ["M.0134", "M.0234", "M.1634", "M.1734"], "DCS"),
    io("i4", "LIMIT_SW", 4, "I.0012/332", "IGNITER A IN INSERT POSITION", ["I.0012", "I.0332", "I.0652", "I.0972"], "HARDWIRE"),
    io("i5", "LIMIT_SW", 5, "I.0010/330", "BURNER A IN INSERT POSITION", ["I.0010", "I.0330", "I.0650", "I.0970"], "HARDWIRE"),
    io("i10", "LIMIT_SW", 10, "M.012A/22A", "BURNER A PURGE VALVE CLOSED", ["M.012A", "M.022A"], "HARDWIRE"),
    io("i22", "INPUT", 22, "M.312C/312D", "BURNER A OIL FV IGNITION POSITION", ["M.312C", "M.312D", "M.314C", "M.314D"], "HARDWIRE"),
    io("i23", "PB", 23, "M.014C/24C", "BURNER A ATOM. AIR VALVE OPEN COMMAND", ["M.014C", "M.024C"], "CRT"),
    io("i25", "INPUT", 25, "M.0146/246", "ENERGIZE IGNITER A TRANS.", ["M.0146", "M.0246"], "DCS"),
    io("i26", "LIMIT_SW", 26, "M.0124/224", "BURNER A OIL & ATOM. AIR VALVE OPENED", ["M.0124", "M.0224"], "HARDWIRE"),
    io("i27", "INPUT", 27, "M.0147/247", "BURNER A IGNITER FAILURE", ["M.0147", "M.0247"], "IRP"),
    io("i28", "PB", 28, "M.0143/243", "BURNER A SHUTDOWN COMMAND", ["M.0143", "M.0243"], "CRT"),
    g("pd1", "PULSE", 520, 1, { sec: 1, label: "TR23" }),
    g("and1", "AND", 420, 3),
    g("not1", "NOT", 560, 5),
    g("and2", "AND", 660, 4),
    g("or1", "OR", 820, 3),
    g("and3", "AND", 560, 8),
    g("and4", "AND", 680, 10),
    g("pd2", "PULSE", 880, 19, { sec: 1, label: "TR25" }),
    g("and5", "AND", 560, 21),
    g("and6", "AND", 680, 25),
    g("not2", "NOT", 560, 26),
    g("or3", "OR", 560, 28),
    g("sr", "SR", 820, 25),
    g("offd", "OFF_DELAY", 880, 23, { sec: 1, label: "TR894" }),
    g("or2", "OR", 1020, 23),
    io("o54", "OUTPUT", 3, "0.0087/407", "INSERT BURNER A COMMAND", ["0.0087", "0.0407", "0.0727", "0.1047"], "DCS", true),
    io("o69", "SV", 19, "M.013F/23F", "SET BURNER A OIL FV TO IGNITER POSITION", ["M.013F", "M.023F", "M.163F", "M.173F"], "DCS", true),
    io("o71", "OUTPUT", 21, "M.013C/23C", "ENERGIZE IGNITER A TRANS.", ["M.013C", "M.023C"], "DCS", true),
    io("o73", "SV", 23, "0.0084/404", "OPEN BURNER A ATOM. AIR VALVE", ["0.0084", "0.0404", "0.0724", "0.1044"], "DCS", true),
    io("o75", "SV", 25, "0.0080/400", "OPEN BURNER A OIL VALVE (SUPPLY LINE)", ["0.0080", "0.0400", "0.0081", "0.0401"], "DCS", true),
  ];
  const W: [string, string, number, number?][] = [
    ["i1", "pd1", 0], ["i2", "and1", 0], ["i4", "and1", 1], ["and1", "and2", 0], ["i5", "not1", 0], ["not1", "and2", 1],
    ["pd1", "or1", 0], ["and2", "or1", 1], ["or1", "o54", 0],
    ["and1", "and3", 0], ["i5", "and3", 1], ["and3", "and4", 0], ["i10", "and4", 1],
    ["and4", "pd2", 0], ["pd2", "o69", 0], ["and4", "and5", 0], ["i22", "and5", 1], ["and5", "o71", 0],
    ["and5", "and6", 0], ["i25", "and6", 1], ["and6", "sr", 0], ["i26", "not2", 0],
    ["not2", "or3", 0], ["i28", "or3", 1], ["or3", "sr", 1], ["sr", "o75", 0],
    ["sr", "offd", 0], ["i23", "or2", 0], ["offd", "or2", 1], ["or2", "o73", 0],
  ];
  return {
    name: "DITL-13 · Burner A light-off sequence",
    nodes,
    wires: W.map(([from, to, toPort, fromPort], i) => ({ id: `w${i}`, from, to, toPort, fromPort: fromPort ?? 0 })),
  };
}
