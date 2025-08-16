# amosjs

Transpile AMOS (.AMOS) programs from the Commodore Amiga into JavaScript. Execution uses a switch/case instruction-pointer scheduler with cooperative `setTimeout` yielding.

- Docs: see `docs/design.md` for architecture and plan.
- CLI: `amosjs transpile file.AMOS -o out.js` (skeleton), `amosjs run file.AMOS` (skeleton).
- Status: scaffolding + utilities and tests. Parser and codegen forthcoming per design.

