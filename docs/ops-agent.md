# Ops Agent

An autonomous monitoring daemon that runs on a configurable interval (default: every 5 minutes).

## What it does each cycle

1. **Two-stage health check** -- if the node is unhealthy, restarts the proxy-router service (systemctl on Linux, launchctl on macOS) up to `maxConsecutiveRestarts` times before alerting and stopping
2. **Balance check** -- sends an alert if ETH or MOR drops below configured thresholds
3. **Auto-claim** -- claims earnings from completed sessions, respecting a per-cycle cap and minimum claimable amount
4. **Bid presence check** -- alerts if your provider has no active bids on the marketplace

## Circuit breakers

- **Restart cap:** stops auto-restarting after `maxConsecutiveRestarts` consecutive failures and sends a critical alert
- **Claim rate limit:** per-session timestamps prevent redundant claim attempts
- **Lockfile:** prevents concurrent runs (stale locks are detected and cleared after 24 hours)
- **Startup grace:** non-critical alerts are suppressed until 2 consecutive healthy checks

## Running

```bash
# One-shot check (suitable for cron)
node dist/ops-agent/index.js --once --config /etc/morpheus-node-manager/config.json

# Daemon mode (runs continuously on configured interval)
node dist/ops-agent/index.js --config /config/config.json
```

## Configuration

Copy `templates/config.example.json` and edit:

```json
{
  "apiUrl": "http://localhost:8082",
  "apiUser": "admin",
  "apiPassword": "CHANGE_ME",
  "checkIntervalMs": 300000,
  "thresholds": {
    "minMorWei": "500000000000000000",
    "minEthWei": "10000000000000000"
  },
  "autoClaim": true,
  "maxClaimsPerCycle": 5,
  "autoRestart": true,
  "maxConsecutiveRestarts": 3,
  "alerts": {
    "webhookUrl": "",
    "type": "generic"
  }
}
```

### Alert types

`type` accepts:

- `"telegram"` -- sends to a Telegram bot webhook
- `"slack"` -- sends a Slack incoming webhook
- `"generic"` -- sends a JSON POST with `{ title, body, severity }`

## Docker deployment

The recommended way to run the ops agent is via Docker:

```yaml
# docker-compose.yml
services:
  ops-agent:
    image: morpheus-node-manager
    build: .
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./config.json:/config/config.json:ro
      - ops-agent-data:/root
    environment:
      - NODE_ENV=production

  dashboard:
    image: morpheus-node-manager
    build: .
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./config.json:/config/config.json:ro
    environment:
      - NODE_ENV=production
    command: ["node", "dist/dashboard.js", "--host", "0.0.0.0", "--port", "3000", "--url", "http://localhost:8082", "--user", "admin", "--password", "admin", "--insecure"]

volumes:
  ops-agent-data:
```

When running in Docker, set `autoRestart: false` if the proxy-router is managed by systemd on the host -- the container doesn't have access to `systemctl`.

## Systemd / launchd templates

Deployment templates are in `templates/`:

- `morpheus-ops-agent.service` + `morpheus-ops-agent.timer` -- systemd (Linux)
- `com.morpheus.ops-agent.plist` -- launchd (macOS)

## Audit log

The ops agent writes an append-only JSON audit log (default: `~/.morpheus-node-manager-audit.log`) recording every health check, claim, restart, and alert. State is persisted to `~/.morpheus-node-manager-state.json` across runs.
