// agent.ts — main monitoring loop with circuit breakers
// Runs checks every N minutes: health, balances, sessions, bids.
// Guards: restart cap, claim rate limit, startup grace, concurrency lock.

import { execFile } from "child_process";
import { readFileSync, writeFileSync, existsSync, chmodSync } from "fs";
import { promisify } from "util";
import type { OpsConfig, OpsState } from "../core/types.js";
import { MorpheusClient } from "../core/client.js";
import { nodeStatus } from "../core/health.js";
import { checkBalances, weiGte } from "../core/provider.js";
import { claimEarnings } from "../core/earnings.js";
import { listModels } from "../core/models.js";
import { AuditLog } from "./audit.js";
import { sendAlert } from "./alerts.js";

const execFileAsync = promisify(execFile);

const DEFAULT_STATE: OpsState = {
  lastClaimedAt: {},
  consecutiveRestarts: 0,
  consecutiveHealthyChecks: 0,
  lastCheckAt: 0,
};

function loadState(path: string): OpsState {
  try {
    if (!existsSync(path)) return { ...DEFAULT_STATE };
    const raw = readFileSync(path, "utf-8");
    return { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<OpsState>) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(path: string, state: OpsState): void {
  try {
    writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600, encoding: "utf-8" });
  } catch (err) {
    console.error("[agent] Failed to save state:", err instanceof Error ? err.message : err);
  }
}

/** Restart the proxy-router service. Uses execFile (not exec) for safety. */
async function restartService(): Promise<void> {
  const platform = process.platform;
  if (platform === "linux") {
    await execFileAsync("systemctl", ["restart", "morpheus-proxy-router"]);
  } else if (platform === "darwin") {
    // Assumes LaunchAgent label — adjust if needed
    await execFileAsync("launchctl", [
      "kickstart",
      "-k",
      "gui/501/com.morpheus.proxy-router",
    ]);
  } else {
    throw new Error(`Auto-restart not supported on platform: ${platform}`);
  }
}

export class OpsAgent {
  private config: OpsConfig;
  private client: MorpheusClient;
  private audit: AuditLog;

  constructor(config: OpsConfig) {
    this.config = config;
    this.client = new MorpheusClient({
      apiUrl: config.apiUrl,
      apiUser: config.apiUser,
      apiPassword: config.apiPassword,
    });
    this.audit = new AuditLog(config.auditFile);
  }

  private async alert(
    title: string,
    body: string,
    severity: "info" | "warning" | "critical" = "warning"
  ): Promise<void> {
    console.error(`[${severity.toUpperCase()}] ${title}: ${body}`);
    if (this.config.alerts.webhookUrl) {
      await sendAlert(
        {
          webhookUrl: this.config.alerts.webhookUrl,
          type: this.config.alerts.type,
        },
        { title, body, severity }
      );
    }
  }

  /** Run a single check cycle. Returns whether the node was healthy. */
  async runCycle(): Promise<boolean> {
    const stateFile = this.config.stateFile!;
    const state = loadState(stateFile);
    state.lastCheckAt = Math.floor(Date.now() / 1000);

    const issues: string[] = [];

    // 1. Two-stage health check
    let healthy = false;
    try {
      const status = await nodeStatus(this.client);
      healthy = status.healthy;

      if (!status.processAlive) {
        issues.push("Process is not responding to healthcheck");
      } else if (!status.blockchainConnected) {
        issues.push("Blockchain connection unavailable (healthcheck OK but latestBlock failed)");
      }

      this.audit.write("health_check", {
        healthy: status.healthy,
        processAlive: status.processAlive,
        blockchainConnected: status.blockchainConnected,
        latestBlock: status.latestBlock,
      });
    } catch (err) {
      issues.push(`Health check error: ${err instanceof Error ? err.message : String(err)}`);
      this.audit.write("health_check_error", { error: String(err) });
    }

    // 2. Balance check
    try {
      const balances = await checkBalances(this.client);
      const morOk = weiGte(balances.morWei, this.config.thresholds.minMorWei);
      const ethOk = weiGte(balances.ethWei, this.config.thresholds.minEthWei);

      if (!morOk) {
        issues.push(`Low MOR balance: ${balances.mor} (min: ${this.config.thresholds.minMorWei} wei)`);
        this.audit.write("low_balance", { token: "MOR", balance: balances.morWei });
      }
      if (!ethOk) {
        issues.push(`Low ETH balance: ${balances.eth} (min: ${this.config.thresholds.minEthWei} wei)`);
        this.audit.write("low_balance", { token: "ETH", balance: balances.ethWei });
      }
    } catch (err) {
      issues.push(`Balance check failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. Claim check (only if node appears healthy)
    if (healthy && this.config.autoClaim) {
      try {
        const claims = await claimEarnings(this.client, {
          doClaim: true,
          maxClaims: this.config.maxClaimsPerCycle,
          recentlyClaimed: state.lastClaimedAt,
          minClaimableWei: "1000000000000000", // 0.001 MOR minimum
        });

        for (const claim of claims) {
          if (claim.txHash) {
            state.lastClaimedAt[claim.sessionId] = Math.floor(Date.now() / 1000);
            this.audit.write("claim_earnings", {
              sessionId: claim.sessionId,
              amount: claim.claimableWei,
              txHash: claim.txHash,
            });
            console.error(`[agent] Claimed ${claim.claimableFormatted} from session ${claim.sessionId}`);
          }
        }
      } catch (err) {
        console.error("[agent] Claim check failed:", err instanceof Error ? err.message : err);
      }
    }

    // 4. Bid presence check
    try {
      const models = await listModels(this.client);
      const missingBids = models.filter((m) => m.myBid === undefined);
      if (missingBids.length > 0) {
        const names = missingBids.map((m) => m.name).join(", ");
        issues.push(`Models without active bids: ${names}`);
        this.audit.write("missing_bids", { models: missingBids.map((m) => m.id) });
      }
    } catch (err) {
      // Non-critical — don't add to issues
      console.error("[agent] Bid check failed:", err instanceof Error ? err.message : err);
    }

    // 5. Handle unhealthy node
    if (!healthy) {
      state.consecutiveRestarts++;
      state.consecutiveHealthyChecks = 0;

      if (state.consecutiveRestarts > this.config.maxConsecutiveRestarts) {
        await this.alert(
          "Morpheus node: restart cap reached",
          `Node has failed ${state.consecutiveRestarts} consecutive health checks. ` +
            `Manual intervention required. Last issues: ${issues.join("; ")}`,
          "critical"
        );
        this.audit.write("restart_cap_reached", {
          consecutiveRestarts: state.consecutiveRestarts,
          issues,
        });
      } else if (this.config.autoRestart) {
        try {
          console.error(`[agent] Node unhealthy (attempt ${state.consecutiveRestarts}/${this.config.maxConsecutiveRestarts}). Restarting...`);
          await restartService();
          this.audit.write("restart", {
            reason: issues[0] ?? "healthcheck_failed",
            attempt: state.consecutiveRestarts,
          });
          await this.alert(
            "Morpheus node restarted",
            `Restart attempt ${state.consecutiveRestarts}. Issues: ${issues.join("; ")}`,
            "warning"
          );
        } catch (restartErr) {
          const msg = restartErr instanceof Error ? restartErr.message : String(restartErr);
          await this.alert("Morpheus node restart failed", msg, "critical");
          this.audit.write("restart_failed", { error: msg });
        }
      } else {
        // Alert but no auto-restart
        await this.alert(
          "Morpheus node unhealthy",
          issues.join("; "),
          "critical"
        );
      }
    } else {
      state.consecutiveRestarts = 0;
      state.consecutiveHealthyChecks++;

      // Send non-critical alerts only after startup grace (2 consecutive healthy checks)
      if (state.consecutiveHealthyChecks >= 2 && issues.length > 0) {
        await this.alert(
          "Morpheus node: issues detected",
          issues.join("\n"),
          "warning"
        );
      }
    }

    saveState(stateFile, state);
    return healthy;
  }
}
