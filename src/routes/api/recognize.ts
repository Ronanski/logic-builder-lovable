import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { recognitionGuide } from "@/lib/logic/library";

const Body = z.object({
  image: z.string().startsWith("data:image/").max(12_000_000),
  hints: z.string().max(40_000).optional(),
});

function prompt(hints?: string) {
  return `You are an expert DCS (distributed control system) logic-diagram reader. Read the attached interlock/logic sheet and convert it into a machine-readable logic graph.

Ignore any application chrome (PDF viewer toolbars, tabs, sidebars) and title-block/revision tables.

Sheet convention: the LEFT table lists inputs (FROM, LOCATION, NO., TAG NO., SERVICE). The RIGHT table lists outputs (SERVICE, NO., LOCATION, TO). Logic symbols are in the middle; lines run left to right. A dot on a line is a junction (branch). Text near a line such as "0.0087/407/727/1047" or "M.013E/23E/163E/173E" is the signal address(es). Tags written like "M.011F/21F" with a second line "M.161F/171F" mean multiple addresses: expand to M.011F, M.021F, M.161F, M.171F.

Symbol library (use exactly these type codes):
${recognitionGuide()}

Rules:
- Inputs whose service contains COMMAND, PB, PUSH, RESET, START, STOP, or comes from CRT → type "PB" with source "CRT".
- Position / opened / closed switches → "LIMIT_SW" with source "HARDWIRE".
- source must be one of HARDWIRE, IRP, ARP, CRT, DCS (guess from context, default DCS for internal signals, HARDWIRE for field contacts).
- Timers: read the seconds value inside the symbol into "sec". "PULSE DELAY" → PULSE.
- For AND/OR set "inputs" to the number of lines entering the bar.
- Wires connect from a node's output to another node's input. "toPort" is the 0-based index of the input from top to bottom. For SR, toPort 0 = S, 1 = R; fromPort 0 = C (normal), 1 = D (inverted).
- Give each node and wire a confidence 0..1. Use < 0.7 when the symbol, text or connection is unclear, and explain in "note".
- x,y = normalized center position of the element within the image (0..1).
- Do not invent elements that are not drawn. If something cannot be resolved, add a warning.
${hints ? `\nText strings extracted from the CAD file (may help with exact tags):\n${hints}\n` : ""}
Respond with ONLY a JSON object, no markdown, in this shape:
{"title":"...","nodes":[{"id":"n1","type":"AND","label":"","tag":"","service":"","addresses":[],"source":"DCS","sec":1,"inputs":2,"x":0.5,"y":0.5,"confidence":0.9,"note":""}],"wires":[{"from":"n1","fromPort":0,"to":"n2","toPort":0,"label":"","confidence":0.9}],"warnings":[]}`;
}

export const Route = createFileRoute("/api/recognize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Invalid image upload" }, { status: 400 });
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return Response.json({ error: "AI is not configured" }, { status: 500 });
        try {
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
            method: "POST",
            signal: request.signal,
            headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
            body: JSON.stringify({
              model: "openai/gpt-6-astra",
              stream: true,
              store: false,
              reasoning: { effort: "medium", summary: "auto" },
              include: ["reasoning.encrypted_content"],
              input: [
                {
                  role: "user",
                  content: [
                    { type: "input_text", text: prompt(parsed.data.hints) },
                    { type: "input_image", image_url: parsed.data.image },
                  ],
                },
              ],
            }),
          });
          if (!upstream.ok) {
            const text = await upstream.text();
            let msg = text.slice(0, 500);
            try { const j = JSON.parse(text); msg = j.message ?? j.error?.message ?? j.error ?? msg; } catch { /* keep */ }
            return Response.json({ error: msg }, { status: upstream.status });
          }
          return new Response(upstream.body, {
            status: 200,
            headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        } catch (e) {
          if (request.signal.aborted) return new Response(null, { status: 499 });
          return Response.json({ error: e instanceof Error ? e.message : "Recognition failed" }, { status: 502 });
        }
      },
    },
  },
});
