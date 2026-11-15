# BUILD REPORT — canarymail

Clean-room rebuild of `com.domaincanary/mcp` v1.0.0 (remote-only MCP
server at `https://domaincanary.com/mcp`), built 2026-10-28 as a
forwarding client. Package: `@reneturcios/canarymail` 0.1.0,
registry name `io.github.CloudCorpRecords/canarymail`.

## Surface built

FULL surface: **all 4 captured tools built, no omissions**.

| Tool | Required fields as served |
|------|-----------------------------|
| `check_domain` | `domain` |
| `build_spf` | `senders` |
| `explain_bounce` | `text` |
| `analyze_report` | NO `required` key (served verbatim) |

Each served tool carries exactly the fixture's keys (`name`, `title`,
`description`, `inputSchema`), with the inputSchema's `$schema`
marker, property shapes and per-tool required lists exactly as
captured. The tool literals were generated programmatically from
`harness/fixtures/domaincanary-tools-original.json` by the script at
`/tmp/b42-canarymail-gen/gen.py` (parse + re-serialise, placeholder
substitution into `src/forward.ts`) — never retyped — and a
post-generation check (the registration-integrity test suite, plus the
parity harness) confirmed the served literals deep-equal the fixture's
4 tool objects, in order. Tools are registered via the MCP SDK
low-level Server API (`ListToolsRequestSchema` /
`CallToolRequestSchema` handlers), not McpServer+zod.

## Fixture conflicts

**None.** The spec and the fixture agree on all 4 tool names, titles,
descriptions, required fields (`domain` / `senders` / `text`, and no
`required` key on `analyze_report`) and property shapes.

## Labelled reconstructions (from the spec's Wire section)

- Upstream endpoint pinned: `https://domaincanary.com/mcp`.
- Env override `DOMAINCANARY_MCP_URL` — labelled reconstruction.
- No auth: the registry record declares NO auth headers and the
  capture answered keyless, so the rebuild never sends an
  `Authorization` or `X-API-Key` header (asserted in tests on every
  upstream request, including when unrelated env values are present;
  only `Content-Type`, `Accept` and, when issued, `Mcp-Session-Id`
  headers are sent).
- Error rendering `canarymail error:` text for upstream failures —
  labelled reconstruction.
- Upstream results pass through verbatim, including `isError` and
  extra fields. tools/call is forwarded as streamable-HTTP JSON-RPC:
  initialize (protocolVersion `2025-03-26`) →
  notifications/initialized → tools/call, honouring `Mcp-Session-Id`
  when issued; plain-JSON and SSE replies are both parsed. The
  forwarding core takes an injectable fetch; tests stub the
  upstream — no live network calls in tests.

## Deviations

None.

## Lockfile

- Route: generated clean from birth in the build dir with no
  `node_modules` and no pre-existing lockfile:
  `npm install --package-lock-only --ignore-scripts --offline`.
- Parses as JSON; `name` == `@reneturcios/canarymail`.
- Package entries: **128**.
- sha256: `f3c9f6ecb2f06585380b9031029e633a744c8a047cdec29b76786ac5c0dfb8bb`
  (re-verified unchanged after the subsequent offline `npm install`).

## server.json

- Description exactly: "Email authentication checks: DMARC, SPF and
  DKIM, SPF building, bounce and report analysis." — **91 characters**.
- npm package entry carries `"version": "0.1.0"`; the OCI entry
  (`ghcr.io/cloudcorprecords/canarymail:0.1.0`) carries **no**
  `version` field. Both entries carry packageArguments
  `[{type: positional, value: mcp}]` and transport stdio. Dockerfile
  (node:20-alpine, both stages) carries the label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/canarymail"`.
  Container workflow `IMAGE` is `ghcr.io/cloudcorprecords/canarymail`
  and its smoke test asserts the server name `canarymail`.

## Verification (all run 2026-10-28)

1. `npx tsc --noEmit` → exit 0.
2. `npm run build` → exit 0; real `dist/` produced (cli, forward,
   index, mcp, types — .js, .d.ts, .js.map each).
3. `node dist/cli.js --version` → `0.1.0`.
4. `npm test` → **50 tests, 50 pass, 0 fail** (registration-integrity
   suite deep-equals the served tools/list against the fixture's 4
   tools in order, including the no-`required`-key assertion on
   `analyze_report`, plus session handling/reuse, env override,
   no-auth-header assertions, verbatim argument forwarding for all 4
   tools and result pass-through including upstream isError, SSE
   parsing, error rendering, MCP-layer validation, and CLI
   behaviour).
5. Parity: `python3 /home/hatch/workspace/mcp-rebuild-100/harness/parity.py --original /home/hatch/workspace/mcp-rebuild-100/harness/fixtures/domaincanary-tools-original.json --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/canarymail/dist/cli.js mcp" --out /home/hatch/workspace/mcp-rebuild-100/builds/canarymail/parity-out` → **verdict PASS, parity 100.0**
   (4/4 identical, 0 missing, 0 extra, no schema diffs). Output in
   `parity-out/`.
