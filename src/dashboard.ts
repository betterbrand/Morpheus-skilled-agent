#!/usr/bin/env node
// dashboard.ts — HTTP server entry point for the Morpheus Node Manager dashboard
// Serves the REST API at /api/* and static files from dist/public/ for the frontend.
// Usage: morpheus-node-manager-dashboard [--port 3000] [--host 127.0.0.1] [--url ...] [--insecure]

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { MorpheusClient } from "./core/client.js";
import { handleApiRequest } from "./dashboard-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, "..");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

const { values: rawValues } = parseArgs({
  options: {
    port: { type: "string", default: "3000" },
    host: { type: "string", default: "127.0.0.1" },
    url: { type: "string" },
    user: { type: "string" },
    password: { type: "string" },
    cookie: { type: "string" },
    insecure: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (rawValues.help) {
  console.log(`Usage: morpheus-node-manager-dashboard [options]

Options:
  --port <port>       HTTP port (default: 3000)
  --host <host>       Bind address (default: 127.0.0.1)
  --url <url>         Proxy-router API URL (default: http://localhost:8082)
  --user <user>       API basic auth user (default: admin)
  --password <pwd>    API basic auth password
  --cookie <path>     Path to proxy-router .cookie file
  --insecure          Skip HTTPS enforcement for remote URLs
  -h, --help          Show this help
`);
  process.exit(0);
}

const str = (v: string | boolean | undefined): string | undefined =>
  typeof v === "string" ? v : undefined;

const port = parseInt(str(rawValues.port) ?? "3000", 10);
const host = str(rawValues.host) ?? "127.0.0.1";

if (Number.isNaN(port) || port < 0 || port > 65535) {
  console.error("[dashboard] Invalid port number");
  process.exit(1);
}

if (str(rawValues.password)) {
  console.warn(
    "[dashboard] Warning: --password exposes credentials in the process table. " +
      "Prefer MORPHEUS_API_PASSWORD env var or --cookie for the .cookie file path."
  );
}

const config = loadConfig({
  url: str(rawValues.url),
  user: str(rawValues.user),
  password: str(rawValues.password),
  cookiePath: str(rawValues.cookie),
  insecure: rawValues.insecure === true,
});

const client = new MorpheusClient(config);
const publicDir = resolve(__dirname, "public");

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const rawUrl = req.url ?? "/";

  // Prevent path traversal
  if (rawUrl.includes("..")) {
    res.writeHead(400, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
    res.end("Bad Request");
    return;
  }

  const url = new URL(rawUrl, `http://${host}:${port}`);
  const path = url.pathname;

  // Route /api/* to the API handler
  if (path.startsWith("/api/")) {
    const handled = await handleApiRequest(req, res, client);
    if (!handled) {
      res.writeHead(404, { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
    return;
  }

  // Serve static files for non-API paths
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
    res.end("Method Not Allowed");
    return;
  }

  // Resolve file path — serve index.html for "/"
  let filePath: string;
  if (path === "/") {
    filePath = join(publicDir, "index.html");
  } else {
    filePath = join(publicDir, normalize(path));
  }

  // Ensure resolved path is within publicDir (defense-in-depth for path traversal)
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
    res.end("Not Found");
    return;
  }

  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain", "X-Content-Type-Options": "nosniff" });
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.error(`[dashboard] Morpheus Node Manager dashboard listening on http://${host}:${port}`);
  console.error(`[dashboard] Proxy-router API: ${config.apiUrl}`);
  console.error(`[dashboard] Static files: ${publicDir}`);
});
