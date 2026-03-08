# Morpheus Node Manager

CLI + MCP server + OpenAI tools for managing Morpheus Lumerin provider nodes.

## Purpose

Portable tool for any AI agent to monitor and manage a Morpheus proxy-router node:
- Check node health, models, bids, earnings, and balances
- Add/remove models from the marketplace
- Claim session earnings
- Autonomous ops agent with circuit breakers and webhook alerts

## Our Node

- Provider address: `0xa2c397849325605d8a7b08629f173540a9f1ac41`
- Hetzner VPS: `5.161.177.217`
- API port: `8082` (proxy-router REST API)
- Models offered: GLM-5, Kimi K2.5 (backed by Venice DIEM)

## Architecture

```
src/
  config.ts              # Config loader (env > file > .cookie > defaults)
  index.ts               # Re-exports
  core/
    types.ts             # All interfaces (BigInt-aware)
    client.ts            # HTTP client with endpoint allowlist
    health.ts            # Two-stage health check
    models.ts            # list/add/remove models
    bids.ts              # adjust_bid
    earnings.ts          # claim_earnings
    provider.ts          # provider_info, balances, BigInt utils
  mcp-server.ts          # MCP stdio server
  openai-tools.ts        # OpenAI function calling schema + handler
  cli.ts                 # CLI entry point
  ops-agent/
    agent.ts             # Main monitoring loop with circuit breakers
    alerts.ts            # Webhook notifications
    audit.ts             # Append-only JSON audit log
    config.ts            # Ops agent config
    index.ts             # Daemon/one-shot entry point
templates/
  config.example.json
  morpheus-ops-agent.service
  morpheus-ops-agent.timer
  com.morpheus.ops-agent.plist
test/
  core.test.ts
```

## Security

- **Endpoint allowlist**: `client.ts` blocks irreversible endpoints (send ETH/MOR, wallet ops, docker, IPFS download)
- **Config file**: `0600` permissions; refuses `http://` for remote URLs
- **`remove_model`**: requires `confirm: "DELETE_MODEL_<first8chars>"` param
- **`adjust_bid`**: pre-prepares new bid params before deleting old bid (minimizes gap)
- **Ops agent**: lockfile, restart cap (max 3 consecutive), claim rate limit

## Running

```bash
# CLI
morpheus-node-manager status
morpheus-node-manager models
morpheus-node-manager add-model --apiType openai --apiUrl https://api.venice.ai/api/v1 --apiKey KEY --modelName glm-4-9b --pricePerSecondWei 100000000

# MCP server (for Claude Code, Cline, Continue.dev)
morpheus-node-manager-mcp

# Ops agent (one-shot)
node dist/ops-agent/index.js --once

# Ops agent (daemon)
node dist/ops-agent/index.js
```

## Environment Variables

- `MORPHEUS_API_URL` — proxy-router API URL (default: http://localhost:8082)
- `MORPHEUS_API_USER` — basic auth user (default: admin)
- `MORPHEUS_API_PASSWORD` — basic auth password
- `MORPHEUS_COOKIE_PATH` — path to proxy-router `.cookie` file

## Build

```bash
npm install
npm run build
npm test
```
