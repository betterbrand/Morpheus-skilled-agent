// ops-agent/config.ts — ops agent config loader with circuit breaker defaults

import { readFileSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { OpsConfig } from "../core/types.js";

const DEFAULT_STATE_FILE = join(homedir(), ".morpheus-node-manager-state.json");
const DEFAULT_AUDIT_FILE = join(homedir(), ".morpheus-node-manager-audit.log");
const DEFAULT_LOCK_FILE =
  process.platform === "linux"
    ? "/var/run/morpheus-ops-agent.lock"
    : "/tmp/morpheus-ops-agent.lock";

const DEFAULTS: OpsConfig = {
  apiUrl: "http://localhost:8082",
  apiUser: "admin",
  apiPassword: "",
  checkIntervalMs: 300_000, // 5 minutes
  thresholds: {
    minMorWei: "500000000000000000",  // 0.5 MOR
    minEthWei: "10000000000000000",   // 0.01 ETH
  },
  autoClaim: true,
  maxClaimsPerCycle: 5,
  autoRestart: true,
  maxConsecutiveRestarts: 3,
  alerts: {
    webhookUrl: "",
    type: "generic",
  },
  stateFile: DEFAULT_STATE_FILE,
  auditFile: DEFAULT_AUDIT_FILE,
  lockFile: DEFAULT_LOCK_FILE,
};

export function loadOpsConfig(configPath: string): OpsConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}. Copy templates/config.example.json and edit it.`);
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<OpsConfig>;

  // Merge with defaults (deep merge for nested objects)
  const config: OpsConfig = {
    ...DEFAULTS,
    ...parsed,
    thresholds: {
      ...DEFAULTS.thresholds,
      ...(parsed.thresholds ?? {}),
    },
    alerts: {
      ...DEFAULTS.alerts,
      ...(parsed.alerts ?? {}),
    },
    stateFile: parsed.stateFile ?? DEFAULTS.stateFile,
    auditFile: parsed.auditFile ?? DEFAULTS.auditFile,
    lockFile: parsed.lockFile ?? DEFAULTS.lockFile,
  };

  // Validate: refuse http:// for remote URLs
  try {
    const u = new URL(config.apiUrl);
    if (u.protocol === "http:") {
      const host = u.hostname;
      const isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1";
      if (!isLocal) {
        throw new Error(`apiUrl uses http:// for remote host "${host}". Use https:// for remote connections.`);
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("apiUrl")) throw err;
    throw new Error(`Invalid apiUrl: "${config.apiUrl}"`);
  }

  if (!config.apiPassword) {
    console.warn("[ops-agent] Warning: apiPassword is empty. Node API may reject requests.");
  }

  return config;
}
