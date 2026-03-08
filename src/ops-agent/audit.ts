// audit.ts — append-only JSON audit log
// Each line is a JSON object with a timestamp and action field.
// File is opened in append mode; each entry is one line (JSON lines format).

import { appendFileSync, existsSync, chmodSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { AuditEntry } from "../core/types.js";

const DEFAULT_AUDIT_FILE = join(homedir(), ".morpheus-node-manager-audit.log");

export class AuditLog {
  private path: string;
  private initialized = false;

  constructor(path = DEFAULT_AUDIT_FILE) {
    this.path = path;
  }

  private ensureFile(): void {
    if (this.initialized) return;
    // Set permissions on first write; file may or may not exist yet
    if (existsSync(this.path)) {
      try {
        chmodSync(this.path, 0o600);
      } catch {
        // Best effort
      }
    }
    this.initialized = true;
  }

  write(action: string, extra: Record<string, unknown> = {}): void {
    this.ensureFile();
    const entry: AuditEntry = {
      ts: new Date().toISOString(),
      action,
      ...extra,
    };
    try {
      appendFileSync(this.path, JSON.stringify(entry) + "\n", {
        encoding: "utf-8",
        mode: 0o600,
      });
    } catch (err) {
      // Never let audit failures crash the agent
      console.error("[audit] Failed to write:", err instanceof Error ? err.message : err);
    }
  }
}
