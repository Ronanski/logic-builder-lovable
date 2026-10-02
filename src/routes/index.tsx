import { createFileRoute } from "@tanstack/react-router";
import RequireAuth from "@/components/RequireAuth";
import Home from "@/views/Home";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Logic diagrams — DCS Logic Studio" },
      { name: "description", content: "Build interlock logic, import it from a drawing, and simulate it live." },
      { property: "og:title", content: "Logic diagrams — DCS Logic Studio" },
      { property: "og:description", content: "Build interlock logic, import it from a drawing, and simulate it live." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <Home />
    </RequireAuth>
  ),
});
