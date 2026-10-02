import { Trash2, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { GATE_STYLES, inputCount, isGate, isSink, isSource, MAX_GATE_INPUTS, portName, SYMBOLS } from "@/lib/logic/library";
import { inputsOf, type SimState } from "@/lib/logic/engine";
import type { Diagram, GateStyle, LogicNode, NodeType, Selection, SignalSource } from "@/lib/logic/types";
import { GlyphPreview } from "./Glyph";

const field = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const Dot = ({ on }: { on: boolean }) => (
  <span className={`inline-flex h-5 min-w-8 items-center justify-center rounded px-1 font-mono text-[11px] font-semibold ${on ? "bg-signal-on text-signal-on-foreground" : "bg-muted text-muted-foreground"}`}>{on ? "1" : "0"}</span>
);

export function Inspector({ d, sel, sim, mode, trace, onSelect, onChange, onDelete }: {
  d: Diagram; sel: Selection; sim: SimState; mode: "build" | "simulate";
  trace: { upN: Set<string>; downN: Set<string> } | null;
  onSelect: (s: Selection) => void; onChange: (id: string, patch: Partial<LogicNode>) => void; onDelete: () => void;
}) {
  if (!sel) return (
    <div className="space-y-3 p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Nothing selected</p>
      <p>Click any signal, symbol or wire to trace it. Upstream causes glow <span className="font-semibold text-trace-up">amber</span>, downstream effects <span className="font-semibold text-trace-down">cyan</span>.</p>
      <div className="grid grid-cols-2 gap-2 pt-2 font-mono text-xs">
        <Stat k="Symbols" v={d.nodes.length} /><Stat k="Wires" v={d.wires.length} />
        <Stat k="Inputs" v={d.nodes.filter((n) => isSource(n.type)).length} /><Stat k="Outputs" v={d.nodes.filter((n) => isSink(n.type)).length} />
      </div>
    </div>
  );
  const nameOf = (id: string) => { const n = d.nodes.find((x) => x.id === id); return n ? n.tag || n.label : id; };

  if (sel.kind === "wire") {
    const w = d.wires.find((x) => x.id === sel.id);
    if (!w) return null;
    const on = !!sim.out[w.from]?.[w.fromPort];
    return (
      <div className="space-y-4 p-4 text-sm">
        <Header title="Wire" sub={w.label || w.id} />
        <Row k="Value"><Dot on={on} /></Row>
        <button className="block w-full rounded-md border p-2 text-left hover:bg-accent" onClick={() => onSelect({ kind: "node", id: w.from })}>
          <span className="text-xs text-muted-foreground">From</span><div className="font-mono">{nameOf(w.from)}</div>
        </button>
        <button className="block w-full rounded-md border p-2 text-left hover:bg-accent" onClick={() => onSelect({ kind: "node", id: w.to })}>
          <span className="text-xs text-muted-foreground">To · input {w.toPort + 1}</span><div className="font-mono">{nameOf(w.to)}</div>
        </button>
        {mode === "build" && <DeleteBtn onClick={onDelete} />}
      </div>
    );
  }

  const n = d.nodes.find((x) => x.id === sel.id);
  if (!n) return null;
  const def = SYMBOLS[n.type];
  const ins = inputsOf(d, sim, n.id);
  const outs = sim.out[n.id] ?? [];
  const up = d.wires.filter((w) => w.to === n.id);
  const down = d.wires.filter((w) => w.from === n.id);
  const io = isSource(n.type) || isSink(n.type);
  const edit = mode === "build";

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex items-start gap-3">
        <div className="h-14 w-20 shrink-0 rounded-md border bg-canvas p-1"><GlyphPreview node={n} /></div>
        <Header title={def.name} sub={def.category} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{def.description}</p>

      <section className="rounded-md border p-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Live state</h4>
        <div className="space-y-1.5">
          {ins.map((v, i) => <Row key={i} k={`In ${portName(n, i, "in")}`}><Dot on={v} /></Row>)}
          {outs.map((v, i) => <Row key={`o${i}`} k={def.outputs > 1 ? `Out ${portName(n, i, "out")}` : "Output"}><Dot on={v} /></Row>)}
        </div>
      </section>

      {def.truth && (
        <section><h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Truth table</h4>
          <pre className="rounded-md bg-muted p-2 font-mono text-xs leading-5">{def.truth}</pre></section>
      )}

      <section className="space-y-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Properties</h4>
        <label className="block space-y-1"><span className="text-xs text-muted-foreground">Symbol</span>
          <select disabled={!edit} className={field} value={n.type} onChange={(e) => onChange(n.id, { type: e.target.value as NodeType })}>
            {Object.values(SYMBOLS).map((s) => <option key={s.type} value={s.type}>{s.category} · {s.name}</option>)}
          </select></label>
        {io && <>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Tag no.</span>
            <input disabled={!edit} className={`${field} font-mono`} value={n.tag ?? ""} onChange={(e) => onChange(n.id, { tag: e.target.value })} /></label>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Service</span>
            <input disabled={!edit} className={field} value={n.service ?? ""} onChange={(e) => onChange(n.id, { service: e.target.value })} /></label>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Signal source</span>
            <select disabled={!edit} className={field} value={n.source ?? "DCS"} onChange={(e) => onChange(n.id, { source: e.target.value as SignalSource })}>
              <option value="HARDWIRE">Hardwire</option><option value="IRP">IRP</option><option value="ARP">ARP</option><option value="CRT">CRT display</option><option value="DCS">DCS internal</option>
            </select></label>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Addresses (one per line)</span>
            <textarea disabled={!edit} rows={Math.max(2, n.addresses.length)} className={`${field} font-mono`} value={n.addresses.join("\n")}
              onChange={(e) => onChange(n.id, { addresses: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} /></label>
        </>}
        {!io && n.type !== "TEXT" && <label className="block space-y-1"><span className="text-xs text-muted-foreground">Label</span>
          <input disabled={!edit} className={field} value={n.label} onChange={(e) => onChange(n.id, { label: e.target.value })} /></label>}
        {n.type === "TEXT" && <>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Text</span>
            <textarea disabled={!edit} rows={3} className={field} value={n.label} onChange={(e) => onChange(n.id, { label: e.target.value })} /></label>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Font size</span>
            <input disabled={!edit} type="number" min={6} max={72} className={field} value={n.fontSize ?? 12} onChange={(e) => onChange(n.id, { fontSize: Math.max(6, Math.min(72, Number(e.target.value) || 12)) })} /></label>
        </>}
        {isGate(n.type) && <label className="block space-y-1"><span className="text-xs text-muted-foreground">Symbol style</span>
          <select disabled={!edit} className={field} value={n.style ?? ""} onChange={(e) => onChange(n.id, { style: (e.target.value || undefined) as GateStyle | undefined })}>
            <option value="">Diagram default ({GATE_STYLES.find((g) => g.id === (d.gateStyle ?? "dcs"))?.name})</option>
            {GATE_STYLES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select></label>}
        {def.category === "Timer" && <label className="block space-y-1"><span className="text-xs text-muted-foreground">Time (seconds)</span>
          <input disabled={!edit} type="number" min={0.1} step={0.1} className={field} value={n.sec ?? 1} onChange={(e) => onChange(n.id, { sec: Math.max(0.1, Number(e.target.value)) })} /></label>}
        {def.variableInputs && <div className="space-y-1"><span className="text-xs text-muted-foreground">Inputs (2–{MAX_GATE_INPUTS})</span>
          <div className="flex gap-1">
            <button disabled={!edit || inputCount(n) <= 2} onClick={() => onChange(n.id, { inputs: inputCount(n) - 1 })} className="w-9 rounded-md border font-mono disabled:opacity-40" aria-label="Remove input">−</button>
            <input disabled={!edit} type="number" min={2} max={MAX_GATE_INPUTS} className={`${field} text-center`} value={inputCount(n)} onChange={(e) => onChange(n.id, { inputs: Number(e.target.value) })} />
            <button disabled={!edit || inputCount(n) >= MAX_GATE_INPUTS} onClick={() => onChange(n.id, { inputs: inputCount(n) + 1 })} className="w-9 rounded-md border font-mono disabled:opacity-40" aria-label="Add input">+</button>
          </div></div>}
        {n.note && <p className="rounded-md border border-trace-up/40 bg-trace-up/10 p-2 text-xs">{n.note}</p>}
      </section>

      <TraceList icon={<ArrowDownToLine className="h-3.5 w-3.5" />} title="Driven by" color="text-trace-up" items={up.map((w) => w.from)} d={d} onSelect={onSelect} sim={sim} />
      <TraceList icon={<ArrowUpFromLine className="h-3.5 w-3.5" />} title="Drives" color="text-trace-down" items={down.map((w) => w.to)} d={d} onSelect={onSelect} sim={sim} />
      {trace && <p className="text-xs text-muted-foreground">Full chain: {trace.upN.size - 1} upstream · {trace.downN.size - 1} downstream</p>}
      {edit && <DeleteBtn onClick={onDelete} />}
    </div>
  );
}

function TraceList({ title, items, d, onSelect, color, icon, sim }: { title: string; items: string[]; d: Diagram; onSelect: (s: Selection) => void; color: string; icon: React.ReactNode; sim: SimState }) {
  return (
    <section>
      <h4 className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${color}`}>{icon}{title}</h4>
      {!items.length && <p className="text-xs text-muted-foreground">—</p>}
      <div className="space-y-1">
        {items.map((id, i) => { const n = d.nodes.find((x) => x.id === id); if (!n) return null; return (
          <button key={id + i} onClick={() => onSelect({ kind: "node", id })} className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-accent">
            <span className="min-w-0 truncate"><span className="font-mono">{n.tag || SYMBOLS[n.type].name}</span> <span className="text-muted-foreground">{n.service ?? ""}</span></span>
            <Dot on={!!sim.out[id]?.[0]} />
          </button>); })}
      </div>
    </section>
  );
}
const Header = ({ title, sub }: { title: string; sub: string }) => (<div className="min-w-0"><h3 className="truncate text-base font-semibold">{title}</h3><p className="truncate font-mono text-xs text-muted-foreground">{sub}</p></div>);
const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (<div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{k}</span>{children}</div>);
const Stat = ({ k, v }: { k: string; v: number }) => (<div className="rounded-md border p-2"><div className="text-muted-foreground">{k}</div><div className="text-lg text-foreground">{v}</div></div>);
const DeleteBtn = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} className="flex w-full items-center justify-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" />Delete</button>
);
