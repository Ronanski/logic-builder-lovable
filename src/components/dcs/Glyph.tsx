import { inputCount, isSink, isSource, nodeSize, portName, SOURCE_LABEL, SYMBOLS } from "@/lib/logic/library";
import type { GateStyle, LogicNode } from "@/lib/logic/types";

const cut = (s: string | undefined, n: number) => (!s ? "" : s.length > n ? s.slice(0, n - 1) + "…" : s);

export function Glyph({ node, on, pressed, remaining, gateStyle }: { node: LogicNode; on?: boolean; pressed?: boolean; remaining?: number | null; gateStyle?: GateStyle }) {
  const { w, h } = nodeSize(node);
  const t = node.type;
  const stroke = "stroke-foreground";
  const activeFill = on ? "fill-signal-on/20" : "fill-card";

  if (isSource(t) || isSink(t)) {
    const src = node.source ? SOURCE_LABEL[node.source] : "";
    const left = isSource(t);
    const iconX = left ? w - 30 : 4;
    const textX = left ? 40 : 34;
    return (
      <g>
        <rect width={w} height={h} rx={4} className={`${activeFill} ${on ? "stroke-signal-on" : "stroke-border"}`} strokeWidth={1.4} />
        <rect x={left ? 4 : w - 36} y={4} width={32} height={14} rx={2} className="fill-muted" />
        <text x={left ? 20 : w - 20} y={14.5} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={8.5} fontWeight={600}>{src}</text>
        <text x={left ? 4 : w - 4} y={32} textAnchor={left ? "start" : "end"} className="fill-muted-foreground font-mono" fontSize={7.5}>{node.addresses.length > 1 ? `×${node.addresses.length}` : ""}</text>
        <text x={textX} y={15} className="fill-foreground font-mono" fontSize={10.5} fontWeight={600}>{cut(node.tag || node.addresses[0] || node.id, 22)}</text>
        <text x={textX} y={30} className="fill-muted-foreground" fontSize={9}>{cut(node.service || node.label, 30)}</text>
        <g transform={`translate(${iconX},${h / 2 - 12})`}>
          {t === "PB" && (
            <g>
              <circle cx={13} cy={12} r={10} className={pressed || on ? "fill-signal-on stroke-signal-on" : "fill-secondary stroke-foreground"} strokeWidth={1.4} />
              <circle cx={13} cy={12} r={5} className="fill-card/70" />
            </g>
          )}
          {t === "LIMIT_SW" && (
            <g className={stroke} strokeWidth={1.3} fill="none">
              <circle cx={4} cy={18} r={2.5} /><circle cx={22} cy={18} r={2.5} />
              <line x1={6} y1={16} x2={on ? 20 : 18} y2={on ? 16 : 6} /><line x1={12} y1={10} x2={18} y2={6} />
            </g>
          )}
          {(t === "LOW_LIMIT" || t === "HIGH_LIMIT") && (
            <g><rect x={1} y={3} width={24} height={18} className={`fill-none ${stroke}`} strokeWidth={1.3} />
              <text x={13} y={16.5} textAnchor="middle" className="fill-foreground font-mono" fontSize={11}>{t === "LOW_LIMIT" ? "/L" : "H/"}</text></g>
          )}
          {t === "LAMP" && (
            <g className={stroke} strokeWidth={1.3}>
              <rect x={5} y={6} width={16} height={12} className={on ? "fill-trace-up" : "fill-none"} />
              <line x1={1} y1={2} x2={5} y2={6} /><line x1={25} y1={2} x2={21} y2={6} /><line x1={1} y1={22} x2={5} y2={18} /><line x1={25} y1={22} x2={21} y2={18} />
            </g>
          )}
          {t === "ANN" && <text x={13} y={16} textAnchor="middle" className={on ? "fill-destructive" : "fill-foreground"} fontSize={9} fontWeight={700}>(ANN)</text>}
          {t === "SV" && (<g><circle cx={13} cy={12} r={10} className={`${on ? "fill-signal-on/30" : "fill-none"} ${stroke}`} strokeWidth={1.3} /><text x={13} y={15.5} textAnchor="middle" className="fill-foreground" fontSize={9} fontWeight={600}>SV</text></g>)}
          {t === "PULSE_SIG" && (<g><rect x={4} y={1} width={18} height={22} className={`fill-none ${stroke}`} strokeWidth={1.3} /><path d="M13 4 L18 10 L8 10Z M13 20 L18 14 L8 14Z" className="fill-foreground" /></g>)}
          {(t === "INPUT" || t === "OUTPUT") && (<path d={left ? "M4 12 H20 M15 7 L21 12 L15 17" : "M4 12 H20 M9 7 L3 12 L9 17"} className={`fill-none ${stroke}`} strokeWidth={1.3} />)}
        </g>
      </g>
    );
  }

  if (t === "TEXT") {
    const fs = node.fontSize ?? 12;
    const lines = (node.label || " ").split("\n");
    return (
      <g>
        <rect width={w} height={h} className="fill-transparent" />
        {lines.map((l, i) => (
          <text key={i} x={4} y={3 + fs * (i + 1) * 1.15} className="fill-foreground font-mono" fontSize={fs}>{l}</text>
        ))}
      </g>
    );
  }

  if (t === "AND" || t === "OR" || t === "NOT") {
    const style = node.style ?? gateStyle ?? "dcs";
    const k = inputCount(node);
    const ys = Array.from({ length: k }, (_, i) => (h * (i + 1)) / (k + 1));
    const body = `${activeFill} ${on ? "stroke-signal-on" : stroke}`;
    if (style === "block") {
      const sym = t === "AND" ? "&" : t === "OR" ? "≥1" : "1";
      return (
        <g>
          {ys.map((y, i) => <line key={i} x1={0} y1={y} x2={8} y2={y} className={stroke} strokeWidth={1.3} />)}
          <rect x={8} y={1} width={w - 16} height={h - 2} className={body} strokeWidth={1.4} />
          <line x1={w - 8} y1={h / 2} x2={w} y2={h / 2} className={stroke} strokeWidth={1.3} />
          {t === "NOT" && <circle cx={w - 8} cy={h / 2} r={2.6} className={`fill-card ${stroke}`} strokeWidth={1.2} />}
          <text x={w / 2} y={h / 2 + 4} textAnchor="middle" className="fill-foreground font-mono" fontSize={t === "NOT" ? 9 : 12} fontWeight={700}>{sym}</text>
          <text x={w / 2} y={-3} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={7.5}>{t}</text>
        </g>
      );
    }
    if (style === "traditional") {
      if (t === "NOT") return (
        <g>
          <line x1={0} y1={h / 2} x2={5} y2={h / 2} className={stroke} strokeWidth={1.3} />
          <path d={`M5 3 L${w - 9} ${h / 2} L5 ${h - 3} Z`} className={body} strokeWidth={1.3} />
          <circle cx={w - 6} cy={h / 2} r={3} className={`fill-card ${stroke}`} strokeWidth={1.2} />
        </g>
      );
      const L = 12, R = w - 4;
      const d = t === "AND"
        ? `M${L} 1 H${R - h / 2} A${h / 2} ${h / 2 - 1} 0 0 1 ${R - h / 2} ${h - 1} H${L} Z`
        : `M${L - 2} 1 Q${R - 14} 1 ${R} ${h / 2} Q${R - 14} ${h - 1} ${L - 2} ${h - 1} Q${L + 8} ${h / 2} ${L - 2} 1 Z`;
      return (
        <g>
          {ys.map((y, i) => <line key={i} x1={0} y1={y} x2={t === "OR" ? L + 2 : L} y2={y} className={stroke} strokeWidth={1.3} />)}
          <path d={d} className={body} strokeWidth={1.4} />
          <line x1={R} y1={h / 2} x2={w} y2={h / 2} className={stroke} strokeWidth={1.3} />
        </g>
      );
    }
    if (t === "NOT") {
      return (
        <g>
          <text x={w / 2} y={-3} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={8}>NOT</text>
          <rect x={6} y={6} width={20} height={16} className={`${activeFill} ${stroke}`} strokeWidth={1.3} />
          <path d="M6 6 L26 22 M26 6 L6 22" className={stroke} strokeWidth={1.1} />
          <line x1={0} y1={14} x2={6} y2={14} className={stroke} strokeWidth={1.3} />
          <line x1={26} y1={14} x2={32} y2={14} className={stroke} strokeWidth={1.3} />
        </g>
      );
    }
    return (
      <g>
        <rect width={w} height={h} className="fill-transparent" />
        <line x1={3} y1={0} x2={3} y2={h} className={on ? "stroke-signal-on" : stroke} strokeWidth={4} />
        <line x1={5} y1={h / 2} x2={18} y2={h / 2} className={stroke} strokeWidth={1.3} />
        {t === "AND" ? (
          <rect x={18} y={h / 2 - 11} width={38} height={22} className={`${activeFill} ${stroke}`} strokeWidth={1.3} />
        ) : (
          <circle cx={37} cy={h / 2} r={14} className={`${activeFill} ${stroke}`} strokeWidth={1.3} />
        )}
        <text x={37} y={h / 2 + 3.5} textAnchor="middle" className="fill-foreground font-mono" fontSize={10} fontWeight={700}>{t}</text>
      </g>
    );
  }
  if (t === "SR") {
    return (
      <g>
        <rect width={w} height={h / 2} className={`fill-card ${stroke}`} strokeWidth={1.3} />
        <rect y={h / 2} width={w} height={h / 2} className={`fill-card ${stroke}`} strokeWidth={1.3} />
        {on && <rect width={w} height={h / 2} className="fill-signal-on/25" />}
        <text x={w / 2} y={h / 4 + 4} textAnchor="middle" className="fill-foreground font-mono" fontSize={11} fontWeight={700}>S</text>
        <text x={w / 2} y={(3 * h) / 4 + 4} textAnchor="middle" className="fill-foreground font-mono" fontSize={11} fontWeight={700}>R</text>
        <text x={w + 3} y={h / 3 - 3} className="fill-muted-foreground font-mono" fontSize={7}>C</text>
        <text x={w + 3} y={(2 * h) / 3 - 3} className="fill-muted-foreground font-mono" fontSize={7}>D</text>
      </g>
    );
  }
  // timers
  const caption = t === "ON_DELAY" ? "ON DELAY" : t === "OFF_DELAY" ? "OFF DELAY" : "PULSE DELAY";
  return (
    <g>
      <text x={w / 2} y={-4} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={7.5}>{caption}</text>
      <line x1={0} y1={h / 2} x2={10} y2={h / 2} className={stroke} strokeWidth={1.3} />
      <path d={`M10 4 H${w - 26} A19 19 0 0 1 ${w - 26} ${h - 4} H10 Z`} className={`${activeFill} ${stroke}`} strokeWidth={1.3} />
      <line x1={w - 7} y1={h / 2} x2={w} y2={h / 2} className={stroke} strokeWidth={1.3} />
      <text x={w / 2 - 4} y={h / 2 - 2} textAnchor="middle" className="fill-foreground font-mono" fontSize={10} fontWeight={700}>{node.sec ?? 1}</text>
      <text x={w / 2 - 4} y={h / 2 + 10} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={7.5}>{remaining != null ? `${remaining.toFixed(1)}s` : "SEC"}</text>
      {node.label && node.label !== SYMBOLS[t].name && <text x={w / 2} y={h + 10} textAnchor="middle" className="fill-muted-foreground font-mono" fontSize={7.5}>{cut(node.label, 14)}</text>}
    </g>
  );
}

export function GlyphPreview({ node, gateStyle }: { node: LogicNode; gateStyle?: GateStyle }) {
  const { w, h } = nodeSize(node);
  return (
    <svg viewBox={`-10 -14 ${w + 20} ${h + 28}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <Glyph node={node} gateStyle={gateStyle} />
    </svg>
  );
}

export { portName };
