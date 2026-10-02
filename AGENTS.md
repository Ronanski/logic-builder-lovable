<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Logic model, simulator engine, symbol library, DXF reader and AI recognition client live in `src/lib/logic/`; UI in `src/components/dcs/`. Why: keeps simulation/recognition pure and testable apart from UI.
- Drawing recognition goes through the server route `/api/recognize` (streams the AI response); the browser renders DXF to an image first. Why: one vision pipeline for screenshots and CAD files, API key stays server-side.
- The symbol library (`SYMBOLS`) is the single source for simulation behaviour, palette, library page and the recognition prompt. Why: adding a symbol improves all of them at once.
- Diagrams persist in browser localStorage and export/import as JSON (no backend yet). Why: no accounts requested.
