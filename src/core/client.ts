// HTTP client for the Morpheus proxy-router REST API.
// Security: enforces an endpoint allowlist — blocked paths throw before any HTTP request.
// Uses native fetch() (Node 22 built-in), basic auth, AbortController timeouts.

import type { Config } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

// Paths that are ALLOWED. Everything else is blocked.
// Structured as [method, pathPrefix | exact].
const ALLOWED_ENDPOINTS: Array<[string, string]> = [
  ["GET", "/healthcheck"],
  ["GET", "/blockchain/balance"],
  ["GET", "/blockchain/latestBlock"],
  ["GET", "/blockchain/models"],   // covers /blockchain/models and /blockchain/models/{id}/bids
  ["GET", "/blockchain/bids"],
  ["GET", "/blockchain/providers"],
  ["GET", "/blockchain/sessions"],
  ["GET", "/blockchain/token"],
  ["GET", "/proxy/sessions"],
  ["GET", "/wallet"],
  ["POST", "/blockchain/models"],
  ["POST", "/blockchain/bids"],
  ["POST", "/proxy/sessions"],
  ["DELETE", "/blockchain/bids"],
  ["DELETE", "/blockchain/models"],
];

// Explicitly blocked paths (belt-and-suspenders — checked even if allowlist fails)
const BLOCKED_PATH_PREFIXES = [
  "/blockchain/send/",  // irreversible fund transfer
  "/wallet/mnemonic",   // replaces wallet
  "/wallet/privateKey", // replaces wallet
  "/docker/",           // remote code execution risk
  "/ipfs/download/",    // path traversal risk
];

const BLOCKED_EXACT_PATHS = [
  "/wallet", // DELETE /wallet — removes wallet entirely
];

function checkAllowlist(method: string, path: string): void {
  const m = method.toUpperCase();

  // Explicit block list first
  for (const prefix of BLOCKED_PATH_PREFIXES) {
    if (path.startsWith(prefix)) {
      throw new Error(`[client] Blocked endpoint: ${m} ${path} — irreversible or dangerous operation`);
    }
  }
  if (m === "DELETE" && BLOCKED_EXACT_PATHS.includes(path)) {
    throw new Error(`[client] Blocked endpoint: ${m} ${path} — would remove the wallet`);
  }

  // Allowlist check
  const allowed = ALLOWED_ENDPOINTS.some(
    ([allowedMethod, allowedPath]) =>
      m === allowedMethod && path.startsWith(allowedPath)
  );

  if (!allowed) {
    throw new Error(
      `[client] Endpoint not in allowlist: ${m} ${path}. ` +
        "Add it to ALLOWED_ENDPOINTS in client.ts only after security review."
    );
  }
}

export class MorpheusClient {
  private config: Config;
  private _walletAddress?: string;

  constructor(config: Config) {
    this.config = config;
  }

  private authHeader(): string {
    const creds = `${this.config.apiUser}:${this.config.apiPassword}`;
    return "Basic " + Buffer.from(creds).toString("base64");
  }

  private url(path: string, params?: Record<string, string>): string {
    const base = `${this.config.apiUrl}${path}`;
    if (!params || Object.keys(params).length === 0) return base;
    const qs = new URLSearchParams(params).toString();
    return `${base}?${qs}`;
  }

  async get<T>(path: string, params?: Record<string, string>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    checkAllowlist("GET", path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(this.url(path, params), {
        method: "GET",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${body}`);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async post<T>(path: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    checkAllowlist("POST", path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(this.url(path), {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async delete<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    checkAllowlist("DELETE", path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(this.url(path), {
        method: "DELETE",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
      }
      // Some DELETE endpoints return 204 No Content
      const contentType = res.headers.get("content-type") ?? "";
      if (res.status === 204 || !contentType.includes("application/json")) {
        return {} as T;
      }
      return res.json() as Promise<T>;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  /** Resolve and cache the wallet address (via GET /wallet) */
  async getWalletAddress(): Promise<string> {
    if (this._walletAddress) return this._walletAddress;
    const res = await this.get<{ address: string }>("/wallet");
    this._walletAddress = res.address.toLowerCase();
    return this._walletAddress;
  }
}
