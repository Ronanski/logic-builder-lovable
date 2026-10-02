import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { GlyphPreview } from "@/components/dcs/Glyph";
import { newNode, SYMBOLS, type SymbolCategory } from "@/lib/logic/library";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Symbol Library — LogicTrace" },
      { name: "description", content: "DCS logic symbol library: gates, timers, memory, inputs and outputs with recognition hints and truth tables." },
      { property: "og:title", content: "Symbol Library — LogicTrace" },
      { property: "og:description", content: "Reference of DCS interlock symbols used for drawing recognition and simulation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const cats: SymbolCategory[] = ["Input", "Logic", "Timer", "Memory", "Output"];
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b bg-card px-4">
        <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Workspace</Link>
        <h1 className="text-sm font-semibold">Symbol library</h1>
      </header>
      <main className="mx-auto max-w-6xl space-y-10 p-4 sm:p-8">
        <p className="max-w-2xl text-sm text-muted-foreground">These symbols drive both the simulator and drawing recognition. The "looks like" description is what the reader uses to identify each symbol on imported sheets.</p>
        {cats.map((c) => (
          <section key={c}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.values(SYMBOLS).filter((s) => s.category === c).map((s) => (
                <article key={s.type} className="rounded-lg border bg-card p-4">
                  <div className="mb-3 h-20 rounded-md bg-canvas p-2"><GlyphPreview node={{ ...newNode(s.type, 0, 0, "p"), tag: "M.0134/234" }} /></div>
                  <div className="flex items-baseline justify-between gap-2"><h3 className="font-semibold">{s.name}</h3><code className="font-mono text-[11px] text-muted-foreground">{s.type}</code></div>
                  <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                  <p className="mt-2 text-xs"><span className="font-medium">Looks like: </span><span className="text-muted-foreground">{s.recognition}</span></p>
                  {s.truth && <pre className="mt-2 rounded bg-muted p-2 font-mono text-xs leading-5">{s.truth}</pre>}
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
