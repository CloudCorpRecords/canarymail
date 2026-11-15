# canarymail

Email that fails authentication rarely explains itself. canarymail is a small local bridge to the hosted DomainCanary MCP service: hand it a domain, a list of sending services, a pasted bounce, or a DMARC aggregate report, and the service does the reading — checking live DMARC, SPF and DKIM records, merging an SPF record, decoding an SMTP refusal, or totalling which senders passed and failed.

Nothing is stored or computed on your own machine. This package answers `tools/list` locally from the captured tool definitions and forwards every `tools/call` to the hosted service over a streamable-HTTP JSON-RPC session, returning whatever the service sends back unchanged. All four captured tools are built; there are no omissions.

## The tools

- **`check_domain`** — Checks a domain's published email authentication. `domain` is required; pass `selector` when you know the DKIM selector, otherwise common selectors are tried. Returns what is wrong with each of DMARC, SPF and DKIM, plus the records to add or change.
- **`build_spf`** — Builds one merged SPF record from the services that send a domain's mail. `senders` is required (provider names, `include:` terms, or similar); `domain`, `ip4`, `ip6` and `all` (`~all` or `-all`) are optional. Reports the record's DNS lookup count against the limit of ten.
- **`explain_bounce`** — Explains a pasted bounce message, SMTP reply or Authentication-Results header. `text` is required. Returns what the receiving server refused, what to change, and when it clears.
- **`analyze_report`** — Reads a DMARC aggregate report. Pass either `file` (an uploaded report file object) or `report_xml` (the report XML as text); neither is individually required. Returns totals and per-IP SPF, DKIM and DMARC results, with a next step for the report's domain.

## Install and run

As an MCP server via npm:

```bash
npx -y @reneturcios/canarymail mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "canarymail": {
      "command": "npx",
      "args": ["-y", "@reneturcios/canarymail", "mcp"]
    }
  }
}
```

As a container:

```bash
docker run -i ghcr.io/cloudcorprecords/canarymail
docker run --rm ghcr.io/cloudcorprecords/canarymail check_domain '{"domain":"example.com"}'
```

## CLI

One binary serves both the command line and the MCP server. Each tool is a subcommand taking a single JSON string with that tool's arguments:

```bash
canarymail check_domain '{"domain":"example.com"}'
canarymail build_spf '{"senders":["Google Workspace","Mailchimp"],"domain":"example.com"}'
canarymail explain_bounce '{"text":"550 5.7.26 Unauthenticated email"}'
canarymail analyze_report '{"report_xml":"<feedback>...</feedback>"}'
canarymail --version
```

Exit codes: `0` when the forwarded call succeeds, `1` when the upstream result is an error, and `2` for usage problems such as an unknown subcommand or a malformed JSON argument.

## Configuration

- `DOMAINCANARY_MCP_URL` — Overrides the upstream endpoint. The default is the pinned hosted endpoint, `https://domaincanary.com/mcp`. (The override variable is a reconstruction added by this rebuild.)

No authentication header is ever sent: the registry record declares no headers for the upstream and the tool surface was captured keyless, so no `Authorization` or `X-API-Key` header leaves this client.

Upstream failures — a JSON-RPC error from the service, a non-2xx response, an unreadable body, or a request that fails outright — are reported to the caller as an error result whose text starts with `canarymail error:`.

## How forwarding works

The first forwarded call opens a session: an `initialize` request (protocol version `2025-03-26`), followed by a `notifications/initialized` notification, then the `tools/call` itself. If the service answers the initialize request with an `Mcp-Session-Id` header, that value is carried on every later request, and the open session is reused for the rest of the process. Replies are accepted either as plain JSON or as server-sent events. Successful results pass through verbatim, including any `isError` flag and any extra fields the service includes.

## Development

```bash
npm install
npm run build   # tsc -> dist/ (dist/cli.js is the bin)
npm test        # tsx --test test/*.test.ts — stubbed upstream, no network
npm run dev     # run the CLI from source
```

The test suite checks the served tool list against the captured surface, exercises the session handshake and its reuse, asserts that no auth header is ever sent, and verifies that arguments go upstream untouched and results come back untouched, including SSE replies and upstream error results.

## License

MIT — see `LICENSE`. Copyright (c) 2026 Rene Turcios.
