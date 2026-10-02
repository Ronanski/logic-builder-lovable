import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { inPort, inputCount, isSource, nodeSize, outPort, portName, SYMBOLS } from "@/lib/logic/library";
import { timerRemaining, type SimState } from "@/lib/logic/engine";
import type { Diagram, Selection } from "@/lib/logic/types";
import { Glyph } from "./Glyph";

type VB = { x: number; y: number; w: number; h: number };
export interface CanvasHandle { fit: () => void; zoom: (f: number) => void; focus: () => void }

interface Props {
  diagram: Diagram;
  sim: SimState;
  mode: "build" | "simulate";
  selection: Selection;
  traceSets: ReturnType<typeof import("@/lib/logic/engine").trace>;
  autoFit: boolean;
  now: number;
  onSelect: (s: Selection) => void;
  selectedIds: Set<string>;
  onNodeClick: (id: string, additive: boolean) => void;
  onMarquee: (ids: string[], additive: boolean) => void;
  onMoveMany: (moves: { id: string; x: number; y: number }[]) => void;
  onConnect: (from: string, fromPort: number, to: string, toPort: number) => void;
  onPress: (id: string, down: boolean) => void;
  onToggle: (id: string) => void;
}

function bbox(d: Diagram): VB {
  if (!d.nodes.length) return { x: 0, y: 0, w: 800, h: 500 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of d.nodes) {
    const s = nodeSize(n);
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + s.w); y1 = Math.max(y1, n.y + s.h);
  }
  const p = 40;
  return { x: x0 - p, y: y0 - p, w: x1 - x0 + 2 * p, h: y1 - y0 + 2 * p };
}

function route(a: { x: number; y: number }, b: { x: number; y: number }, lane: number) {
  if (b.x > a.x + 20) {
    const mx = Math.round(a.x + Math.max(12, Math.min(b.x - a.x - 12, (b.x - a.x) / 2 + lane)));
    return `M${a.x} ${a.y} H${mx} V${b.y} H${b.x}`;
  }
  const ym = Math.max(a.y, b.y) + 24 + Math.abs(lane);
  return `M${a.x} ${a.y} H${a.x + 14} V${ym} H${b.x - 14} V${b.y} H${b.x}`;
}

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(p, ref) {
  const { diagram: d, sim, mode, selection, traceSets: tr } = p;
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const box = useMemo(() => bbox(d), [d]);
  const [vb, setVb] = useState<VB>(box);
  const vbRef = useRef(vb); vbRef.current = vb;
  const boxRef = useRef(box); boxRef.current = box;
  const [pending, setPending] = useState<{ node: string; port: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; origins: { id: string; x: number; y: number }[]; moved: boolean } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number; add: boolean } | null>(null);
  const [pressed, setPressed] = useState<string | null>(null);

  const fit = useCallback(() => setVb(boxRef.current), []);
  const toSvg = (cx: number, cy: number) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, y: r.y };
  };
  const zoomAt = useCallback((f: number, px?: number, py?: number) => {
    setVb((v) => {
      const b = boxRef.current;
      const nw = Math.max(b.w * 0.08, Math.min(b.w * 1.2, v.w * f));
      const k = nw / v.w;
      const cx = px ?? v.x + v.w / 2, cy = py ?? v.y + v.h / 2;
      let x = cx - (cx - v.x) * k, y = cy - (cy - v.y) * k;
      const w = v.w * k, h = v.h * k;
      // keep view centre inside content
      x = Math.min(Math.max(x, b.x - w / 2), b.x + b.w - w / 2);
      y = Math.min(Math.max(y, b.y - h / 2), b.y + b.h - h / 2);
      return { x, y, w, h };
    });
  }, []);

  useImperativeHandle(ref, () => ({
    fit,
    zoom: (f) => zoomAt(f),
    focus: () => {
      if (!selection) return fit();
      const ids = selection.kind === "node" ? [selection.id] : (() => { const w = d.wires.find((x) => x.id === selection.id); return w ? [w.from, w.to] : []; })();
      const ns = d.nodes.filter((n) => ids.includes(n.id) || tr?.upN.has(n.id) || tr?.downN.has(n.id));
      if (!ns.length) return;
      const b = bbox({ ...d, nodes: ns });
      setVb(b);
    },
  }), [fit, zoomAt, selection, d, tr]);

  // autofit when structure/size changes
  const structKey = `${d.nodes.length}:${d.name}`;
  useEffect(() => { if (p.autoFit) fit(); }, [structKey, p.autoFit, fit]);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => { if (p.autoFit) fit(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [p.autoFit, fit]);

  // non-passive wheel zoom (pinch included); shift = pan
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    if (e.shiftKey && !e.ctrlKey) {
      setVb((v) => {
        const b = boxRef.current;
        const y = Math.min(Math.max(v.y + (dy * v.h) / 800, b.y - v.h / 2), b.y + b.h - v.h / 2);
        const x = Math.min(Math.max(v.x + (e.deltaX * v.w) / 800, b.x - v.w / 2), b.x + b.w - v.w / 2);
        return { ...v, x, y };
      });
      return;
    }
    const pt = toSvg(e.clientX, e.clientY);
    zoomAt(Math.exp(dy * (e.ctrlKey ? 0.01 : 0.0015)), pt.x, pt.y);
  };
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const h = (e: WheelEvent) => { e.preventDefault(); wheelRef.current(e); };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  // pinch on touch screens
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef<number | null>(null);

  const val = (id: string, i = 0) => !!sim.out[id]?.[i];
  const traceActive = !!tr;
  const nodeCls = (id: string) => {
    if (!tr) return "";
    if (selection?.kind === "node" && selection.id === id) return "";
    if (tr.upN.has(id) || tr.downN.has(id)) return "";
    return "opacity-25";
  };

  const lanes = useMemo(() => {
    const m = new Map<string, number>();
    d.wires.forEach((w, i) => m.set(w.id, ((i % 5) - 2) * 6));
    return m;
  }, [d.wires]);

  const junctions = useMemo(() => {
    const count = new Map<string, number>();
    d.wires.forEach((w) => count.set(`${w.from}:${w.fromPort}`, (count.get(`${w.from}:${w.fromPort}`) ?? 0) + 1));
    return count;
  }, [d.wires]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-canvas" style={{ touchAction: "none" }}>
      <svg
        ref={svgRef}
        className="h-full w-full select-none"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (e.target === e.currentTarget || (e.target as Element).getAttribute("data-bg")) {
            setPending(null);
            const add = e.shiftKey || e.ctrlKey || e.metaKey;
            if (mode === "build" && e.button === 0 && pointers.current.size === 1) {
              const pt = toSvg(e.clientX, e.clientY);
              setMarquee({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, add });
            }
            if (!add) p.onSelect(null);
          }
        }}
        onPointerMove={(e) => {
          if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinchDist.current) { const c = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2); zoomAt(pinchDist.current / dist, c.x, c.y); }
            pinchDist.current = dist;
            return;
          }
          const pt = toSvg(e.clientX, e.clientY);
          if (pending) setCursor(pt);
          if (marquee) setMarquee({ ...marquee, x1: pt.x, y1: pt.y });
          const dr = drag.current;
          if (dr && mode === "build") {
            const dx = Math.round((pt.x - dr.sx) / 10) * 10, dy = Math.round((pt.y - dr.sy) / 10) * 10;
            if (!dx && !dy && !dr.moved) return;
            dr.moved = true;
            p.onMoveMany(dr.origins.map((o) => ({ id: o.id, x: o.x + dx, y: o.y + dy })));
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId); pinchDist.current = null;
          drag.current = null;
          if (marquee) {
            const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1);
            const y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1);
            if (x1 - x0 > 3 || y1 - y0 > 3) {
              const ids = d.nodes.filter((n) => { const z = nodeSize(n); return n.x < x1 && n.x + z.w > x0 && n.y < y1 && n.y + z.h > y0; }).map((n) => n.id);
              p.onMarquee(ids, marquee.add);
            }
            setMarquee(null);
          }
          if (pressed) { p.onPress(pressed, false); setPressed(null); }
        }}
        onPointerLeave={() => { if (pressed) { p.onPress(pressed, false); setPressed(null); } }}
        onDoubleClick={(e) => { if (e.target === e.currentTarget || (e.target as Element).getAttribute("data-bg")) fit(); }}
      >
        <defs>
          <pattern id="grid" width={20} height={20} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={0.8} className="fill-grid" />
          </pattern>
        </defs>
        <rect data-bg="1" x={box.x - 4000} y={box.y - 4000} width={box.w + 8000} height={box.h + 8000} fill="url(#grid)" />

        {/* wires */}
        {d.wires.map((w) => {
          const a = d.nodes.find((n) => n.id === w.from), b = d.nodes.find((n) => n.id === w.to);
          if (!a || !b) return null;
          const pa = outPort(a, w.fromPort), pb = inPort(b, w.toPort);
          const on = val(w.from, w.fromPort);
          const isSel = selection?.kind === "wire" && selection.id === w.id;
          const up = tr?.upW.has(w.id), down = tr?.downW.has(w.id);
          const color = isSel ? "stroke-primary" : up ? "stroke-trace-up" : down ? "stroke-trace-down" : on ? "stroke-signal-on" : "stroke-wire";
          const dim = traceActive && !up && !down && !isSel ? "opacity-20" : "";
          const path = route(pa, pb, lanes.get(w.id) ?? 0);
          return (
            <g key={w.id} className={dim}>
              <path d={path} fill="none" stroke="transparent" strokeWidth={12} className="cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); p.onSelect({ kind: "wire", id: w.id }); }} />
              <path d={path} fill="none" className={`${color} pointer-events-none transition-colors`} strokeWidth={isSel || up || down ? 2.6 : on ? 2 : 1.3} strokeLinejoin="round" />
              {(junctions.get(`${w.from}:${w.fromPort}`) ?? 0) > 1 && <circle cx={pa.x + 8} cy={pa.y} r={2.6} className={color.replace("stroke-", "fill-")} />}
              {w.label && <text x={(pa.x + pb.x) / 2} y={pb.y - 4} textAnchor="middle" className="fill-muted-foreground font-mono pointer-events-none" fontSize={8}>{w.label}</text>}
            </g>
          );
        })}

        {pending && cursor && (() => {
          const n = d.nodes.find((x) => x.id === pending.node);
          if (!n) return null;
          const a = outPort(n, pending.port);
          return <path d={`M${a.x} ${a.y} H${(a.x + cursor.x) / 2} V${cursor.y} H${cursor.x}`} fill="none" className="stroke-primary pointer-events-none" strokeDasharray="4 3" strokeWidth={1.6} />;
        })()}

        {/* group outlines */}
        {mode === "build" && [...new Set(d.nodes.map((n) => n.group).filter(Boolean))].map((g) => {
          const ns = d.nodes.filter((n) => n.group === g);
          const b = bbox({ ...d, nodes: ns });
          return <rect key={g} x={b.x + 30} y={b.y + 30} width={b.w - 60} height={b.h - 60} rx={8} fill="none" className="stroke-muted-foreground pointer-events-none" strokeDasharray="2 4" strokeWidth={1} />;
        })}

        {/* nodes */}
        {d.nodes.map((n) => {
          const s = nodeSize(n);
          const isSel = p.selectedIds.has(n.id) || (selection?.kind === "node" && selection.id === n.id);
          const up = tr?.upN.has(n.id) && !isSel, down = tr?.downN.has(n.id) && !isSel;
          const src = isSource(n.type);
          const on = src ? val(n.id) : SYMBOLS[n.type].category === "Output" ? (() => { const w = d.wires.find((x) => x.to === n.id); return w ? val(w.from, w.fromPort) : false; })() : val(n.id);
          const rem = SYMBOLS[n.type].category === "Timer" ? timerRemaining(sim, n.id, n.type, n.sec ?? 1, p.now) : null;
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} className={`${nodeCls(n.id)} transition-opacity`}>
              {(isSel || up || down) && (
                <rect x={-5} y={-5} width={s.w + 10} height={s.h + 10} rx={6} fill="none"
                  className={isSel ? "stroke-primary" : up ? "stroke-trace-up" : "stroke-trace-down"} strokeWidth={isSel ? 2 : 1.4} strokeDasharray={isSel ? undefined : "4 3"} />
              )}
              <g
                className={mode === "build" ? "cursor-move" : src ? "cursor-pointer" : "cursor-default"}
                onDoubleClick={(e) => { if (mode === "build" && src && n.type !== "PB") { e.stopPropagation(); p.onToggle(n.id); } }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const add = e.shiftKey || e.ctrlKey || e.metaKey;
                  if (mode === "build") {
                    const pt = toSvg(e.clientX, e.clientY);
                    if (add) { p.onNodeClick(n.id, true); return; }
                    const grp = n.group ? d.nodes.filter((k) => k.group === n.group).map((k) => k.id) : [n.id];
                    const ids = p.selectedIds.has(n.id) ? [...new Set([...p.selectedIds, ...grp])] : grp;
                    if (!p.selectedIds.has(n.id)) p.onNodeClick(n.id, false);
                    drag.current = { sx: pt.x, sy: pt.y, origins: d.nodes.filter((k) => ids.includes(k.id)).map((k) => ({ id: k.id, x: k.x, y: k.y })), moved: false };
                    return;
                  }
                  p.onSelect({ kind: "node", id: n.id });
                  if (src) {
                    if (n.type === "PB") { setPressed(n.id); p.onPress(n.id, true); }
                    else p.onToggle(n.id);
                  }
                }}
              >
                <Glyph node={n} on={on} pressed={pressed === n.id} remaining={rem} gateStyle={d.gateStyle} />
              </g>
              {/* ports */}
              {Array.from({ length: inputCount(n) }).map((_, i) => {
                const pt = inPort(n, i);
                const connected = d.wires.some((w) => w.to === n.id && w.toPort === i);
                return (
                  <g key={`i${i}`}>
                    {n.type === "SR" || inputCount(n) > 1 ? <text x={pt.x - n.x + 6} y={pt.y - n.y - 3} className="fill-muted-foreground font-mono pointer-events-none" fontSize={6.5}>{n.type === "SR" ? "" : portName(n, i, "in")}</text> : null}
                    <circle cx={pt.x - n.x} cy={pt.y - n.y} r={mode === "build" ? 4 : 2.4}
                      className={`${connected ? "fill-foreground" : "fill-card stroke-muted-foreground"} ${mode === "build" ? "cursor-crosshair hover:fill-primary" : ""}`} strokeWidth={1}
                      onPointerDown={(e) => {
                        if (mode !== "build") return;
                        e.stopPropagation();
                        if (pending) { p.onConnect(pending.node, pending.port, n.id, i); setPending(null); setCursor(null); }
                      }} />
                  </g>
                );
              })}
              {Array.from({ length: SYMBOLS[n.type].outputs }).map((_, i) => {
                const pt = outPort(n, i);
                return (
                  <circle key={`o${i}`} cx={pt.x - n.x} cy={pt.y - n.y} r={mode === "build" ? 4 : 2.4}
                    className={`${val(n.id, i) ? "fill-signal-on" : "fill-foreground"} ${pending?.node === n.id && pending.port === i ? "stroke-primary" : ""} ${mode === "build" ? "cursor-crosshair hover:fill-primary" : ""}`}
                    strokeWidth={2}
                    onPointerDown={(e) => {
                      if (mode !== "build") return;
                      e.stopPropagation();
                      setPending({ node: n.id, port: i }); setCursor(pt);
                    }} />
                );
              })}
            </g>
          );
        })}
        {marquee && (
          <rect x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)} width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)}
            className="fill-primary/10 stroke-primary pointer-events-none" strokeDasharray="4 3" strokeWidth={1} />
        )}
      </svg>
      {pending && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow">
          Click an input port to connect · click empty space to cancel
        </div>
      )}
    </div>
  );
});
