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

- Keep imported CAD parsing separate from normalized DCS logic data so additional diagram templates can reuse the same viewer and simulation engine.

## Architecture
- Builder at `/` (LogicTrace): logic model, engine, symbol library, DXF reader and AI recognition client in `src/lib/logic/`; UI in `src/components/dcs/`. Why: keeps simulation/recognition pure apart from UI.
- Earlier DITL-03A viewer lives at `/viewer`. Why: preserved reference prototype.
- `SYMBOLS` is the single source for simulation, palette, library page and recognition prompt; gate drawing style is a diagram-level setting with per-symbol override. Why: one place to add symbols/styles.
- Diagrams persist in localStorage and sync live between open tabs via BroadcastChannel (diagram + forced inputs). Why: real-time sync without a backend.
- Multi-selection is a set of node ids in the workspace; groups are a shared `group` id on nodes. Why: copy/paste/align/group all operate on the same set.
