import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  FilePlus2,
  FolderTree,
  Gauge,
  Info,
  Maximize,
  Minus,
  MousePointer2,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  SquareStack,
  X,
  Zap,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { dcsInputs, dcsOutputs, type DcsPoint } from "@/lib/dcs-page";
import { assessDiagram, type ImportAssessment } from "@/lib/dxf-import";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/viewer")({
  head: () => ({
    meta: [
      { title: "LogicScope — Interactive DCS Diagram" },
      { name: "description", content: "Review, trace, and simulate DCS interlock logic from engineering drawings." },
      { property: "og:title", content: "LogicScope — Interactive DCS Diagram" },
      { property: "og:description", content: "Review, trace, and simulate DCS interlock logic from engineering drawings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DcsWorkspace,
});

const mainTripIds = new Set(dcsInputs.filter((point) => point.no >= 2 && point.no <= 19).map((point) => point.id));

function DcsWorkspace() {
  const zoomRef = useRef<ReactZoomPanPinchRef | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeInputs, setActiveInputs] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<DcsPoint>(dcsInputs[0]);
  const [simulation, setSimulation] = useState(true);
  const [query, setQuery] = useState("");
  const [assessment, setAssessment] = useState<ImportAssessment | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");

  const tripDemand = simulation && [...activeInputs].some((id) => mainTripIds.has(id));
  const purgePermissive = simulation && activeInputs.has("in-24") && activeInputs.has("in-25");
  const matchingIds = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return new Set<string>();
    return new Set([...dcsInputs, ...dcsOutputs].filter((point) =>
      [point.no, point.service, point.reference, point.location, point.tag].join(" ").toLowerCase().includes(normalized),
    ).map((point) => point.id));
  }, [query]);

  const toggleInput = (point: DcsPoint) => {
    setSelected(point);
    setActiveInputs((current) => {
      const next = new Set(current);
      if (next.has(point.id)) next.delete(point.id); else next.add(point.id);
      return next;
    });
  };

  const outputActive = (point: DcsPoint) => point.no === 59 ? !tripDemand : point.no === 75 ? purgePermissive : tripDemand;

  const handleFile = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      setAssessment(await assessDiagram(file));
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "The file could not be assessed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <main className="flex h-dvh min-h-[680px] flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-panel px-3 shadow-[0_1px_0_var(--grid-strong)]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-8 shrink-0 place-items-center border border-signal/40 bg-signal/10 text-signal"><Activity className="size-4" /></div>
          <div className="hidden sm:block"><p className="text-sm font-semibold leading-none">LogicScope</p><p className="mt-1 text-[10px] uppercase text-muted-foreground">DCS logic workspace</p></div>
          <div className="mx-1 h-7 w-px bg-border" />
          <button className="flex min-w-0 items-center gap-2 text-left" type="button">
            <div className="min-w-0"><p className="truncate text-xs font-semibold">DITL-03A</p><p className="truncate text-[10px] text-muted-foreground">MASTER FUEL TRIP (1) · Sheet 8</p></div>
            <ChevronDown className="size-3 text-muted-foreground" />
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative hidden w-64 lg:block"><Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tag, service, reference…" className="h-8 bg-surface pl-8 text-xs" /></div>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="border-signal/30 bg-signal/10 text-signal hover:bg-signal/20 hover:text-signal"><FilePlus2 /> <span className="hidden sm:inline">Import diagram</span></Button>
        </div>
      </header>

      <section className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-panel xl:flex">
          <div className="flex items-center justify-between border-b border-border px-3 py-3"><span className="text-[11px] font-semibold uppercase text-muted-foreground">Pages</span><SquareStack className="size-3.5 text-muted-foreground" /></div>
          <div className="p-2">
            <button type="button" className="w-full border-l-2 border-signal bg-signal/8 px-3 py-3 text-left">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold text-signal">DITL-03A</span><Badge className="h-5 bg-signal/15 px-1.5 text-[9px] text-signal shadow-none">LIVE</Badge></div>
              <p className="mt-1 text-[11px] text-foreground">Master Fuel Trip (1)</p><p className="mt-2 font-mono text-[9px] text-muted-foreground">DWG 03A · SHT 08</p>
            </button>
          </div>
          <div className="mt-auto border-t border-border p-3"><div className="flex items-center gap-2 text-[10px] text-muted-foreground"><FolderTree className="size-3.5" /><span>1 of 130 diagrams loaded</span></div></div>
        </aside>

        <div className="relative min-w-0 flex-1 bg-canvas">
          <div className="absolute left-3 top-3 z-20 flex items-center gap-1 border border-border bg-panel/95 p-1 shadow-lg">
            <ToolButton label="Select"><MousePointer2 /></ToolButton><div className="mx-1 h-5 w-px bg-border" />
            <ToolButton label="Zoom in" onClick={() => zoomRef.current?.zoomIn()}><Plus /></ToolButton>
            <ToolButton label="Zoom out" onClick={() => zoomRef.current?.zoomOut()}><Minus /></ToolButton>
            <ToolButton label="Fit drawing" onClick={() => zoomRef.current?.centerView(0.92)}><Maximize /></ToolButton>
            <ToolButton label="Reset view" onClick={() => zoomRef.current?.resetTransform()}><RotateCcw /></ToolButton>
          </div>
          <div className="absolute right-3 top-3 z-20 flex items-center gap-3 border border-border bg-panel/95 px-3 py-2 shadow-lg">
            <div><p className="text-[9px] uppercase text-muted-foreground">Simulation</p><p className={cn("text-[11px] font-semibold", simulation ? "text-signal" : "text-muted-foreground")}>{simulation ? "RUNNING" : "PAUSED"}</p></div>
            <Switch checked={simulation} onCheckedChange={setSimulation} aria-label="Toggle simulation" />
          </div>

          <TransformWrapper ref={zoomRef} initialScale={0.55} minScale={0.22} maxScale={3.2} centerOnInit wheel={{ step: 0.08 }} doubleClick={{ disabled: true }}>
            <TransformComponent wrapperClass="!h-full !w-full" contentClass="!h-[720px] !w-[1240px]">
              <LogicDiagram
                activeInputs={activeInputs}
                selected={selected}
                matchingIds={matchingIds}
                simulation={simulation}
                tripDemand={tripDemand}
                purgePermissive={purgePermissive}
                onInput={toggleInput}
                onSelect={setSelected}
                outputActive={outputActive}
              />
            </TransformComponent>
          </TransformWrapper>

          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 border border-border bg-panel/95 px-3 py-1.5 font-mono text-[9px] text-muted-foreground shadow-lg">SCROLL TO ZOOM · DRAG TO PAN · CLICK INPUTS TO TOGGLE</div>
        </div>

        <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-panel md:flex">
          <div className="border-b border-border px-4 py-3"><div className="flex items-center gap-2"><Info className="size-3.5 text-signal" /><span className="text-[11px] font-semibold uppercase">Point details</span></div></div>
          <PointDetails point={selected} active={selected.kind === "input" ? activeInputs.has(selected.id) : outputActive(selected)} />
          <div className="mt-auto border-t border-border p-4">
            <div className="mb-3 flex items-center justify-between"><span className="text-[10px] uppercase text-muted-foreground">Active conditions</span><span className="font-mono text-xs text-signal">{activeInputs.size}</span></div>
            <div className="h-1.5 overflow-hidden bg-surface"><div className="h-full bg-signal transition-all" style={{ width: `${Math.min(100, activeInputs.size * 9)}%` }} /></div>
            <Button variant="outline" size="sm" className="mt-3 w-full text-xs" disabled={!activeInputs.size} onClick={() => setActiveInputs(new Set())}><RotateCcw /> Clear simulation</Button>
          </div>
        </aside>
      </section>

      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-panel px-3 font-mono text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1.5 text-ok"><CircleDot className="size-2.5 fill-current" />SYSTEM READY</span><span>REV 1</span><span>2017-10-03</span><span className="ml-auto">SMC LIMAY · STATION 104</span>
      </footer>

      {importOpen && <ImportDialog assessment={assessment} importing={importing} error={importError} fileInputRef={fileInputRef} onClose={() => setImportOpen(false)} onFile={handleFile} />}
    </main>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick?: () => void; children: React.ReactNode }) {
  return <Button type="button" title={label} aria-label={label} variant="ghost" size="icon" onClick={onClick} className="size-7 text-muted-foreground hover:text-signal">{children}</Button>;
}

function PointDetails({ point, active }: { point: DcsPoint; active: boolean }) {
  return <div className="p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase text-muted-foreground">{point.kind} · Point {String(point.no).padStart(2, "0")}</p><h2 className="mt-2 text-sm font-semibold leading-5">{point.service}</h2></div><span className={cn("mt-1 size-2 shrink-0 rounded-full", active ? "bg-signal shadow-[0_0_10px_var(--signal)]" : "bg-muted-foreground/40")} /></div>
    <dl className="mt-5 space-y-4 text-xs">
      <Detail label={point.kind === "input" ? "From reference" : "To reference"} value={point.reference || "—"} mono />
      <Detail label="Location" value={point.location || "—"} />
      <Detail label="Tag / address" value={point.tag || "Not assigned"} mono />
      <Detail label="Logic path" value={point.logic || "Direct"} />
      <Detail label="Current state" value={active ? "TRUE · ENERGIZED" : "FALSE · NORMAL"} active={active} />
    </dl>
    <div className="mt-6 border border-border bg-surface p-3"><div className="flex gap-2"><SlidersHorizontal className="mt-0.5 size-3.5 shrink-0 text-signal" /><p className="text-[10px] leading-4 text-muted-foreground">Inputs support multiple selection. Click any other input to combine trigger conditions without clearing this one.</p></div></div>
  </div>;
}

function Detail({ label, value, mono, active }: { label: string; value: string; mono?: boolean; active?: boolean }) {
  return <div><dt className="mb-1 text-[9px] uppercase text-muted-foreground">{label}</dt><dd className={cn("leading-4", mono && "font-mono", active && "text-signal")}>{value}</dd></div>;
}

function LogicDiagram(props: {
  activeInputs: Set<string>; selected: DcsPoint; matchingIds: Set<string>; simulation: boolean; tripDemand: boolean; purgePermissive: boolean;
  onInput: (point: DcsPoint) => void; onSelect: (point: DcsPoint) => void; outputActive: (point: DcsPoint) => boolean;
}) {
  const { activeInputs, selected, matchingIds, simulation, tripDemand, purgePermissive, onInput, onSelect, outputActive } = props;
  const purgeOutput = dcsOutputs[7] ?? dcsOutputs[0];
  const rowY = (index: number) => 94 + index * 25;
  return <svg viewBox="0 0 1240 720" width="1240" height="720" className="block select-none" role="img" aria-label="Interactive Master Fuel Trip DCS logic diagram">
    <defs><pattern id="minorGrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" className="stroke-grid" strokeWidth="0.35" /></pattern><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#minorGrid)" /><path d="M 50 0 L 0 0 0 50" fill="none" className="stroke-grid-strong" strokeWidth="0.5" /></pattern></defs>
    <rect width="1240" height="720" className="fill-canvas" /><rect width="1240" height="720" fill="url(#grid)" />
    <rect x="28" y="28" width="1184" height="664" className="fill-none stroke-drawing-muted" strokeWidth="1" />
    <text x="620" y="51" textAnchor="middle" className="fill-drawing-muted font-mono text-[10px] tracking-[.4em]">LOGIC (INTERLOCK)</text>
    <text x="46" y="68" className="fill-drawing-muted font-mono text-[8px]">FROM / LOCATION / NO. / SERVICE</text><text x="978" y="68" className="fill-drawing-muted font-mono text-[8px]">SERVICE / NO. / LOCATION / TO</text>
    <line x1="42" y1="76" x2="1196" y2="76" className="stroke-drawing-muted" />

    {dcsInputs.slice(0, 18).map((point, index) => {
      const y = rowY(index); const active = activeInputs.has(point.id) && simulation; const chosen = selected.id === point.id; const match = matchingIds.has(point.id);
      return <g key={point.id} role="button" tabIndex={0} aria-label={`${point.no} ${point.service}`} onClick={() => onInput(point)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onInput(point); }} className="cursor-pointer outline-none">
        <rect x="42" y={y - 11} width="484" height="23" className={cn("fill-transparent", chosen && "fill-selected", match && "stroke-warning")} strokeWidth="1" />
        <text x="52" y={y + 3} className={cn("font-mono text-[8px]", active ? "fill-signal" : "fill-drawing-muted")}>{point.reference}</text>
        <text x="115" y={y + 3} className="fill-drawing-muted font-mono text-[8px]">{point.location}</text><text x="154" y={y + 3} className="fill-drawing-muted font-mono text-[8px]">{point.no}</text>
        <text x="184" y={y + 3} className={cn("text-[8px]", active ? "fill-signal font-semibold" : "fill-drawing")}>{point.service}</text>
        <line x1="420" y1={y} x2="538" y2={y} className={active ? "stroke-signal" : "stroke-drawing"} strokeWidth={active ? 2 : 1} />
        <circle cx="539" cy={y} r="3" className={active ? "fill-signal" : "fill-canvas stroke-drawing-muted"} />
      </g>;
    })}
    <line x1="539" y1="94" x2="539" y2="519" className={tripDemand ? "stroke-signal" : "stroke-drawing"} strokeWidth={tripDemand ? 3 : 2} />
    <path d="M539 306 L571 306 Q593 306 593 328 Q593 350 571 350 L539 350 Z" className={cn("fill-canvas", tripDemand ? "stroke-signal" : "stroke-drawing")} strokeWidth="1.5" /><text x="562" y="331" textAnchor="middle" className={tripDemand ? "fill-signal text-[9px]" : "fill-drawing text-[9px]"}>OR</text>
    <line x1="593" y1="328" x2="720" y2="328" className={tripDemand ? "stroke-signal" : "stroke-drawing"} strokeWidth={tripDemand ? 3 : 1.5} /><circle cx="645" cy="328" r="3" className={tripDemand ? "fill-signal" : "fill-drawing"} />
    <path d="M696 322 l12 6 -12 6 z" className="fill-canvas stroke-drawing" /><circle cx="711" cy="328" r="2.5" className="fill-canvas stroke-drawing" /><text x="696" y="316" className="fill-drawing-muted text-[8px]">NOT</text>
    <line x1="714" y1="328" x2="974" y2="328" className={!tripDemand && simulation ? "stroke-signal" : "stroke-drawing"} strokeWidth={!tripDemand && simulation ? 3 : 1.5} />
    <line x1="645" y1="328" x2="645" y2="464" className={tripDemand ? "stroke-signal" : "stroke-drawing"} /><line x1="645" y1="405" x2="766" y2="405" className={tripDemand ? "stroke-signal" : "stroke-drawing"} />
    <rect x="766" y="389" width="28" height="46" className={cn("fill-canvas", tripDemand ? "stroke-signal" : "stroke-drawing")} /><text x="780" y="405" textAnchor="middle" className="fill-drawing text-[8px]">S</text><text x="780" y="429" textAnchor="middle" className="fill-drawing text-[8px]">R</text>
    <line x1="794" y1="412" x2="892" y2="412" className={tripDemand ? "stroke-signal" : "stroke-drawing"} strokeWidth={tripDemand ? 3 : 1.5} />
    <line x1="892" y1="328" x2="892" y2="506" className={tripDemand ? "stroke-signal" : "stroke-drawing"} strokeWidth={tripDemand ? 3 : 1.5} />

    {dcsOutputs.slice(0, 7).map((point, index) => { const y = point.no === 59 ? 328 : 374 + index * 26; const active = outputActive(point) && simulation; return <g key={point.id} className="cursor-pointer" onClick={() => onSelect(point)}>
      <rect x="900" y={y - 11} width="296" height="22" className={cn("fill-transparent", selected.id === point.id && "fill-selected", matchingIds.has(point.id) && "stroke-warning")} />
      <line x1="892" y1={y} x2="976" y2={y} className={active ? "stroke-signal" : "stroke-drawing"} strokeWidth={active ? 3 : 1} />
      <circle cx="976" cy={y} r="3" className={active ? "fill-signal" : "fill-canvas stroke-drawing-muted"} />
      <text x="986" y={y + 3} className={cn("text-[8px]", active ? "fill-signal font-semibold" : "fill-drawing")}>{point.service}</text><text x="1115" y={y + 3} className="fill-drawing-muted font-mono text-[8px]">{point.no}</text><text x="1145" y={y + 3} className="fill-drawing-muted font-mono text-[7px]">{point.location}</text>
    </g>; })}

    <line x1="42" y1="560" x2="1196" y2="560" className="stroke-drawing-muted" strokeDasharray="8 3" />
    {dcsInputs.slice(18).map((point, index) => { const y = 588 + index * 36; const active = activeInputs.has(point.id) && simulation; return <g key={point.id} className="cursor-pointer" onClick={() => onInput(point)}>
      <rect x="42" y={y - 14} width="500" height="28" className={cn("fill-transparent", selected.id === point.id && "fill-selected")} />
      <text x="52" y={y + 3} className="fill-drawing-muted font-mono text-[8px]">{point.reference}</text><text x="154" y={y + 3} className="fill-drawing-muted font-mono text-[8px]">{point.no}</text><text x="184" y={y + 3} className={active ? "fill-signal text-[8px]" : "fill-drawing text-[8px]"}>{point.service}</text><text x="390" y={y + 3} className="fill-warning font-mono text-[8px]">{point.tag}</text><line x1="462" y1={y} x2="570" y2={y} className={active ? "stroke-signal" : "stroke-drawing"} />
    </g>; })}
    <path d="M570 624 H626 M570 660 H626 M626 612 V672 H660 V624 H626" className={purgePermissive ? "stroke-signal" : "stroke-drawing"} fill="none" strokeWidth={purgePermissive ? 3 : 1.5} /><text x="644" y="650" textAnchor="middle" className="fill-drawing text-[9px]">AND</text><line x1="660" y1="642" x2="976" y2="642" className={purgePermissive ? "stroke-signal" : "stroke-drawing"} strokeWidth={purgePermissive ? 3 : 1.5} />
    <g className="cursor-pointer" onClick={() => onSelect(purgeOutput)}><text x="986" y="645" className={purgePermissive ? "fill-signal text-[8px] font-semibold" : "fill-drawing text-[8px]"}>FURNACE PURGE PERMISSIVE</text><text x="1115" y="645" className="fill-drawing-muted font-mono text-[8px]">75</text><text x="1160" y="645" className="fill-drawing-muted font-mono text-[8px]">01-28</text></g>
    <text x="46" y="682" className="fill-drawing-muted font-mono text-[8px]">FORMOSA HEAVY INDUSTRIES CORP. · SMC LIMAY POWER PLANT PROJECT</text><text x="1190" y="682" textAnchor="end" className="fill-drawing-muted font-mono text-[8px]">DITL-03A · REV 1 · SHEET 8</text>
  </svg>;
}

function ImportDialog({ assessment, importing, error, fileInputRef, onClose, onFile }: { assessment: ImportAssessment | null; importing: boolean; error: string; fileInputRef: React.RefObject<HTMLInputElement | null>; onClose: () => void; onFile: (file?: File) => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-overlay p-4" role="dialog" aria-modal="true" aria-labelledby="import-title">
    <div className="w-full max-w-lg border border-border bg-panel shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 id="import-title" className="text-sm font-semibold">Import logic diagram</h2><p className="mt-1 text-[11px] text-muted-foreground">DXF for interactive logic · PDF for visual reference</p></div><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close import"><X /></Button></div>
      <div className="p-5">
        <input ref={fileInputRef} type="file" accept=".dxf,.pdf" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-40 w-full flex-col items-center justify-center border border-dashed border-signal/40 bg-signal/5 px-6 text-center transition-colors hover:bg-signal/10">
          <FilePlus2 className="size-7 text-signal" /><span className="mt-3 text-sm font-medium">Choose DXF or PDF</span><span className="mt-1 text-[10px] text-muted-foreground">One drawing per import · DWG should be exported to DXF first</span>
        </button>
        {importing && <div className="mt-4 flex items-center gap-2 text-xs text-signal"><Activity className="size-4 animate-pulse" /> Inspecting drawing structure…</div>}
        {error && <p className="mt-4 border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</p>}
        {assessment && <div className="mt-4 border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{assessment.fileName}</p><p className="mt-1 text-[10px] text-muted-foreground">{assessment.format} import assessment</p></div><Badge className={cn("shadow-none", assessment.status === "ready" ? "bg-ok/15 text-ok" : "bg-warning/15 text-warning")}>{assessment.status === "ready" ? "DETECTED" : "REVIEW"}</Badge></div>
          {assessment.entities !== undefined && <div className="mt-4 grid grid-cols-4 gap-2">{[["Entities", assessment.entities], ["Text", assessment.textItems], ["Lines", assessment.lines], ["Arcs", assessment.circles]].map(([label, value]) => <div key={label} className="border border-border p-2 text-center"><p className="font-mono text-sm text-signal">{value}</p><p className="mt-1 text-[8px] uppercase text-muted-foreground">{label}</p></div>)}</div>}
          <p className="mt-4 text-[11px] leading-5 text-muted-foreground">{assessment.message}</p>
        </div>}
        <div className="mt-5 flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /><p className="text-[10px] leading-4 text-muted-foreground">Your 130 matching drawings can use this same workflow. Raw line-and-arc symbols are grouped by geometry, nearby labels, and connected wires, then uncertain groups are reviewed once.</p></div>
      </div>
    </div>
  </div>;
}