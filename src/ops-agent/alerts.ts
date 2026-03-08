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

/** Send an alert via webhook. Returns true on success, false on failure. */
export async function sendAlert(
  config: AlertConfig,
  msg: AlertMessage
): Promise<boolean> {
  if (!config.webhookUrl) return false;

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
