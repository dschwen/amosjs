# AMOS → JavaScript Transpiler (amosjs)

## Goals

- Accurate, readable transpilation of tokenized AMOS/Easy AMOS/AMOS Pro source (`.AMOS`) into JavaScript.
- Event-loop compatible execution using switch/case with an instruction pointer (IP) and cooperative scheduling via `setTimeout`.
- Support AMOS control flow (labels, `Goto`, `Gosub`/`Return`, `Procedure`/`End Proc`, `If/Else`, loops) and core data types (numeric, string), growing to graphics and banks via pluggable runtimes.
- Deterministic, testable core with unit tests and a CLI suitable for npm publishing.

## Inputs and Formats

- `.AMOS` file structure:
  - 16-byte ASCII header (variant identifiers), 4-byte length of tokenized source, then tokenized lines; optional banks follow (`AmBs` marker + banks).
  - Tokenized line: 1 byte length-in-words, 1 byte indent, then tokens (2-byte aligned) ending with a null token.
  - Refer to `background/amos_file_formats.html` for authoritative details; code references mirror `amostools` (`amoslib.c`).

## Token Decoding Strategy

- Core and extensions share token tables. Tokens 0x004E introduce extension-namespace tokens: `[slot, offset]`.
- Build a token table by parsing extension binaries as `listamos` does (`AMOS_parse_extension`).
  - Load built-in defaults (Music/Compact/Request/IOPorts) unless overridden.
  - Optionally read AMOS config to map slots to filenames (`AMOS_parse_config`).
  - Hash table keyed by `key = (slot<<16)|offset` (slot 0 for core tokens).
  - Each entry carries the canonical printed name and a type tag (instruction/function/paren/etc.).
- For transpilation, we need both the printable name and a semantic opcode mapping; start with a subset of opcodes and progressively add coverage.

## Frontend Architecture

- Binary Loader:
  - Verify header; read 32-bit source length; slice tokenized source; capture any trailing banks.
  - Utilities: `deek`/`leek` (big-endian 16/32-bit), 2-byte alignment helpers.

- Procedure Decryption:
  - Port `AMOS_decrypt_procedure` to JS. When a `Procedure` token sets the encrypted bit, decrypt the procedure body in-place before further parsing.

- Token Stream Parser → IR:
  - Iterate lines, consuming tokens; apply special sizing rules for variable/label/proc refs, constants, remarks, control-flow markers with extra bytes (e.g., `For`, `If`, `Else`, `On`, `Proc`, `Data`).
  - Build:
    - Instruction list with source offsets and line indices.
    - Label table (names and numeric labels) → IP indices.
    - Def-use of procedure names; capture their entry IP and local scope boundaries.
    - Branch edges (goto/gosub targets, conditional fallthroughs) to compute case labels.
  - IR Instruction shape (initial): `{ ip, op, args, srcOffset, lineIndex }`, where `ip` is the sequential index in the flattened instruction stream.
  - Resolve label references post-pass by patching `args` to numeric IPs using the label table.

## Runtime and Semantics

- Execution Model (Switch/IP Scheduler):
  - Generate a function/class with `state = { ip, globals, localsStack, gosubStack, callStack, waiting, banks }`.
  - A loop executes one instruction per tick using `switch(ip) { case 0: ...; break; ... }`.
  - Branching ops set `state.ip` to the target IP and `break` out to the scheduler; the scheduler reschedules via `setTimeout(tick, delay)`.
  - `Sleep`, `Wait`, `Wait Vbl`: set `state.waiting` and `delay`; scheduler respects delay; provide hooks to customize timing (e.g., 50Hz for VBL).

- Stacks and Scopes:
  - `gosubStack`: stores return IPs for `Gosub`/`Return`.
  - `callStack`: for `Procedure`/`End Proc`, frames carry locals dictionary and possibly parameter passing.
  - Dictionaries: `globals` and per-frame `locals` keyed by canonical variable name + type suffix (`$` string, `#` float) consistent with AMOS rules.

- Types:
  - AMOS variables: suffix `$` strings, `#` floats; unsuffixed numerics default to numeric (treat as JS number; defer integer vs float subtleties initially).
  - Arrays: plan index expressions and allocation semantics later; initial release supports scalars.

- Host/IO Abstraction:
  - Injected `io` object for side effects: `io.print(str)`, `io.input()`, graphics stubs, bank access.
  - Unknown/unimplemented opcodes raise a controlled runtime error with opcode name and location.

- Banks:
  - Parse trailing banks (`AmBs`) into a `banks` registry with metadata; expose to runtime for future graphics/samples.

## Code Generation

- Emit a self-contained JS module per AMOS program:
  - A runtime prelude: scheduler, state struct, helper ops.
  - A giant `switch(state.ip)` with one `case` per reachable IP.
  - Each case executes the mapped semantic for the IR op, updates `state.ip` (usually `ip+1`), then `break`.
  - A `tick()` function drives execution until a yield is requested or a step limit is reached (configurable), then re-schedules.
  - Configurable timing via constructor options: `{ setTimeout, vblHz, sleepScale }` to support tests and headless environments.

## Minimal Initial Opcode Coverage

- Literals and expressions: numeric, string literals; simple arithmetic; comparisons.
- Control flow: `Label`, `Goto`, `Gosub`, `Return`, `Procedure`, `End Proc` (no encryption at runtime, already decrypted in frontend), `End`.
- I/O: `Print` to `io.print`.
- Conditional: skeleton for `If ... Then ... Else ... End If` lowering to branches; full expression parsing grows incrementally.

## CLI

- `amosjs transpile input.AMOS -o out.js [--config <env>] [--ext <slot=path>]`
- `amosjs run input.AMOS [--speed vbl|ms] [--trace]`
- Tracing option logs executed IPs/opcodes for debug.

## Testing Strategy

- Pure-unit tests (no deps):
  - Binary utils: `deek/leek`, alignment.
  - Procedure decrypt against synthetic blocks.
  - Header/source slicing; graceful handling of short/truncated files.
  - Label resolution and branch patching on small crafted streams.
  - Codegen smoke test: a tiny IR program printing text and using `Goto`.

- Fixture tests:
  - Use small `.AMOS` samples (checked into `fixtures/`) or generated buffers to validate end-to-end `transpile` produces runnable JS that, under a stub `io`, emits expected output.

## Performance and Safety

- Switch/IP model is O(1) dispatch and maps cleanly to the event loop.
- Avoid blocking: default to 1 instruction per tick for correctness, add configurable `stepBudget` to batch more per tick later.
- Validate inputs; never execute banks or embedded code. Treat unrecognized tokens as errors with clear messages.

## Roadmap / Milestones

1) Project scaffolding and CLI skeleton
2) Binary loader utils and `.AMOS` header/source extraction
3) Procedure decryption (parity with `AMOS_decrypt_procedure`)
4) Extension/token table parsing (core + user-provided extensions)
5) Token stream → IR (labels, branches, minimal expressions)
6) Runtime prelude (scheduler, stacks, variables)
7) Code generator (switch/IP scheduling)
8) Minimal opcode semantics (Print, Goto, Gosub, Return, End, Procedure)
9) Banks parser and registry
10) CLI `run` and `transpile`; golden tests for emitted JS
11) Expand expressions and conditionals; add arrays and For/Next
12) Graphics/sound API surface with pluggable backends (Canvas/Audio)
13) Documentation, examples, and npm publish

## Risks and Mitigations

- Extension variability: Parse actual extension files to build token tables; include a fallback bundled table for core tokens.
- Encrypted procedures: Decrypt deterministically up front; avoid runtime surprises.
- Timing-sensitive waits: Make waiting pluggable and test with a fake clock.
- Semantics coverage: Start with a clear minimal subset and systematically grow with tests.

