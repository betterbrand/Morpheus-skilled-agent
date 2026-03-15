// dashboard-api.ts — HTTP API request handler for the dashboard
// Wraps core functions into REST endpoints with JSON responses.
// Used by dashboard.ts HTTP server to route /api/* requests.

import type { IncomingMessage, ServerResponse } from "node:http";
import type { MorpheusClient } from "./core/client.js";
import { nodeStatus } from "./core/health.js";
import { listModels, addModel, removeModel } from "./core/models.js";
import { adjustBid } from "./core/bids.js";
import { claimEarnings } from "./core/earnings.js";
import { checkBalances, providerInfo } from "./core/provider.js";

/** Read the full request body as a string */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

/** Parse JSON body, returning undefined on failure */
async function parseJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  try {
    const raw = await readBody(req);
    if (!raw) return undefined;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Send a JSON response */
function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

/** Send a JSON error response */
function jsonError(res: ServerResponse, status: number, message: string): void {
  json(res, status, { error: message });
}

/**
 * Handle an /api/* request. Returns true if the request was handled, false otherwise.
 */
export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  client: MorpheusClient
): Promise<boolean> {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  try {
    // GET /api/status
    if (method === "GET" && path === "/api/status") {
      const result = await nodeStatus(client);
      json(res, 200, result);
      return true;
    }

    // GET /api/models
    if (method === "GET" && path === "/api/models") {
      const result = await listModels(client);
      json(res, 200, result);
      return true;
    }

    // GET /api/balances
    if (method === "GET" && path === "/api/balances") {
      const result = await checkBalances(client);
      json(res, 200, result);
      return true;
    }

    // GET /api/provider
    if (method === "GET" && path === "/api/provider") {
      const result = await providerInfo(client);
      json(res, 200, result);
      return true;
    }

    // GET /api/earnings
    if (method === "GET" && path === "/api/earnings") {
      const result = await claimEarnings(client, { doClaim: false });
      json(res, 200, result);
      return true;
    }

    // POST /api/models
    if (method === "POST" && path === "/api/models") {
      const body = await parseJsonBody(req);
      if (!body) {
        jsonError(res, 400, "Invalid or missing JSON body");
        return true;
      }
      const missing: string[] = [];
      if (!body.name) missing.push("name");
      if (!body.ipfsCID) missing.push("ipfsCID");
      if (!body.stakeWei) missing.push("stakeWei");
      if (!body.pricePerSecondWei) missing.push("pricePerSecondWei");
      if (!body.apiType) missing.push("apiType");
      if (!body.apiUrl) missing.push("apiUrl");
      if (!body.apiKey) missing.push("apiKey");
      if (missing.length > 0) {
        jsonError(res, 400, `Missing required fields: ${missing.join(", ")}`);
        return true;
      }
      const result = await addModel(client, {
        name: String(body.name),
        ipfsCID: String(body.ipfsCID),
        stakeWei: String(body.stakeWei),
        pricePerSecondWei: String(body.pricePerSecondWei),
        apiType: String(body.apiType),
        apiUrl: String(body.apiUrl),
        apiKey: String(body.apiKey),
        modelName: body.modelName ? String(body.modelName) : undefined,
      });
      json(res, 201, result);
      return true;
    }

    // DELETE /api/models/:id
    if (method === "DELETE" && path.startsWith("/api/models/")) {
      const modelId = path.slice("/api/models/".length);
      if (!modelId) {
        jsonError(res, 400, "Missing model ID in path");
        return true;
      }
      const body = await parseJsonBody(req);
      const confirm = body?.confirm ? String(body.confirm) : undefined;
      if (!confirm) {
        jsonError(res, 400, "Missing required field: confirm (must be DELETE_MODEL_<first8chars>)");
        return true;
      }
      const result = await removeModel(client, { modelId, confirm });
      json(res, 200, result);
      return true;
    }

    // POST /api/bids/adjust
    if (method === "POST" && path === "/api/bids/adjust") {
      const body = await parseJsonBody(req);
      if (!body) {
        jsonError(res, 400, "Invalid or missing JSON body");
        return true;
      }
      if (!body.modelId || !body.newPricePerSecondWei) {
        jsonError(res, 400, "Missing required fields: modelId, newPricePerSecondWei");
        return true;
      }
      const result = await adjustBid(client, {
        modelId: String(body.modelId),
        newPricePerSecondWei: String(body.newPricePerSecondWei),
      });
      json(res, 200, result);
      return true;
    }

    // POST /api/earnings/claim
    if (method === "POST" && path === "/api/earnings/claim") {
      const body = await parseJsonBody(req);
      const maxClaims =
        body?.maxClaims && typeof body.maxClaims === "number" && Number.isInteger(body.maxClaims) && body.maxClaims > 0
          ? body.maxClaims
          : 10;
      const minClaimableWei = body?.minClaimableWei ? String(body.minClaimableWei) : "0";
      if (!/^\d+$/.test(minClaimableWei)) {
        jsonError(res, 400, "minClaimableWei must be a non-negative integer string");
        return true;
      }
      const result = await claimEarnings(client, {
        doClaim: true,
        maxClaims,
        minClaimableWei,
      });
      json(res, 200, result);
      return true;
    }

    // No matching API route
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const truncated = msg.length > 500 ? msg.slice(0, 500) + "..." : msg;
    jsonError(res, 500, truncated);
    return true;
  }
}
