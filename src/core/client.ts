// HTTP client for the Morpheus proxy-router REST API.
// Security: enforces an endpoint allowlist — blocked paths throw before any HTTP request.
// Uses native fetch() (Node 22 built-in), basic auth, AbortController timeouts.

import type { Config } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

// Paths that are ALLOWED. Everything else is blocked.
// "exact" = only this exact path. "prefix" = this path and any sub-paths (path + "/...").
type AllowMode = "exact" | "prefix";
const ALLOWED_ENDPOINTS: Array<[string, string, AllowMode]> = [
  ["GET", "/healthcheck", "exact"],
  ["GET", "/blockchain/balance", "exact"],
  ["GET", "/blockchain/latestBlock", "exact"],
  ["GET", "/blockchain/models", "prefix"],   // covers /blockchain/models and /blockchain/models/{id}/bids
  ["GET", "/blockchain/bids", "prefix"],
  ["GET", "/blockchain/providers", "prefix"],  // covers /blockchain/providers and /{addr}/bids/active
  ["GET", "/blockchain/sessions", "prefix"],  // covers /blockchain/sessions and /blockchain/sessions/provider
  ["GET", "/blockchain/token", "exact"],
  ["GET", "/proxy/sessions", "prefix"],       // covers /proxy/sessions/{id}/providerClaimableBalance
  ["GET", "/wallet", "exact"],
  ["POST", "/blockchain/models", "exact"],
  ["POST", "/blockchain/bids", "exact"],
  ["POST", "/proxy/sessions", "prefix"],      // covers /proxy/sessions/{id}/providerClaim
  ["DELETE", "/blockchain/bids", "prefix"],    // covers /blockchain/bids/{id}
  ["DELETE", "/blockchain/models", "prefix"],  // covers /blockchain/models/{id}
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
  "/wallet", // DELETE/POST/PUT /wallet — removes or replaces wallet entirely
];

function checkAllowlist(method: string, path: string): void {
  const m = method.toUpperCase();

  // Explicit block list first
  for (const prefix of BLOCKED_PATH_PREFIXES) {
    if (path.startsWith(prefix)) {
      throw new Error(`[client] Blocked endpoint: ${m} ${path} — irreversible or dangerous operation`);
    }
  }
  if ((m === "DELETE" || m === "POST" || m === "PUT") && BLOCKED_EXACT_PATHS.includes(path)) {
    throw new Error(`[client] Blocked endpoint: ${m} ${path} — would remove or replace the wallet`);
  }

  // Allowlist check — "exact" entries match only the literal path,
  // "prefix" entries also match sub-paths (path + "/...")
  const allowed = ALLOWED_ENDPOINTS.some(
    ([allowedMethod, allowedPath, mode]) => {
      if (m !== allowedMethod) return false;
      if (path === allowedPath) return true;
      return mode === "prefix" && path.startsWith(allowedPath + "/");
    }
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
        const truncated = body.length > 200 ? body.slice(0, 200) + "..." : body;
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${truncated}`);
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
        const truncated = text.length > 200 ? text.slice(0, 200) + "..." : text;
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${truncated}`);
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
        const truncated = text.length > 200 ? text.slice(0, 200) + "..." : text;
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${truncated}`);
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
