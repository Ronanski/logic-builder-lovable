import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, Download, Maximize, Minimize, ZoomIn, ZoomOut, Scan, Crosshair, Sun, Moon, Play, Wrench, BookOpen,
  PanelLeft, PanelRight, RotateCcw, FilePlus, Loader2, Search, X, ListTree,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Group, Ungroup, Copy, ClipboardPaste, CopyPlus, Trash2, Scissors, Radio, Power,
} from "lucide-react";
import { toast } from "sonner";
import { Canvas, type CanvasHandle } from "@/components/dcs/Canvas";
import { Inspector } from "@/components/dcs/Inspector";
import { ImportReview } from "@/components/dcs/ImportReview";
import { GlyphPreview } from "@/components/dcs/Glyph";
import { emptySim, step, trace, type SimState } from "@/lib/logic/engine";
import { GATE_STYLES, inputCount, isSink, isSource, newNode, nodeSize, SOURCE_LABEL, SYMBOLS, type SymbolCategory } from "@/lib/logic/library";
import { sampleDiagram } from "@/lib/logic/sample";
import { recognizeImage, recognitionToDiagram, type Recognition } from "@/lib/logic/recognize";
import { fileToDataUrl, renderDxfToImage } from "@/lib/logic/dxf";
import type { Diagram, GateStyle, LogicNode, Selection, Wire } from "@/lib/logic/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LogicTrace — DCS Logic Builder & Simulator" },
      { name: "description", content: "Build, import and simulate DCS interlock logic diagrams with live signal tracing." },
      { property: "og:title", content: "LogicTrace — DCS Logic Builder & Simulator" },
      { property: "og:description", content: "Import DXF or screenshots of interlock sheets, review recognition, then trace and simulate logic live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workspace,
});

const STORE = "logictrace:diagram";
type LogEntry = { t: number; id: string; text: string; on: boolean };
type Clip = { nodes: LogicNode[]; wires: Wire[] };
type SyncMsg = { from: string; kind: "diagram"; d: Diagram } | { from: string; kind: "forced"; forced: Record<string, boolean> } | { from: string; kind: "hello" | "here" };
const uid = () => Math.random().toString(36).slice(2, 9);
const TAB = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : uid();

/** Copy nodes + the wires between them, giving everything fresh ids. */
function cloneElements(clip: Clip, dx: number, dy: number): Clip {
  const ids = new Map<string, string>(), groups = new Map<string, string>();
  const nodes = clip.nodes.map((n) => {
    const id = `n${uid()}`; ids.set(n.id, id);
    const group = n.group ? (groups.get(n.group) ?? (groups.set(n.group, `g${uid()}`), groups.get(n.group))) : undefined;
    return { ...n, id, x: n.x + dx, y: n.y + dy, group, addresses: [...n.addresses] };
  });
  const wires = clip.wires.filter((w) => ids.has(w.from) && ids.has(w.to)).map((w) => ({ ...w, id: `w${uid()}`, from: ids.get(w.from)!, to: ids.get(w.to)! }));
  return { nodes, wires };
}

function Workspace() {
  const [d, setD] = useState<Diagram>(() => sampleDiagram());
  const [sel, setSelRaw] = useState<Selection>(null);
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [peers, setPeers] = useState(0);
  const clip = useRef<Clip | null>(null);
  const pasteN = useRef(0);
  const chan = useRef<BroadcastChannel | null>(null);
  const remote = useRef(false);
  const groupOf = (id: string, nodes = d.nodes) => { const n = nodes.find((k) => k.id === id); return n?.group ? nodes.filter((k) => k.group === n.group).map((k) => k.id) : [id]; };
  const setSel = (s: Selection) => { setSelRaw(s); setSelIds(new Set(s?.kind === "node" ? groupOf(s.id) : [])); };
  const [mode, setMode] = useState<"build" | "simulate">("simulate");
  const [autoFit, setAutoFit] = useState(true);
  const [dark, setDark] = useState(true);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [full, setFull] = useState(false);
  const [sim, setSim] = useState<SimState>(emptySim);
  const [now, setNow] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<{ image: string; rec: Recognition; name: string } | null>(null);
  const canvasRef = useRef<CanvasHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dRef = useRef(d); dRef.current = d;
  const forced = useRef<Record<string, boolean>>({});

  // restore & persist
  useEffect(() => {
    try { const s = localStorage.getItem(STORE); if (s) setD(JSON.parse(s)); } catch { /* ignore */ }
    const t = localStorage.getItem("logictrace:theme"); if (t) setDark(t === "dark");
    if (window.innerWidth < 1024) { setLeft(false); setRight(false); }
  }, []);
  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(d)); }, [d]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("logictrace:theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const h = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  // simulation loop
  useEffect(() => {
    const id = setInterval(() => {
      const t = performance.now();
      setNow(t);
      setSim((prev) => {
        const next = step(dRef.current, { ...prev, forced: forced.current }, t);
        const changes: LogEntry[] = [];
        for (const n of dRef.current.nodes) {
          if (!isSource(n.type) && !isSink(n.type) && n.type !== "SR") continue;
          let a: boolean, b: boolean;
          if (isSink(n.type)) {
            const w = dRef.current.wires.find((x) => x.to === n.id);
            a = w ? !!prev.out[w.from]?.[w.fromPort] : false; b = w ? !!next.out[w.from]?.[w.fromPort] : false;
          } else { a = !!prev.out[n.id]?.[0]; b = !!next.out[n.id]?.[0]; }
          if (a !== b) changes.push({ t: Date.now(), id: n.id, text: `${n.tag || SYMBOLS[n.type].name} · ${n.service ?? n.label}`, on: b });
        }
        if (changes.length) setLog((l) => [...changes, ...l].slice(0, 80));
        return next;
      });
    }, 50);
    return () => clearInterval(id);
  }, []);

  const tr = useMemo(() => trace(d, sel), [d, sel]);

  const post = (m: Omit<SyncMsg, "from"> & Record<string, unknown>) => chan.current?.postMessage({ ...m, from: TAB });
  const setForced = useCallback((f: Record<string, boolean>) => { forced.current = f; chan.current?.postMessage({ kind: "forced", forced: f, from: TAB }); }, []);
  const press = useCallback((id: string, down: boolean) => setForced({ ...forced.current, [id]: down }), [setForced]);
  const toggle = useCallback((id: string) => setForced({ ...forced.current, [id]: !forced.current[id] }), [setForced]);
  const resetSim = () => { setForced({}); setSim(emptySim()); setLog([]); };

  // real-time sync between open tabs / windows of this app
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const c = new BroadcastChannel("logictrace-sync"); chan.current = c;
    const seen = new Map<string, number>();
    c.onmessage = (ev: MessageEvent<SyncMsg>) => {
      const m = ev.data; if (!m || m.from === TAB) return;
      seen.set(m.from, Date.now());
      if (m.kind === "hello") c.postMessage({ kind: "here", from: TAB });
      if (m.kind === "diagram") { remote.current = true; setD(m.d); }
      if (m.kind === "forced") forced.current = m.forced;
      setPeers([...seen.values()].filter((t) => Date.now() - t < 6000).length);
    };
    c.postMessage({ kind: "hello", from: TAB });
    const ping = setInterval(() => { c.postMessage({ kind: "here", from: TAB }); setPeers([...seen.values()].filter((t) => Date.now() - t < 6000).length); }, 2500);
    return () => { clearInterval(ping); c.close(); chan.current = null; };
  }, []);
  useEffect(() => {
    if (remote.current) { remote.current = false; return; }
    post({ kind: "diagram", d });
  }, [d]);

  const updateNode = (id: string, patch: Partial<LogicNode>) =>
    setD((x) => {
      const nodes = x.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
      const n = nodes.find((k) => k.id === id)!;
      return { ...x, nodes, wires: x.wires.filter((w) => w.to !== id || w.toPort < inputCount(n)) };
    });
  const moveMany = (moves: { id: string; x: number; y: number }[]) => {
    const m = new Map(moves.map((k) => [k.id, k]));
    setD((x) => ({ ...x, nodes: x.nodes.map((n) => { const k = m.get(n.id); return k ? { ...n, x: k.x, y: k.y } : n; }) }));
  };
  const selectedNodes = () => d.nodes.filter((n) => selIds.has(n.id));
  const del = () => {
    if (sel?.kind === "wire" && !selIds.size) { setD((x) => ({ ...x, wires: x.wires.filter((w) => w.id !== sel.id) })); setSel(null); return; }
    if (!selIds.size) return;
    setD((x) => ({ ...x, nodes: x.nodes.filter((n) => !selIds.has(n.id)), wires: x.wires.filter((w) => !selIds.has(w.from) && !selIds.has(w.to)) }));
    setSel(null);
  };
  const copy = () => {
    const nodes = selectedNodes(); if (!nodes.length) return false;
    const ids = new Set(nodes.map((n) => n.id));
    clip.current = { nodes: structuredClone(nodes), wires: d.wires.filter((w) => ids.has(w.from) && ids.has(w.to)).map((w) => ({ ...w })) };
    pasteN.current = 0;
    try { localStorage.setItem("logictrace:clipboard", JSON.stringify(clip.current)); } catch { /* ignore */ }
    toast.success(`Copied ${nodes.length} element${nodes.length > 1 ? "s" : ""}`);
    return true;
  };
  const paste = (src?: Clip) => {
    let c = src ?? clip.current;
    if (!c) { try { const j = localStorage.getItem("logictrace:clipboard"); if (j) c = JSON.parse(j); } catch { /* ignore */ } }
    if (!c?.nodes.length) return;
    pasteN.current += 1;
    const off = 30 * pasteN.current;
    const out = cloneElements(c, off, off);
    setMode("build");
    setD((x) => ({ ...x, nodes: [...x.nodes, ...out.nodes], wires: [...x.wires, ...out.wires] }));
    setSelRaw(out.nodes[0] ? { kind: "node", id: out.nodes[0].id } : null);
    setSelIds(new Set(out.nodes.map((n) => n.id)));
  };
  const duplicate = () => { const nodes = selectedNodes(); if (!nodes.length) return; const ids = new Set(nodes.map((n) => n.id)); pasteN.current = 0; paste({ nodes, wires: d.wires.filter((w) => ids.has(w.from) && ids.has(w.to)) }); };
  const groupSel = () => {
    if (selIds.size < 2) return; const g = `g${uid()}`;
    setD((x) => ({ ...x, nodes: x.nodes.map((n) => (selIds.has(n.id) ? { ...n, group: g } : n)) }));
    toast.success("Grouped");
  };
  const ungroupSel = () => setD((x) => ({ ...x, nodes: x.nodes.map((n) => (selIds.has(n.id) ? { ...n, group: undefined } : n)) }));
  type AlignKind = "left" | "center" | "right" | "top" | "middle" | "bottom" | "hdist" | "vdist";
  const align = (k: AlignKind) => {
    const ns = selectedNodes(); if (ns.length < 2) return;
    const box = ns.map((n) => ({ n, ...nodeSize(n) }));
    const minX = Math.min(...box.map((b) => b.n.x)), maxX = Math.max(...box.map((b) => b.n.x + b.w));
    const minY = Math.min(...box.map((b) => b.n.y)), maxY = Math.max(...box.map((b) => b.n.y + b.h));
    const moves: { id: string; x: number; y: number }[] = [];
    if (k === "hdist" || k === "vdist") {
      const h = k === "hdist";
      const sorted = [...box].sort((a, b) => (h ? a.n.x + a.w / 2 - (b.n.x + b.w / 2) : a.n.y + a.h / 2 - (b.n.y + b.h / 2)));
      const first = sorted[0]!, last = sorted[sorted.length - 1]!;
      const c0 = h ? first.n.x + first.w / 2 : first.n.y + first.h / 2, c1 = h ? last.n.x + last.w / 2 : last.n.y + last.h / 2;
      sorted.forEach((b, i) => {
        const c = c0 + ((c1 - c0) * i) / (sorted.length - 1);
        moves.push(h ? { id: b.n.id, x: Math.round(c - b.w / 2), y: b.n.y } : { id: b.n.id, x: b.n.x, y: Math.round(c - b.h / 2) });
      });
    } else for (const b of box) {
      let { x, y } = b.n;
      if (k === "left") x = minX; if (k === "right") x = maxX - b.w; if (k === "center") x = Math.round((minX + maxX) / 2 - b.w / 2);
      if (k === "top") y = minY; if (k === "bottom") y = maxY - b.h; if (k === "middle") y = Math.round((minY + maxY) / 2 - b.h / 2);
      moves.push({ id: b.n.id, x, y });
    }
    moveMany(moves);
  };
  const onNodeClick = (id: string, additive: boolean) => {
    const g = groupOf(id);
    if (!additive) { setSel({ kind: "node", id }); return; }
    setSelIds((cur) => {
      const next = new Set(cur);
      const has = g.every((k) => next.has(k));
      g.forEach((k) => (has ? next.delete(k) : next.add(k)));
      return next;
    });
    setSelRaw({ kind: "node", id });
  };
  const onMarquee = (ids: string[], additive: boolean) => {
    const all = new Set(additive ? selIds : []);
    ids.forEach((id) => groupOf(id).forEach((k) => all.add(k)));
    setSelIds(all);
    const first = [...all][0];
    setSelRaw(first ? { kind: "node", id: first } : null);
  };
  const selectedInputs = d.nodes.filter((n) => selIds.has(n.id) && isSource(n.type) && n.type !== "PB");
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
      if (mod && key === "c") { if (copy()) e.preventDefault(); return; }
      if (mod && key === "x" && mode === "build") { if (copy()) { del(); e.preventDefault(); } return; }
      if (mod && key === "v") { e.preventDefault(); paste(); return; }
      if (mod && key === "d") { e.preventDefault(); duplicate(); return; }
      if (mod && key === "a") { e.preventDefault(); setSelIds(new Set(d.nodes.map((n) => n.id))); return; }
      if (mod && key === "g" && mode === "build") { e.preventDefault(); if (e.shiftKey) ungroupSel(); else groupSel(); return; }
      if (mode === "build" && selIds.size && e.key.startsWith("Arrow")) {
        e.preventDefault(); const st = e.shiftKey ? 50 : 10;
        const dx = e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0, dy = e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0;
        moveMany(selectedNodes().map((n) => ({ id: n.id, x: n.x + dx, y: n.y + dy }))); return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && mode === "build") del();
      if (e.key === "Escape") setSel(null);
      if (e.key === "f") canvasRef.current?.fit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const addSymbol = (type: LogicNode["type"]) => {
    setMode("build");
    const id = `n${Date.now().toString(36)}`;
    const xs = d.nodes.map((n) => n.x + nodeSize(n).w), ys = d.nodes.map((n) => n.y);
    const x = isSource(type) ? Math.min(0, ...d.nodes.map((n) => n.x)) : isSink(type) ? Math.max(400, ...xs) - 230 : 500;
    const y = (ys.length ? Math.max(...ys) : 0) + 60;
    setD((v) => ({ ...v, nodes: [...v.nodes, newNode(type, Math.round(x / 10) * 10, Math.round(y / 10) * 10, id)] }));
    setSel({ kind: "node", id });
  };

  const connect = (from: string, fromPort: number, to: string, toPort: number) => {
    if (from === to) return;
    setD((v) => ({ ...v, wires: [...v.wires.filter((w) => !(w.to === to && w.toPort === toPort)), { id: `w${Date.now().toString(36)}`, from, fromPort, to, toPort }] }));
  };

  const onFile = async (file: File) => {
    const ext = file.name.toLowerCase().split(".").pop();
    try {
      if (ext === "json") {
        const j = JSON.parse(await file.text());
        if (!Array.isArray(j.nodes) || !Array.isArray(j.wires)) throw new Error("Not a LogicTrace project file");
        setD(j); resetSim(); setSel(null); toast.success("Project loaded");
        return;
      }
      let image: string, hints: string | undefined;
      if (ext === "dxf") {
        setBusy("Reading CAD drawing…");
        const r = renderDxfToImage(await file.text());
        image = r.dataUrl; hints = r.texts.length ? r.texts.join(" | ") : undefined;
      } else if (file.type.startsWith("image/")) {
        image = await fileToDataUrl(file);
      } else throw new Error("Use a PNG/JPG screenshot, a DXF drawing, or a project .json file");
      setBusy("Recognizing logic symbols…");
      const rec = await recognizeImage(image, hints, (c) => setBusy(`Recognizing logic symbols… ${Math.round(c / 100) / 10}k`));
      if (!rec.nodes.length) throw new Error("No logic symbols were found in this image");
      setReview({ image, rec, name: rec.title || file.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally { setBusy(null); }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${d.name.replace(/[^\w-]+/g, "_")}.json`; a.click();
  };
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else stageRef.current?.requestFullscreen?.();
  };

  const ioNodes = d.nodes.filter((n) => isSource(n.type) || isSink(n.type));

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* top bar */}
      <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-card px-2 sm:gap-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded bg-primary font-mono text-xs font-bold text-primary-foreground">LT</div>
          <div className="hidden min-w-0 sm:block">
            <div className="text-sm font-semibold leading-tight">LogicTrace</div>
            <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="w-56 truncate bg-transparent font-mono text-[11px] text-muted-foreground outline-none focus:text-foreground" />
          </div>
        </div>
        <IconBtn label="Toggle library & signals" onClick={() => setLeft(!left)} active={left}><PanelLeft /></IconBtn>
        <div className="mx-1 flex rounded-md border p-0.5">
          <button onClick={() => setMode("build")} className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${mode === "build" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Wrench className="h-3.5 w-3.5" /><span className="hidden md:inline">Build</span></button>
          <button onClick={() => setMode("simulate")} className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium ${mode === "simulate" ? "bg-signal-on text-signal-on-foreground" : "text-muted-foreground"}`}><Play className="h-3.5 w-3.5" /><span className="hidden md:inline">Simulate</span></button>
        </div>
        <div className="flex-1" />
        <span title={peers ? `Live-synced with ${peers} other open window${peers > 1 ? "s" : ""}` : "Open this app in another tab or window to sync in real time"}
          className={`hidden items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] lg:flex ${peers ? "border-signal-on/50 text-signal-on" : "text-muted-foreground"}`}>
          <Radio className="h-3 w-3" />{peers ? `SYNC · ${peers + 1}` : "SYNC READY"}
        </span>
        <label className="hidden items-center gap-1 text-[11px] text-muted-foreground md:flex" title="Logic gate symbol style">
          Gates
          <select aria-label="Logic gate symbol style" value={d.gateStyle ?? "dcs"} onChange={(e) => setD((x) => ({ ...x, gateStyle: e.target.value as GateStyle }))}
            className="rounded-md border bg-background px-1.5 py-1 text-xs text-foreground outline-none">
            {GATE_STYLES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}<span className="hidden sm:inline">Import</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*,.dxf,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        <IconBtn label="Export project" onClick={exportJson}><Download /></IconBtn>
        <IconBtn label="New blank diagram" onClick={() => { setD({ name: "Untitled logic", nodes: [], wires: [] }); resetSim(); setSel(null); setMode("build"); }}><FilePlus /></IconBtn>
        <IconBtn label="Load sample (DITL-13)" onClick={() => { setD(sampleDiagram()); resetSim(); setSel(null); }}><ListTree /></IconBtn>
        <Link to="/library" className="hidden h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground sm:grid" title="Symbol library"><BookOpen className="h-4 w-4" /></Link>
        <IconBtn label="Theme" onClick={() => setDark(!dark)}>{dark ? <Sun /> : <Moon />}</IconBtn>
        <IconBtn label="Toggle information pane" onClick={() => setRight(!right)} active={right}><PanelRight /></IconBtn>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* left pane */}
        {left && (
          <aside className="absolute inset-y-0 left-0 z-20 flex w-72 flex-col border-r bg-card shadow-xl lg:static lg:shadow-none">
            <LeftPane d={d} sim={sim} sel={sel} mode={mode} onSelect={(s) => setSel(s)} onAdd={addSymbol} onToggle={toggle} onPress={press} forced={forced.current} close={() => setLeft(false)} ioNodes={ioNodes} />
          </aside>
        )}

        {/* stage */}
        <main ref={stageRef} className="relative flex min-w-0 flex-1 flex-col bg-canvas">
          <div className="relative min-h-0 flex-1">
            <Canvas ref={canvasRef} diagram={d} sim={sim} mode={mode} selection={sel} traceSets={tr} autoFit={autoFit} now={now}
              onSelect={setSel} selectedIds={selIds} onNodeClick={onNodeClick} onMarquee={onMarquee} onMoveMany={moveMany}
              onConnect={connect} onPress={press} onToggle={toggle} />
            {(selIds.size > 0 || clip.current) && (
              <div className="absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center gap-0.5 rounded-lg border bg-card/95 p-1 shadow-lg backdrop-blur">
                {selIds.size > 0 && <span className="px-2 font-mono text-[11px] text-muted-foreground">{selIds.size} selected</span>}
                {mode === "build" && selIds.size > 1 && <>
                  <Sep />
                  <IconBtn label="Align left" onClick={() => align("left")}><AlignStartVertical /></IconBtn>
                  <IconBtn label="Align center" onClick={() => align("center")}><AlignCenterVertical /></IconBtn>
                  <IconBtn label="Align right" onClick={() => align("right")}><AlignEndVertical /></IconBtn>
                  <IconBtn label="Align top" onClick={() => align("top")}><AlignStartHorizontal /></IconBtn>
                  <IconBtn label="Align middle" onClick={() => align("middle")}><AlignCenterHorizontal /></IconBtn>
                  <IconBtn label="Align bottom" onClick={() => align("bottom")}><AlignEndHorizontal /></IconBtn>
                  {selIds.size > 2 && <>
                    <IconBtn label="Distribute horizontally" onClick={() => align("hdist")}><AlignHorizontalDistributeCenter /></IconBtn>
                    <IconBtn label="Distribute vertically" onClick={() => align("vdist")}><AlignVerticalDistributeCenter /></IconBtn>
                  </>}
                  <Sep />
                  <IconBtn label="Group (Ctrl+G)" onClick={groupSel}><Group /></IconBtn>
                </>}
                {mode === "build" && selectedNodes().some((n) => n.group) && <IconBtn label="Ungroup (Ctrl+Shift+G)" onClick={ungroupSel}><Ungroup /></IconBtn>}
                <Sep />
                {selIds.size > 0 && <IconBtn label="Copy (Ctrl+C)" onClick={copy}><Copy /></IconBtn>}
                {selIds.size > 0 && mode === "build" && <IconBtn label="Cut (Ctrl+X)" onClick={() => { if (copy()) del(); }}><Scissors /></IconBtn>}
                {clip.current && <IconBtn label="Paste (Ctrl+V)" onClick={() => paste()}><ClipboardPaste /></IconBtn>}
                {selIds.size > 0 && <IconBtn label="Duplicate (Ctrl+D)" onClick={duplicate}><CopyPlus /></IconBtn>}
                {selIds.size > 0 && mode === "build" && <IconBtn label="Delete (Del)" onClick={del}><Trash2 /></IconBtn>}
                {selectedInputs.length > 1 && <>
                  <Sep />
                  <button onClick={() => setForced({ ...forced.current, ...Object.fromEntries(selectedInputs.map((n) => [n.id, true])) })} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-signal-on hover:bg-accent"><Power className="h-3.5 w-3.5" />Set {selectedInputs.length} inputs</button>
                  <button onClick={() => setForced({ ...forced.current, ...Object.fromEntries(selectedInputs.map((n) => [n.id, false])) })} className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent">Clear</button>
                </>}
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-background/60 backdrop-blur-sm">
                <div className="flex items-center gap-3 rounded-lg border bg-card px-5 py-3 text-sm shadow-lg"><Loader2 className="h-4 w-4 animate-spin text-primary" />{busy}</div>
              </div>
            )}
            {/* floating view controls */}
            <div className="absolute bottom-3 right-3 flex flex-col gap-1 rounded-lg border bg-card/95 p-1 shadow-lg backdrop-blur">
              <IconBtn label="Zoom in" onClick={() => { setAutoFit(false); canvasRef.current?.zoom(0.8); }}><ZoomIn /></IconBtn>
              <IconBtn label="Zoom out" onClick={() => { setAutoFit(false); canvasRef.current?.zoom(1.25); }}><ZoomOut /></IconBtn>
              <IconBtn label="Fit to screen (F)" onClick={() => canvasRef.current?.fit()}><Scan /></IconBtn>
              <IconBtn label="Focus traced path" onClick={() => { setAutoFit(false); canvasRef.current?.focus(); }}><Crosshair /></IconBtn>
              <IconBtn label="Auto-fit on resize" onClick={() => setAutoFit(!autoFit)} active={autoFit}><span className="font-mono text-[10px] font-bold">AF</span></IconBtn>
              <IconBtn label="Full screen" onClick={toggleFull}>{full ? <Minimize /> : <Maximize />}</IconBtn>
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 hidden flex-wrap gap-3 rounded-md border bg-card/90 px-3 py-1.5 text-[11px] text-muted-foreground backdrop-blur md:flex">
              <Legend cls="bg-signal-on" t="Energized (1)" /><Legend cls="bg-trace-up" t="Upstream" /><Legend cls="bg-trace-down" t="Downstream" />
              <span>Scroll / pinch = zoom · Shift+scroll = move · Shift+click / drag box = multi-select · Ctrl+C/V/D/G</span>
            </div>
          </div>
          {/* event log */}
          <div className="flex h-28 shrink-0 flex-col border-t bg-card">
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Event log</span>
              <button onClick={resetSim} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><RotateCcw className="h-3 w-3" />Reset simulation</button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-3 pb-2 font-mono text-[11px]">
              {!log.length && <p className="text-muted-foreground">Switch to Simulate and click inputs or press CRT push buttons to see signal changes.</p>}
              {log.map((e, i) => (
                <button key={i} onClick={() => setSel({ kind: "node", id: e.id })} className="flex w-full gap-3 text-left hover:bg-accent">
                  <span className="text-muted-foreground">{new Date(e.t).toLocaleTimeString()}</span>
                  <span className={e.on ? "text-signal-on" : "text-muted-foreground"}>{e.on ? "▲ 1" : "▼ 0"}</span>
                  <span className="truncate">{e.text}</span>
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* right pane */}
        {right && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-80 flex-col border-l bg-card shadow-xl lg:static lg:shadow-none">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Information</span>
              <button className="lg:hidden" onClick={() => setRight(false)}><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <Inspector d={d} sel={sel} sim={sim} mode={mode} trace={tr} onSelect={setSel} onChange={updateNode} onDelete={del} />
            </div>
          </aside>
        )}
      </div>

      {review && (
        <ImportReview key={review.image.length + review.name} open image={review.image} rec={review.rec}
          onCancel={() => setReview(null)}
          onAccept={(r) => { setD(recognitionToDiagram(r, review.name)); resetSim(); setSel(null); setReview(null); setAutoFit(true); toast.success("Diagram imported — check the connections, then simulate"); }} />
      )}
    </div>
  );
}

function LeftPane({ d, sim, sel, mode, onSelect, onAdd, onToggle, onPress, forced, close, ioNodes }: {
  d: Diagram; sim: SimState; sel: Selection; mode: string; onSelect: (s: Selection) => void; onAdd: (t: LogicNode["type"]) => void;
  onToggle: (id: string) => void; onPress: (id: string, down: boolean) => void; forced: Record<string, boolean>; close: () => void; ioNodes: LogicNode[];
}) {
  const [tab, setTab] = useState<"signals" | "library">("signals");
  const [q, setQ] = useState("");
  const filtered = ioNodes.filter((n) => `${n.tag} ${n.service} ${n.addresses.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  const cats: SymbolCategory[] = ["Input", "Logic", "Timer", "Memory", "Output", "Annotation"];
  const valueOf = (n: LogicNode) => {
    if (isSource(n.type)) return !!sim.out[n.id]?.[0];
    const w = d.wires.find((x) => x.to === n.id);
    return w ? !!sim.out[w.from]?.[w.fromPort] : false;
  };
  return (
    <>
      <div className="flex items-center gap-1 border-b p-2">
        {(["signals", "library"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-md px-2 py-1 text-xs font-medium capitalize ${tab === t ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"}`}>{t === "signals" ? "I/O signals" : "Symbol library"}</button>
        ))}
        <button className="lg:hidden" onClick={close}><X className="h-4 w-4" /></button>
      </div>
      {tab === "signals" ? (
        <>
          <div className="relative border-b p-2">
            <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tag, service, address" className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {(["in", "out"] as const).map((g) => (
              <div key={g}>
                <div className="sticky top-0 bg-muted/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur">{g === "in" ? "Inputs" : "Outputs"}</div>
                {filtered.filter((n) => (g === "in") === isSource(n.type)).map((n) => {
                  const on = valueOf(n);
                  const active = sel?.kind === "node" && sel.id === n.id;
                  return (
                    <div key={n.id} className={`flex items-center gap-2 border-b px-3 py-1.5 ${active ? "bg-accent" : ""}`}>
                      <button onClick={() => onSelect({ kind: "node", id: n.id })} className="min-w-0 flex-1 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-muted px-1 font-mono text-[9px] text-muted-foreground">{n.source ? SOURCE_LABEL[n.source] : ""}</span>
                          <span className="truncate font-mono text-xs font-medium">{n.tag || n.addresses[0] || SYMBOLS[n.type].name}</span>
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">{n.service}</div>
                      </button>
                      {isSource(n.type) && mode === "simulate" ? (
                        n.type === "PB" ? (
                          <button onPointerDown={() => onPress(n.id, true)} onPointerUp={() => onPress(n.id, false)} onPointerLeave={() => forced[n.id] && onPress(n.id, false)}
                            className={`shrink-0 rounded-full border-2 px-2.5 py-1 font-mono text-[10px] font-bold ${on ? "border-signal-on bg-signal-on text-signal-on-foreground" : "border-foreground/40 active:scale-95"}`}>PUSH</button>
                        ) : (
                          <button onClick={() => onToggle(n.id)} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-signal-on" : "bg-muted"}`} aria-label="Toggle input">
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
                          </button>
                        )
                      ) : (
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? "bg-signal-on shadow-[0_0_8px_var(--signal-on)]" : "bg-muted-foreground/30"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <p className="px-1 pb-2 text-[11px] text-muted-foreground">Click a symbol to add it. In Build mode drag symbols, click an output dot then an input dot to wire.</p>
          {cats.map((c) => (
            <div key={c} className="mb-3">
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{c}</div>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.values(SYMBOLS).filter((s) => s.category === c).map((s) => (
                  <button key={s.type} onClick={() => onAdd(s.type)} title={s.description} className="rounded-md border bg-background p-1.5 text-left hover:border-primary hover:bg-accent">
                    <div className="h-9 rounded bg-canvas"><GlyphPreview gateStyle={d.gateStyle} node={{ ...newNode(s.type, 0, 0, "p"), tag: s.type === "INPUT" || s.type === "OUTPUT" ? "TAG" : "" }} /></div>
                    <div className="mt-1 truncate text-[11px] font-medium">{s.name}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function IconBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button title={label} aria-label={label} onClick={onClick}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md [&_svg]:h-4 [&_svg]:w-4 ${active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-0.5 h-5 w-px bg-border" />;
const Legend = ({ cls, t }: { cls: string; t: string }) => <span className="flex items-center gap-1.5"><span className={`h-2 w-4 rounded-sm ${cls}`} />{t}</span>;
