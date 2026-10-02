import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload, Download, Maximize, Minimize, ZoomIn, ZoomOut, Scan, Crosshair, Sun, Moon, Play, Wrench, BookOpen,
  PanelLeft, PanelRight, RotateCcw, FilePlus, Loader2, Search, X, ListTree,
} from "lucide-react";
import { toast } from "sonner";
import { Canvas, type CanvasHandle } from "@/components/dcs/Canvas";
import { Inspector } from "@/components/dcs/Inspector";
import { ImportReview } from "@/components/dcs/ImportReview";
import { GlyphPreview } from "@/components/dcs/Glyph";
import { emptySim, step, trace, type SimState } from "@/lib/logic/engine";
import { inputCount, isSink, isSource, newNode, nodeSize, SOURCE_LABEL, SYMBOLS, type SymbolCategory } from "@/lib/logic/library";
import { sampleDiagram } from "@/lib/logic/sample";
import { recognizeImage, recognitionToDiagram, type Recognition } from "@/lib/logic/recognize";
import { fileToDataUrl, renderDxfToImage } from "@/lib/logic/dxf";
import type { Diagram, LogicNode, Selection } from "@/lib/logic/types";

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

function Workspace() {
  const [d, setD] = useState<Diagram>(() => sampleDiagram());
  const [sel, setSel] = useState<Selection>(null);
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

  const press = useCallback((id: string, down: boolean) => { forced.current = { ...forced.current, [id]: down }; }, []);
  const toggle = useCallback((id: string) => { forced.current = { ...forced.current, [id]: !forced.current[id] }; }, []);
  const resetSim = () => { forced.current = {}; setSim(emptySim()); setLog([]); };

  const updateNode = (id: string, patch: Partial<LogicNode>) =>
    setD((x) => {
      const nodes = x.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
      const n = nodes.find((k) => k.id === id)!;
      return { ...x, nodes, wires: x.wires.filter((w) => w.to !== id || w.toPort < inputCount(n)) };
    });
  const del = () => {
    if (!sel) return;
    setD((x) => sel.kind === "node"
      ? { ...x, nodes: x.nodes.filter((n) => n.id !== sel.id), wires: x.wires.filter((w) => w.from !== sel.id && w.to !== sel.id) }
      : { ...x, wires: x.wires.filter((w) => w.id !== sel.id) });
    setSel(null);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea,select")) return;
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
              onSelect={setSel} onMove={(id, x, y) => updateNode(id, { x, y })} onConnect={connect} onPress={press} onToggle={toggle} />
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
              <span>Scroll / pinch = zoom · Shift+scroll = move · double-click = fit</span>
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
  const cats: SymbolCategory[] = ["Input", "Logic", "Timer", "Memory", "Output"];
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
                    <div className="h-9 rounded bg-canvas"><GlyphPreview node={{ ...newNode(s.type, 0, 0, "p"), tag: s.type === "INPUT" || s.type === "OUTPUT" ? "TAG" : "" }} /></div>
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
const Legend = ({ cls, t }: { cls: string; t: string }) => <span className="flex items-center gap-1.5"><span className={`h-2 w-4 rounded-sm ${cls}`} />{t}</span>;
