// Config loader: CLI flags > env vars > ~/.morpheus-node-manager.json > .cookie > defaults
// Security: config file written as 0600; warns if group/other readable; refuses http:// for remote

import { readFileSync, writeFileSync, statSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { Config } from "./core/types.js";

const DEFAULT_CONFIG_PATH = join(homedir(), ".morpheus-node-manager.json");
const DEFAULT_API_URL = "http://localhost:8082";
const DEFAULT_API_USER = "admin";

export interface CliOverrides {
  url?: string;
  user?: string;
  password?: string;
  cookiePath?: string;
  configPath?: string;
  /** Skip HTTPS enforcement. Only use for trusted networks (SSH tunnel, VPN, localhost). */
  insecure?: boolean;
}

/** Read the proxy-router .cookie file for the API password */
function readCookieFile(cookiePath: string): string | undefined {
  try {
    const content = readFileSync(cookiePath, "utf-8").trim();
    // Cookie file may be "user:password" or just the password
    if (content.includes(":")) {
      return content.split(":")[1];
    }
    return content;
  } catch {
    return undefined;
  }
}

/** Load saved config from disk */
function readSavedConfig(configPath: string): Partial<Config> {
  try {
    if (!existsSync(configPath)) return {};
    const stat = statSync(configPath);
    const mode = stat.mode & 0o777;
    if (mode & 0o077) {
      console.warn(
        `[config] Warning: ${configPath} is readable by group/other (mode ${mode.toString(8)}). ` +
          "Run: chmod 600 " + configPath
      );
    }
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Partial<Config>;
  } catch {
    return {};
  }
}

/** Save config to disk with 0600 permissions */
export function saveConfig(config: Partial<Config>, configPath = DEFAULT_CONFIG_PATH): void {
  const json = JSON.stringify(config, null, 2);
  writeFileSync(configPath, json, { mode: 0o600, encoding: "utf-8" });
}

/**
 * Validate that a remote URL uses HTTPS.
 * http:// is only allowed for localhost/127.0.0.1/0.0.0.0.
 * Pass insecure=true (or set MORPHEUS_INSECURE=true) to bypass — only for trusted networks.
 */
function validateUrl(url: string, insecure = false): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:") {
      const host = parsed.hostname;
      const isLocal =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host === "::1";
      if (!isLocal && !insecure) {
        throw new Error(
          `Refusing http:// for remote host "${host}". Use https:// for remote proxy-router connections, ` +
            "or set MORPHEUS_INSECURE=true / --insecure if connecting over a trusted network (SSH tunnel, VPN)."
        );
      }
      if (!isLocal && insecure) {
        console.warn(
          `[config] Warning: Using http:// for remote host "${host}". ` +
            "Ensure you are on a trusted network (SSH tunnel, VPN, or direct private network)."
        );
      }
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Invalid API URL: "${url}"`);
    }
    throw err;
  }
}

/**
 * Load config with priority:
 *   CLI flags > env vars > config file > .cookie file > defaults
 */
export function loadConfig(overrides: CliOverrides = {}): Config {
  const configPath = overrides.configPath ?? DEFAULT_CONFIG_PATH;
  const saved = readSavedConfig(configPath);

  // Resolve cookie path (CLI flag > env > saved > none)
  const cookiePath =
    overrides.cookiePath ??
    process.env.MORPHEUS_COOKIE_PATH ??
    saved.cookiePath;

  const cookiePassword = cookiePath ? readCookieFile(cookiePath) : undefined;

  const apiUrl =
    overrides.url ??
    process.env.MORPHEUS_API_URL ??
    saved.apiUrl ??
    DEFAULT_API_URL;

  const apiUser =
    overrides.user ??
    process.env.MORPHEUS_API_USER ??
    saved.apiUser ??
    DEFAULT_API_USER;

  const apiPassword =
    overrides.password ??
    process.env.MORPHEUS_API_PASSWORD ??
    saved.apiPassword ??
    cookiePassword ??
    "";

  const insecure = overrides.insecure ?? process.env.MORPHEUS_INSECURE === "true";
  validateUrl(apiUrl, insecure);

  return {
    apiUrl: apiUrl.replace(/\/$/, ""), // strip trailing slash
    apiUser,
    apiPassword,
    cookiePath,
  };
}
