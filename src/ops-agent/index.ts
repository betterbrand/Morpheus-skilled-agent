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

// --- Lockfile concurrency guard (atomic via O_EXCL — no TOCTOU race) ---
function acquireLock(): boolean {
  try {
    // O_EXCL: fail if file exists — atomic, no TOCTOU
    // Write pid:timestamp to detect PID reuse on stale lock check
    writeFileSync(lockFile, `${process.pid}:${Date.now()}`, { flag: "wx", mode: 0o600, encoding: "utf-8" });
    return true;
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("[ops-agent] Failed to acquire lockfile:", err.message);
      return false;
    }
    // File exists — check if holder is still alive
    try {
      const content = readFileSync(lockFile, "utf-8").trim();
      const [pidStr, tsStr] = content.split(":");
      const pid = parseInt(pidStr, 10);
      const lockTs = parseInt(tsStr, 10);
      process.kill(pid, 0); // signal 0 = existence check
      // If lock is older than 24h, treat as stale even if PID exists (PID reuse)
      if (lockTs && Date.now() - lockTs > 86_400_000) {
        throw new Error("lock too old, likely PID reuse");
      }
      console.error(`[ops-agent] Another instance is running (PID ${pid}). Exiting.`);
      return false;
    } catch {
      // Stale lock — remove and retry once
      console.error("[ops-agent] Removing stale lockfile.");
      unlinkSync(lockFile);
      try {
        writeFileSync(lockFile, `${process.pid}:${Date.now()}`, { flag: "wx", mode: 0o600, encoding: "utf-8" });
        return true;
      } catch {
        console.error("[ops-agent] Failed to acquire lockfile after stale lock removal.");
        return false;
      }
    }
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
