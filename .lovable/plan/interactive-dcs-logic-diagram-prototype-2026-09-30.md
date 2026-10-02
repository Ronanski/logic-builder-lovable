# Interactive DCS Logic Diagram Prototype

## Goal
Build a working dark Foxboro-style DCS logic viewer using the uploaded `DITL-03A` drawing as the first test page. The drawing remains recognizable while inputs, outputs, references, and logic states become interactive.

## What the prototype will include
- A full-screen engineering workspace with a page browser, drawing canvas, status bar, and details panel.
- The uploaded DCS page represented as a clean vector logic diagram with its real input services, page references, output services, tags, and principal OR / NOT / AND / S-R interlock path.
- Pan, wheel zoom, fit-to-screen, and reset controls for reviewing dense diagrams.
- Clickable inputs and outputs with clear selected, energized, and inactive states.
- Multiple input selection so several trigger conditions can be active simultaneously.
- A simulation mode that evaluates the represented logic path and highlights energized signal flow toward outputs.
- A side panel showing the selected point’s number, service, source/destination reference, location, tag/address, current state, and related logic.
- Search and quick filtering across point numbers, services, references, and tags.
- A local “Import diagram” flow accepting `.dxf` and `.pdf`, with an import assessment that explains whether the file is simulation-ready or needs symbol mapping.

## Import method
- **DXF is the primary semantic source.** Parse text, lines, polylines, circles, layers, and coordinates in the browser; preserve the original geometry for display.
- Group nearby connected primitives into candidate symbols using geometry, nearby labels, and wire connectivity rather than relying on CAD blocks.
- Recognize repeated logic shapes and labels such as `OR`, `NOT`, `AND`, `S/R`, page references, numbered I/O rows, and service descriptions.
- **PDF is a visual/reference fallback.** It can be displayed and its text indexed, but reliable simulation requires the matching DXF or a one-time manual mapping pass.
- The prototype will expose the import pipeline honestly: imported DXFs receive detected entities and confidence/status; new drawings can be added, while uncertain symbols are marked for review instead of silently guessed.

## Technical details
- Use React and SVG for crisp vector rendering and hit targets over the schematic.
- Use a maintained pan/zoom library so mouse-wheel, trackpad, buttons, and cursor-anchored zoom behave consistently.
- Keep diagram parsing and normalized logic-page data separate from the viewer so the same pipeline can later batch-process all 130 drawings.
- Store this initial prototype locally in the browser only; shared persistent libraries, user accounts, and server-side batch conversion are outside this first test.
- Include responsive behavior for desktop engineering review and a compact read-only mobile arrangement.

## Validation
- Verify the page at desktop and mobile widths.
- Test multiple selected inputs, simulation state changes, output details, search, zoom/pan, and import feedback.
- Confirm the app builds cleanly and the initial route has complete page metadata.
