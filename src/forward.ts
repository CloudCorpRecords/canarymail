/**
 * canarymail core: a forwarding client for the hosted
 * DomainCanary MCP server.
 *
 * No DNS lookups, SPF merging, bounce parsing or report
 * analysis happen on this machine. tools/list is answered
 * from the literal definitions below, which reproduce a
 * live capture of the upstream server word for word (name,
 * title, description and inputSchema exactly as captured).
 * A tools/call travels upstream over a streamable-HTTP
 * JSON-RPC session: an initialize POST, a
 * notifications/initialized POST, then the tools/call
 * POST, carrying the Mcp-Session-Id response header on
 * later requests when the upstream issues one. The session
 * opens lazily on the first forwarded call and is reused
 * for the client's lifetime.
 *
 * The endpoint is pinned to https://domaincanary.com/mcp
 * and may be replaced with the DOMAINCANARY_MCP_URL
 * environment variable (that override is a labelled
 * reconstruction). The registry record declares no auth
 * headers and the capture was taken keyless, so this
 * client never sends an Authorization or X-API-Key header.
 *
 * A successful upstream result is returned exactly as
 * received, isError flag and extra fields included.
 * Failures — an upstream JSON-RPC error, a non-2xx
 * status, a body that cannot be parsed, or a fetch that
 * throws or times out — become an isError result whose
 * text begins with `canarymail error:` (that rendering is
 * a labelled reconstruction). Replies may be plain JSON or
 * SSE (`data:` lines); the JSON-RPC message whose id
 * matches the request wins.
 */
import type {
  FetchFn,
  FetchResponseLike,
  ForwardDeps,
  ToolArgs,
  ToolDef,
  ToolResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_ENDPOINT_URL = "https://domaincanary.com/mcp";

export const DEFAULT_TIMEOUT_MS = 30000;

export const PROTOCOL_VERSION = "2025-03-26";

/* ------------------------------------------------------------------ */
/* Tool definitions (tools/list literals, verbatim from the live       */
/* capture in harness/fixtures/domaincanary-tools-original.json;       */
/* generated programmatically by parsing and re-serialising the        */
/* fixture JSON, never retyped)                                        */
/* ------------------------------------------------------------------ */

export const TOOL_DEFS: ToolDef[] = [
  {
    "name": "check_domain",
    "title": "Check a domain's email authentication",
    "description": "Use this when someone asks whether a domain's email authentication is set up correctly, why mail from a domain fails DMARC, SPF or DKIM, or which DNS records to publish for it. Reads the domain's live DMARC, SPF and DKIM records and returns what is wrong with each, plus the records to add or change. Pass a DKIM selector when you know it. Without one, common selectors are tried. Takes a domain name only, not a mailbox address or an IP address.",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "domain": {
          "type": "string",
          "minLength": 1,
          "maxLength": 253,
          "description": "The domain to check, such as example.com. A URL is cut down to its host."
        },
        "selector": {
          "description": "The DKIM selector, the s= value in a DKIM-Signature header. Leave it out to try common ones.",
          "type": "string",
          "maxLength": 63
        }
      },
      "required": [
        "domain"
      ]
    }
  },
  {
    "name": "build_spf",
    "title": "Build an SPF record",
    "description": "Use this when someone lists the services that send their email and wants the SPF record to publish, or wants a sender added to the SPF record they already have. Takes provider names such as Google Workspace or Mailchimp, include terms such as include:spf.example.com, or IP addresses, and returns one merged record with its count of DNS lookups against the limit of ten. Pass the domain when you know it, so the result includes the senders already in its published record.",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "senders": {
          "minItems": 1,
          "maxItems": 20,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 300
          },
          "description": "The platforms that send this domain's mail: provider names such as Google Workspace or Mailchimp, or include terms such as include:spf.example.com."
        },
        "domain": {
          "description": "The domain the record is for. When given, the SPF record it publishes today is read and the senders are added to it, so nothing already in it is lost.",
          "type": "string",
          "minLength": 1,
          "maxLength": 253
        },
        "ip4": {
          "description": "IPv4 addresses or ranges that send this domain's mail directly, such as 192.0.2.10 or 192.0.2.0/24.",
          "maxItems": 10,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          }
        },
        "ip6": {
          "description": "IPv6 addresses or ranges that send this domain's mail directly, such as 2001:db8::1 or 2001:db8::/32.",
          "maxItems": 10,
          "type": "array",
          "items": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          }
        },
        "all": {
          "description": "How the record ends. A new record ends in ~all unless you pass -all. A record the domain already publishes keeps its own ending unless you pass one.",
          "type": "string",
          "enum": [
            "~all",
            "-all"
          ]
        }
      },
      "required": [
        "senders"
      ]
    }
  },
  {
    "name": "explain_bounce",
    "title": "Explain a bounce or SMTP error",
    "description": "Use this when someone pastes a bounce message, an SMTP reply such as 550 5.7.26, or an Authentication-Results header and asks what it means or how to fix it. Returns what the receiving server refused, what to change, when it clears, and the page that explains it. Works from the pasted text alone and reads no DNS records.",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "text": {
          "type": "string",
          "minLength": 1,
          "maxLength": 4000,
          "description": "The bounce message, the SMTP reply or the Authentication-Results line, as pasted. When the bounce runs past 4,000 characters, pass the lines with the error code and the reason."
        }
      },
      "required": [
        "text"
      ]
    }
  },
  {
    "name": "analyze_report",
    "title": "Read a DMARC aggregate report",
    "description": "Use this when someone has a DMARC aggregate report and wants to know which senders passed and which failed. The report is the XML, .gz or .zip file that receivers such as Google and Yahoo email to the address in a domain's rua tag. In ChatGPT, pass the uploaded file. Elsewhere, pass the report XML as text. Returns totals per report and each sending IP address with its SPF, DKIM and DMARC results. The result gives a next step for the report's domain and a link to a live check of that domain's DNS records. Nothing from the report is stored.",
    "inputSchema": {
      "type": "object",
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "file": {
          "description": "The report file the user uploaded in ChatGPT: the .xml, .xml.gz or .zip a mailbox provider emailed them.",
          "type": "object",
          "properties": {
            "download_url": {
              "type": "string",
              "maxLength": 4096
            },
            "file_id": {
              "type": "string",
              "maxLength": 512
            },
            "mime_type": {
              "type": "string",
              "maxLength": 255
            },
            "file_name": {
              "type": "string",
              "maxLength": 1024
            }
          },
          "required": [
            "download_url",
            "file_id"
          ]
        },
        "report_xml": {
          "description": "The report XML as text, from <feedback> to </feedback>. Use this when there is no uploaded file, or when the user pasted the XML.",
          "type": "string",
          "maxLength": 1000000
        }
      }
    }
  }
];

export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

/** Whether `name` belongs to the captured built surface. */
export function isKnownTool(name: string): boolean {
  return TOOL_NAMES.includes(name);
}

/* ------------------------------------------------------------------ */
/* Forwarding client                                                   */
/* ------------------------------------------------------------------ */

function errorResult(detail: string): ToolResult {
  return {
    content: [{ type: "text", text: `canarymail error: ${detail}` }],
    isError: true,
  };
}

function rpcErrorMessage(error: unknown): string {
  if (error !== null && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message !== "") return message;
    return JSON.stringify(error);
  }
  return String(error);
}

/**
 * Read a JSON-RPC response body, tolerating SSE framing.
 * Returns the message whose id matches `expectedId` when
 * present, otherwise the last parseable message, otherwise
 * null when nothing in the body parses.
 */
export function parseRpcBody(
  text: string,
  expectedId?: number,
): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const candidates: Record<string, unknown>[] = [];
  const tryPush = (payload: string): void => {
    try {
      const parsed: unknown = JSON.parse(payload);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        candidates.push(parsed as Record<string, unknown>);
      }
    } catch {
      // Not a JSON payload; skip this candidate.
    }
  };
  if (trimmed.includes("data:")) {
    for (const line of trimmed.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice("data:".length).trim();
      if (payload !== "" && payload !== "[DONE]") tryPush(payload);
    }
  } else {
    tryPush(trimmed);
  }
  if (candidates.length === 0) return null;
  if (expectedId !== undefined) {
    const match = candidates.find((c) => c.id === expectedId);
    if (match !== undefined) return match;
  }
  return candidates[candidates.length - 1];
}

async function defaultFetch(
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
): Promise<FetchResponseLike> {
  return fetch(url, init) as unknown as FetchResponseLike;
}

/**
 * A forwarding client holding a single upstream session,
 * opened lazily on first use and reused from then on
 * (for the process lifetime in the MCP server, or for a
 * single invocation in the CLI).
 */
export class CanarymailClient {
  private readonly deps: ForwardDeps;
  private sessionId: string | null = null;
  private ready = false;
  private sessionPromise: Promise<void> | null = null;
  private idCounter = 0;

  constructor(deps: ForwardDeps = {}) {
    this.deps = deps;
  }

  private fetchFn(): FetchFn {
    return this.deps.fetchFn ?? defaultFetch;
  }

  private endpointUrl(): string {
    if (this.deps.url && this.deps.url.trim() !== "") return this.deps.url.trim();
    const raw = (this.deps.env ?? process.env).DOMAINCANARY_MCP_URL;
    if (raw && raw.trim() !== "") return raw.trim();
    return DEFAULT_ENDPOINT_URL;
  }

  private timeoutMs(): number {
    if (typeof this.deps.timeoutMs === "number" && this.deps.timeoutMs > 0) {
      return this.deps.timeoutMs;
    }
    return DEFAULT_TIMEOUT_MS;
  }

  private nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  private async post(
    body: unknown,
    withSession: boolean,
  ): Promise<FetchResponseLike> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (withSession && this.sessionId !== null) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await this.fetchFn()(this.endpointUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.ready) return;
    if (this.sessionPromise === null) {
      this.sessionPromise = (async () => {
        const initId = this.nextId();
        const initRes = await this.post(
          {
            jsonrpc: "2.0",
            id: initId,
            method: "initialize",
            params: {
              protocolVersion: PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: "canarymail", version: VERSION },
            },
          },
          false,
        );
        const sessionId = initRes.headers.get("mcp-session-id");
        if (sessionId) this.sessionId = sessionId;
        const initText = await initRes.text();
        const initParsed = parseRpcBody(initText, initId);
        if (initParsed !== null && initParsed.error) {
          throw new Error(rpcErrorMessage(initParsed.error));
        }
        if (initRes.status < 200 || initRes.status >= 300) {
          throw new Error(`HTTP ${initRes.status}`);
        }
        if (initParsed === null && initText.trim() !== "") {
          throw new Error("malformed response");
        }
        const initializedRes = await this.post(
          { jsonrpc: "2.0", method: "notifications/initialized" },
          true,
        );
        try {
          await initializedRes.text();
        } catch {
          // Nothing needed from the notification response body.
        }
        this.ready = true;
      })();
    }
    try {
      await this.sessionPromise;
    } catch (err) {
      this.sessionPromise = null;
      this.sessionId = null;
      throw err;
    }
  }

  /** Forward one tool call; upstream failures come back as isError results. */
  async callTool(name: string, args: ToolArgs): Promise<ToolResult> {
    try {
      await this.ensureSession();
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }

    const callId = this.nextId();
    let callRes: FetchResponseLike;
    try {
      callRes = await this.post(
        {
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: { name, arguments: args ?? {} },
        },
        true,
      );
    } catch (err) {
      return errorResult(
        `request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const parsed = parseRpcBody(await callRes.text(), callId);
    if (parsed !== null && parsed.error) {
      return errorResult(rpcErrorMessage(parsed.error));
    }
    if (callRes.status < 200 || callRes.status >= 300) {
      return errorResult(`HTTP ${callRes.status}`);
    }
    if (parsed === null) return errorResult("malformed response");
    const result = parsed.result as ToolResult | undefined;
    if (result === undefined || result === null || typeof result !== "object") {
      return errorResult("malformed response");
    }
    // Hand the upstream result back exactly as received.
    return result;
  }
}

/** Build a forwarding client; tests inject a fake fetch and env through deps. */
export function createClient(deps: ForwardDeps = {}): CanarymailClient {
  return new CanarymailClient(deps);
}

/** One-shot helper: a fresh client for a single call (the CLI path). */
export async function callTool(
  name: string,
  args: ToolArgs,
  deps: ForwardDeps = {},
): Promise<ToolResult> {
  return new CanarymailClient(deps).callTool(name, args);
}
