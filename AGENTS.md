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

## Project rules
- App screens live as JS/JSX in src/views and src/components (ported from the original app); routes in src/routes are thin wrappers with `ssr: false` — the editor and auth rely on browser APIs.
- Data access goes through src/lib/diagrams.js and auth through src/lib/auth.jsx — keeps backend calls out of UI components.
- Drawing analysis runs in src/lib/analyze.functions.ts (auth-required server fn); image is sent inline as a data URL, no file storage needed.
