export type DcsPoint = {
  id: string;
  no: number;
  kind: "input" | "output";
  service: string;
  reference: string;
  location: string;
  tag?: string;
  logic?: string;
};

export const dcsInputs = [
  [2, "IDF STOPPED", "03B-55", "IRP"],
  [3, "SAF STOPPED", "03B-61", "IRP"],
  [4, "ALL FAB STOPPED", "03B-67", "IRP"],
  [5, "PAF STOPPED", "03B-75", "IRP"],
  [6, "TOTAL AIR FLOW < 25% MCR", "03C-55", "IRP"],
  [7, "FURNACE PRESSURE H.H.", "03C-76", "IRP"],
  [8, "FURNACE PRESSURE L.L.", "03D-61", "IRP"],
  [9, "DRUM LEVEL H.H.", "03E-60", "IRP"],
  [10, "DRUM LEVEL L.L.", "03E-71", "IRP"],
  [11, "LOSS OF ALL FUEL", "03F-56", "IRP"],
  [12, "PRIMARY AIR FLOW L.L.", "03F-61", "IRP"],
  [13, "FURNACE TEMP. INADEQUATE FOR COAL FIRING", "03F-67", "IRP"],
  [14, "BOILER EMERGENCY TRIP P.B. ON (CRT)", "03F-71", "IRP"],
  [15, "BOILER EMERGENCY TRIP P.B. ON (OPC)", "03F-77", "IRP"],
  [16, "INSTRUMENT AIR PRESSURE L.L.", "03G-61", "IRP"],
  [17, "CYCLONE OUTLET GAS TEMP. H.H.", "03H-67", "IRP"],
  [18, "REHEATER OUTLET HEADER TEMP. H.H.", "03H-61", "IRP"],
  [19, "TURBINE TRIP", "03H-54", "ARP"],
  [21, "BOILER PURGE COMPLETED", "02-65", ""],
  [24, "CYCLONE OUTLET GAS TEMP. H.H. (STATION WIRING)", "03H-64", ""],
  [25, "REHEATER OUTLET HEADER TEMP. H.H. (STATION WIRING)", "03H-58", ""],
].map(([no, service, reference, location]) => ({
  id: `in-${no}`,
  no: Number(no),
  kind: "input" as const,
  service: String(service),
  reference: String(reference),
  location: String(location),
  tag: no === 21 ? "M.0513" : no === 24 ? "M.3102" : no === 25 ? "M.3212" : undefined,
  logic: Number(no) <= 19 ? "OR → NOT → S/R" : Number(no) === 21 ? "NOT → AND → RESET" : "NOT → AND",
})) as [DcsPoint, ...DcsPoint[]];

export const dcsOutputs = [
  { id: "out-59", no: 59, kind: "output", service: "NO BOILER TRIP COMMAND", reference: "01-15, 02-23", location: "", tag: "I.0561", logic: "NOT (MFT demand)" },
  { id: "out-62", no: 62, kind: "output", service: "MFT STATUS S1–S4", reference: "15-10, 20-11 / ABC series", location: "CRT", tag: "I.000F / I.0560", logic: "MFT latch" },
  { id: "out-63", no: 63, kind: "output", service: "MFT", reference: "35-10, 26B-27", location: "CRT (ANN)", logic: "MFT latch" },
  { id: "out-64", no: 64, kind: "output", service: "MFT", reference: "", location: "OPC (ANN)", logic: "MFT latch" },
  { id: "out-65", no: 65, kind: "output", service: "MFT 2", reference: "", location: "TCS", logic: "MFT latch" },
  { id: "out-67", no: 67, kind: "output", service: "MASTER FUEL TRIP (MFT)", reference: "", location: "SER", logic: "MFT latch" },
  { id: "out-72", no: 72, kind: "output", service: "MFT", reference: "03D-15, 03E-25", location: "IRP", logic: "MFT latch" },
  { id: "out-75", no: 75, kind: "output", service: "FURNACE PURGE PERMISSIVE", reference: "01-28", location: "", logic: "Input 24 AND Input 25" },
] as [DcsPoint, ...DcsPoint[]];