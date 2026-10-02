import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SYMBOLS } from "@/lib/logic/library";
import type { Recognition } from "@/lib/logic/recognize";
import type { NodeType, SignalSource } from "@/lib/logic/types";

const cell = "w-full rounded border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring";
const LOW = 0.7;

export function ImportReview({ open, image, rec, onCancel, onAccept }: {
  open: boolean; image: string | null; rec: Recognition | null; onCancel: () => void; onAccept: (r: Recognition) => void;
}) {
  const [r, setR] = useState<Recognition | null>(rec);
  const [tab, setTab] = useState<"nodes" | "wires">("nodes");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const cur = r ?? rec;
  if (!cur) return null;
  const upd = (fn: (x: Recognition) => void) => { const c = structuredClone(cur); fn(c); setR(c); };
  const flaggedN = cur.nodes.filter((n) => n.confidence < LOW).length;
  const flaggedW = cur.wires.filter((w) => w.confidence < LOW).length;
  const nodeName = (id: string) => { const n = cur.nodes.find((x) => x.id === id); return n ? `${n.tag || SYMBOLS[n.type].name}` : id; };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col gap-3 p-4 sm:max-w-[96vw]">
        <DialogHeader>
          <DialogTitle>Review import · {cur.title}</DialogTitle>
          <DialogDescription>
            {cur.nodes.length} symbols and {cur.wires.length} connections recognized.{" "}
            {flaggedN + flaggedW > 0 ? <span className="font-medium text-trace-up">{flaggedN + flaggedW} items need checking.</span> : "Everything was read with high confidence."}
          </DialogDescription>
        </DialogHeader>
        {cur.warnings.length > 0 && (
          <div className="rounded-md border border-trace-up/40 bg-trace-up/10 p-2 text-xs">
            {cur.warnings.map((w, i) => <div key={i} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 shrink-0 text-trace-up" />{w}</div>)}
          </div>
        )}
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="min-h-40 overflow-auto rounded-md border bg-canvas">
            {image && <img src={image} alt="Imported drawing" className="w-full" />}
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {(["nodes", "wires"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-xs font-medium ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {t === "nodes" ? `Symbols (${flaggedN} flagged)` : `Connections (${flaggedW} flagged)`}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-xs"><input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />Only flagged</label>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              {tab === "nodes" ? (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr>
                    <th className="p-1.5">Use</th><th className="p-1.5">Conf.</th><th className="p-1.5">Symbol</th><th className="p-1.5">Tag</th><th className="p-1.5">Service / label</th><th className="p-1.5">Source</th><th className="p-1.5">Addresses</th><th className="p-1.5">Sec</th>
                  </tr></thead>
                  <tbody>
                    {cur.nodes.map((n, i) => (onlyFlagged && n.confidence >= LOW) ? null : (
                      <tr key={n.id} className={`border-t align-top ${n.confidence < LOW ? "bg-trace-up/10" : ""}`}>
                        <td className="p-1.5"><input type="checkbox" checked={n.include} onChange={(e) => upd((c) => { c.nodes[i].include = e.target.checked; })} /></td>
                        <td className="p-1.5 font-mono" title={n.note}>{Math.round(n.confidence * 100)}%{n.note && <div className="mt-0.5 max-w-32 text-[10px] text-muted-foreground">{n.note}</div>}</td>
                        <td className="p-1.5"><select className={cell} value={n.type} onChange={(e) => upd((c) => { c.nodes[i].type = e.target.value as NodeType; c.nodes[i].confidence = 1; })}>
                          {Object.values(SYMBOLS).map((s) => <option key={s.type} value={s.type}>{s.name}</option>)}</select></td>
                        <td className="p-1.5"><input className={`${cell} font-mono`} value={n.tag ?? ""} onChange={(e) => upd((c) => { c.nodes[i].tag = e.target.value; })} /></td>
                        <td className="p-1.5"><input className={cell} value={n.service ?? n.label} onChange={(e) => upd((c) => { c.nodes[i].service = e.target.value; c.nodes[i].label = e.target.value; })} /></td>
                        <td className="p-1.5"><select className={cell} value={n.source ?? ""} onChange={(e) => upd((c) => { c.nodes[i].source = (e.target.value || undefined) as SignalSource; })}>
                          <option value="">—</option><option>HARDWIRE</option><option>IRP</option><option>ARP</option><option>CRT</option><option>DCS</option></select></td>
                        <td className="p-1.5"><input className={`${cell} font-mono`} value={n.addresses.join(", ")} onChange={(e) => upd((c) => { c.nodes[i].addresses = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); })} /></td>
                        <td className="p-1.5">{SYMBOLS[n.type].category === "Timer" ? <input type="number" className={`${cell} w-14`} value={n.sec ?? 1} onChange={(e) => upd((c) => { c.nodes[i].sec = Number(e.target.value); })} /> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left text-muted-foreground"><tr><th className="p-1.5">Use</th><th className="p-1.5">Conf.</th><th className="p-1.5">From</th><th className="p-1.5">To</th><th className="p-1.5">Input #</th></tr></thead>
                  <tbody>
                    {cur.wires.map((w, i) => (onlyFlagged && w.confidence >= LOW) ? null : (
                      <tr key={w.id} className={`border-t ${w.confidence < LOW ? "bg-trace-up/10" : ""}`}>
                        <td className="p-1.5"><input type="checkbox" checked={w.include} onChange={(e) => upd((c) => { c.wires[i].include = e.target.checked; })} /></td>
                        <td className="p-1.5 font-mono">{Math.round(w.confidence * 100)}%</td>
                        <td className="p-1.5"><select className={cell} value={w.from} onChange={(e) => upd((c) => { c.wires[i].from = e.target.value; c.wires[i].confidence = 1; })}>
                          {cur.nodes.map((n) => <option key={n.id} value={n.id}>{nodeName(n.id)}</option>)}</select></td>
                        <td className="p-1.5"><select className={cell} value={w.to} onChange={(e) => upd((c) => { c.wires[i].to = e.target.value; c.wires[i].confidence = 1; })}>
                          {cur.nodes.map((n) => <option key={n.id} value={n.id}>{nodeName(n.id)}</option>)}</select></td>
                        <td className="p-1.5"><input type="number" min={1} max={8} className={`${cell} w-14`} value={w.toPort + 1} onChange={(e) => upd((c) => { c.wires[i].toPort = Math.max(0, Number(e.target.value) - 1); })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button>
          <button onClick={() => onAccept(cur)} className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Check className="h-4 w-4" />Load into builder</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
