// alerts.ts — webhook notification dispatcher
// Supports Telegram bot, Slack incoming webhook, and generic JSON POST.

export interface AlertConfig {
  webhookUrl: string;
  type: "telegram" | "slack" | "generic";
  /** Telegram bot token (extracted from URL if using bot API URL) */
  telegramChatId?: string;
}

export interface AlertMessage {
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
}

/** Build the payload for a Telegram sendMessage call */
function telegramPayload(msg: AlertMessage, chatId: string): Record<string, unknown> {
  const emoji = msg.severity === "critical" ? "🔴" : msg.severity === "warning" ? "🟡" : "🟢";
  return {
    chat_id: chatId,
    text: `${emoji} *${msg.title}*\n\n${msg.body}`,
    parse_mode: "Markdown",
  };
}

/** Build a Slack Block Kit payload */
function slackPayload(msg: AlertMessage): Record<string, unknown> {
  const color = msg.severity === "critical" ? "#FF0000" : msg.severity === "warning" ? "#FFA500" : "#36A64F";
  return {
    attachments: [
      {
        color,
        title: msg.title,
        text: msg.body,
        ts: Math.floor(Date.now() / 1000).toString(),
      },
    ],
  };
}

/** Build a generic JSON payload */
function genericPayload(msg: AlertMessage): Record<string, unknown> {
  return {
    title: msg.title,
    body: msg.body,
    severity: msg.severity,
    timestamp: new Date().toISOString(),
  };
}

/** Validate webhook URL: must be HTTPS, must not target private/local hosts (SSRF prevention) */
function validateWebhookUrl(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch {
    throw new Error(`[alerts] Invalid webhook URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`[alerts] Webhook URL must use https:// (got ${parsed.protocol})`);
  }
  const h = parsed.hostname.toLowerCase();
  const isPrivate =
    h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0" ||
    /^10\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||              // link-local IPv4 (includes AWS metadata 169.254.169.254)
    h === "metadata.google.internal" ||   // GCP metadata
    h === "168.63.129.16" ||              // Azure metadata
    /^fe80:/i.test(h) ||                  // IPv6 link-local
    /^f[cd][0-9a-f]{2}:/i.test(h) ||     // IPv6 ULA (fc00::/7)
    /^::ffff:/i.test(h);                  // IPv4-mapped IPv6
  if (isPrivate) {
    throw new Error(`[alerts] Webhook URL must not point to private/local hosts: ${h}`);
  }
}

/** Send an alert via webhook. Returns true on success, false on failure. */
export async function sendAlert(
  config: AlertConfig,
  msg: AlertMessage
): Promise<boolean> {
  if (!config.webhookUrl) return false;

  try { validateWebhookUrl(config.webhookUrl); } catch (err) {
    console.error("[alerts]", err instanceof Error ? err.message : err);
    return false;
  }

  let payload: Record<string, unknown>;
  let url = config.webhookUrl;

  if (config.type === "telegram") {
    if (!config.telegramChatId) {
      console.error("[alerts] telegramChatId required for telegram alerts");
      return false;
    }
    payload = telegramPayload(msg, config.telegramChatId);
  } else if (config.type === "slack") {
    payload = slackPayload(msg);
  } else {
    payload = genericPayload(msg);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch (err) {
    console.error("[alerts] Webhook failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
