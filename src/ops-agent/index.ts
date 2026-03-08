#!/usr/bin/env node
// ops-agent entry point — daemon or one-shot mode with lockfile concurrency guard.
// Usage:
//   node dist/ops-agent/index.js --config /path/to/config.json [--once]

import { parseArgs } from "node:util";
import { existsSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import { loadOpsConfig } from "./config.js";
import { OpsAgent } from "./agent.js";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    config: { type: "string", default: "./config.json" },
    once: { type: "boolean", default: false },
  },
  strict: false,
});

const configPath = (typeof values.config === "string" ? values.config : undefined) ?? "./config.json";
const runOnce = values.once === true;

const config = loadOpsConfig(configPath);
const lockFile = config.lockFile!;

// --- Lockfile concurrency guard ---
function acquireLock(): boolean {
  if (existsSync(lockFile)) {
    const pid = readFileSync(lockFile, "utf-8").trim();
    // Check if that PID is still running
    try {
      process.kill(parseInt(pid, 10), 0); // signal 0 = existence check
      console.error(`[ops-agent] Another instance is running (PID ${pid}). Exiting.`);
      return false;
    } catch {
      // Process doesn't exist — stale lockfile, remove it
      console.error(`[ops-agent] Removing stale lockfile for PID ${pid}`);
      unlinkSync(lockFile);
    }
  }
  try {
    writeFileSync(lockFile, String(process.pid), { mode: 0o600, encoding: "utf-8" });
    return true;
  } catch (err) {
    console.error("[ops-agent] Failed to acquire lockfile:", err instanceof Error ? err.message : err);
    return false;
  }
}

function releaseLock(): void {
  try {
    if (existsSync(lockFile)) {
      unlinkSync(lockFile);
    }
  } catch {
    // Best effort
  }
}

// Cleanup on exit
process.on("exit", releaseLock);
process.on("SIGTERM", () => { releaseLock(); process.exit(0); });
process.on("SIGINT", () => { releaseLock(); process.exit(0); });

if (!acquireLock()) {
  process.exit(1);
}

const agent = new OpsAgent(config);

if (runOnce) {
  // One-shot mode — run a single cycle and exit
  console.error(`[ops-agent] Running one-shot check (config: ${configPath})`);
  try {
    const healthy = await agent.runCycle();
    releaseLock();
    process.exit(healthy ? 0 : 1);
  } catch (err) {
    console.error("[ops-agent] Fatal error:", err instanceof Error ? err.message : err);
    releaseLock();
    process.exit(2);
  }
} else {
  // Daemon mode — run immediately, then repeat on interval
  console.error(`[ops-agent] Starting daemon (interval: ${config.checkIntervalMs}ms, config: ${configPath})`);

  async function runLoop(): Promise<void> {
    try {
      await agent.runCycle();
    } catch (err) {
      console.error("[ops-agent] Cycle error:", err instanceof Error ? err.message : err);
    }
    setTimeout(runLoop, config.checkIntervalMs);
  }

  await runLoop();
}
