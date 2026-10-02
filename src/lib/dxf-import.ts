export type ImportAssessment = {
  fileName: string;
  format: "DXF" | "PDF";
  entities?: number;
  textItems?: number;
  lines?: number;
  circles?: number;
  status: "ready" | "review";
  message: string;
};

export async function assessDiagram(file: File): Promise<ImportAssessment> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") {
    return {
      fileName: file.name,
      format: "PDF",
      status: "review",
      message: "Visual page accepted. Add the matching DXF to enable reliable signal tracing and simulation.",
    };
  }

  if (extension !== "dxf") throw new Error("Choose a DXF or PDF file.");
  const [{ default: DxfParser }, source] = await Promise.all([import("dxf-parser"), file.text()]);
  const parsed = new DxfParser().parseSync(source);
  if (!parsed?.entities) throw new Error("The DXF could not be read.");
  const counts = parsed.entities.reduce<Record<string, number>>((result, entity) => {
    result[entity.type] = (result[entity.type] ?? 0) + 1;
    return result;
  }, {});
  const textItems = (counts["TEXT"] ?? 0) + (counts["MTEXT"] ?? 0) + (counts["ATTRIB"] ?? 0);
  const lines = (counts["LINE"] ?? 0) + (counts["LWPOLYLINE"] ?? 0) + (counts["POLYLINE"] ?? 0);
  const circles = (counts["CIRCLE"] ?? 0) + (counts["ARC"] ?? 0);
  return {
    fileName: file.name,
    format: "DXF",
    entities: parsed.entities.length,
    textItems,
    lines,
    circles,
    status: textItems > 20 && lines > 20 ? "ready" : "review",
    message: textItems > 20 && lines > 20
      ? "Geometry and labels detected. Symbol groups are ready for a mapping review before simulation."
      : "The drawing loaded, but more symbol mapping is needed before simulation.",
  };
}