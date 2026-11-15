# Changelog

## 0.1.0 (2026-10-28)

- First release: a forwarding client for the hosted DomainCanary MCP server. All four captured tools are answered locally for tools/list, and every tools/call is forwarded upstream over a streamable-HTTP JSON-RPC session (initialize, notifications/initialized, tools/call, honouring the Mcp-Session-Id header when the upstream issues one).
- Tools: `check_domain`, `build_spf`, `explain_bounce`, `analyze_report` — the full captured surface, with no omissions.
- No authentication header is ever sent, matching the registry record, which declares no headers for the upstream, and the keyless capture.
- Upstream results pass through verbatim, including the isError flag; upstream failures surface as `canarymail error:` text results.
- One bin serves the CLI (one subcommand per tool, plus `--version`) and the stdio MCP server (`mcp` subcommand). The upstream endpoint can be overridden via `DOMAINCANARY_MCP_URL`.
