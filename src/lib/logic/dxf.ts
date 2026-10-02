// Minimal DXF reader → renders geometry to an image for recognition + extracts text hints.
type Pt = [number, number];
type Ent =
  | { k: "poly"; pts: Pt[]; closed?: boolean }
  | { k: "circle"; c: Pt; r: number }
  | { k: "arc"; c: Pt; r: number; a0: number; a1: number }
  | { k: "text"; p: Pt; h: number; t: string; rot: number }
  | { k: "insert"; name: string; p: Pt; sx: number; sy: number; rot: number };

function pairs(src: string) {
  const lines = src.split(/\r?\n/);
  const out: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  return out;
}

export function parseDxf(src: string) {
  const p = pairs(src);
  const blocks: Record<string, Ent[]> = {};
  const entities: Ent[] = [];
  let section = "";
  let curBlock: string | null = null;
  let i = 0;
  const push = (e: Ent) => (curBlock ? (blocks[curBlock] ??= []).push(e) : section === "ENTITIES" && entities.push(e));
  while (i < p.length) {
    const [c, v] = p[i];
    if (c === 0 && v === "SECTION") { section = p[i + 1]?.[1] ?? ""; i += 2; continue; }
    if (c === 0 && v === "BLOCK") {
      let j = i + 1; let name = "";
      while (j < p.length && p[j][0] !== 0) { if (p[j][0] === 2) name = p[j][1]; j++; }
      curBlock = name; i = j; continue;
    }
    if (c === 0 && v === "ENDBLK") { curBlock = null; i++; continue; }
    if (c !== 0 || (section !== "ENTITIES" && section !== "BLOCKS")) { i++; continue; }
    // read entity props
    let j = i + 1;
    const props: [number, string][] = [];
    while (j < p.length && p[j][0] !== 0) { props.push(p[j]); j++; }
    const num = (code: number, d = 0) => { const f = props.find((x) => x[0] === code); return f ? parseFloat(f[1]) : d; };
    const str = (code: number) => props.filter((x) => x[0] === code || (code === 1 && x[0] === 3)).map((x) => x[1]).join("");
    if (v === "LINE") push({ k: "poly", pts: [[num(10), num(20)], [num(11), num(21)]] });
    else if (v === "LWPOLYLINE") {
      const pts: Pt[] = []; let x: number | null = null;
      for (const [cc, vv] of props) { if (cc === 10) x = parseFloat(vv); if (cc === 20 && x != null) { pts.push([x, parseFloat(vv)]); x = null; } }
      push({ k: "poly", pts, closed: (num(70) & 1) === 1 });
    } else if (v === "POLYLINE") {
      const closed = (num(70) & 1) === 1; const pts: Pt[] = [];
      while (j < p.length && !(p[j][0] === 0 && p[j][1] === "SEQEND")) {
        if (p[j][0] === 0 && p[j][1] === "VERTEX") {
          let k = j + 1; let x = 0, y = 0;
          while (k < p.length && p[k][0] !== 0) { if (p[k][0] === 10) x = parseFloat(p[k][1]); if (p[k][0] === 20) y = parseFloat(p[k][1]); k++; }
          pts.push([x, y]); j = k;
        } else j++;
      }
      j++;
      push({ k: "poly", pts, closed });
    } else if (v === "CIRCLE") push({ k: "circle", c: [num(10), num(20)], r: num(40) });
    else if (v === "ARC") push({ k: "arc", c: [num(10), num(20)], r: num(40), a0: num(50), a1: num(51) });
    else if (v === "TEXT" || v === "MTEXT" || v === "ATTRIB")
      push({ k: "text", p: [num(10), num(20)], h: num(40, 1), t: str(1).replace(/\\P/g, " ").replace(/\\[A-Za-z][^;]*;|[{}]/g, ""), rot: num(50) });
    else if (v === "INSERT") push({ k: "insert", name: str(2), p: [num(10), num(20)], sx: num(41, 1), sy: num(42, 1), rot: num(50) });
    i = j;
  }
  return { blocks, entities };
}

function flatten(ents: Ent[], blocks: Record<string, Ent[]>, tf: (p: Pt) => Pt, scale: number, depth = 0): Ent[] {
  const out: Ent[] = [];
  for (const e of ents) {
    if (e.k === "insert") {
      if (depth > 6 || !blocks[e.name]) continue;
      const r = (e.rot * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r);
      const inner = (q: Pt): Pt => tf([e.p[0] + (q[0] * e.sx * cs - q[1] * e.sy * sn), e.p[1] + (q[0] * e.sx * sn + q[1] * e.sy * cs)]);
      out.push(...flatten(blocks[e.name], blocks, inner, scale * Math.abs(e.sx), depth + 1));
    } else if (e.k === "poly") out.push({ ...e, pts: e.pts.map(tf) });
    else if (e.k === "circle") out.push({ ...e, c: tf(e.c), r: e.r * scale });
    else if (e.k === "arc") out.push({ ...e, c: tf(e.c), r: e.r * scale });
    else if (e.k === "text") out.push({ ...e, p: tf(e.p), h: e.h * scale });
  }
  return out;
}

export function renderDxfToImage(src: string, maxDim = 2400): { dataUrl: string; texts: string[] } {
  const { blocks, entities } = parseDxf(src);
  const ents = flatten(entities, blocks, (q) => q, 1);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const ext = (x: number, y: number) => { if (!isFinite(x) || !isFinite(y)) return; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  for (const e of ents) {
    if (e.k === "poly") e.pts.forEach((q) => ext(q[0], q[1]));
    else if (e.k === "circle" || e.k === "arc") { ext(e.c[0] - e.r, e.c[1] - e.r); ext(e.c[0] + e.r, e.c[1] + e.r); }
    else if (e.k === "text") ext(e.p[0], e.p[1]);
  }
  if (!isFinite(minX)) throw new Error("No drawable geometry found in DXF");
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const s = maxDim / Math.max(w, h);
  const cw = Math.ceil(w * s) + 40, ch = Math.ceil(h * s) + 40;
  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = "#000"; ctx.fillStyle = "#000"; ctx.lineWidth = 1.4; ctx.lineCap = "round";
  const X = (x: number) => 20 + (x - minX) * s, Y = (y: number) => 20 + (maxY - y) * s;
  const texts: string[] = [];
  for (const e of ents) {
    ctx.beginPath();
    if (e.k === "poly" && e.pts.length) {
      ctx.moveTo(X(e.pts[0][0]), Y(e.pts[0][1]));
      e.pts.slice(1).forEach((q) => ctx.lineTo(X(q[0]), Y(q[1])));
      if (e.closed) ctx.closePath();
      ctx.stroke();
    } else if (e.k === "circle") { ctx.arc(X(e.c[0]), Y(e.c[1]), e.r * s, 0, Math.PI * 2); ctx.stroke(); }
    else if (e.k === "arc") { ctx.arc(X(e.c[0]), Y(e.c[1]), e.r * s, (-e.a0 * Math.PI) / 180, (-e.a1 * Math.PI) / 180, true); ctx.stroke(); }
    else if (e.k === "text" && e.t) {
      texts.push(e.t);
      ctx.save(); ctx.translate(X(e.p[0]), Y(e.p[1])); ctx.rotate((-e.rot * Math.PI) / 180);
      ctx.font = `${Math.max(8, e.h * s)}px sans-serif`; ctx.fillText(e.t, 0, 0); ctx.restore();
    }
  }
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), texts: texts.slice(0, 600) };
}

export async function fileToDataUrl(file: File, maxDim = 2400): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const s = Math.min(1, maxDim / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  } finally { URL.revokeObjectURL(url); }
}
