# Architecture

```mermaid
flowchart TB
    subgraph interfaces["Interfaces"]
        CLI["CLI\nmorpheus-node-manager"]
        MCP["MCP Server\nmorpheus-node-manager-mcp"]
        OAI["OpenAI Tools\ntools + handleToolCall()"]
    end

    subgraph agents["AI Agents"]
        CC["Claude Code"]
        CLINE["Cline / Continue.dev"]
        AGENT["Any OpenAI-compatible agent"]
    end

    subgraph core["Core Layer (src/core/)"]
        CLIENT["client.ts\nHTTP + endpoint allowlist"]
        HEALTH["health.ts\ntwo-stage health check"]
        MODELS["models.ts\nlist / add / remove"]
        BIDS["bids.ts\nadjust bid"]
        EARN["earnings.ts\nclaim sessions"]
        PROV["provider.ts\nbalances + BigInt wei"]
    end

    subgraph opsagent["Ops Agent (Docker)"]
        LOOP["agent.ts\n5-min monitoring loop"]
        AUDIT["audit.ts\nappend-only log"]
        ALERTS["alerts.ts\nTelegram / Slack webhook"]
    end

    subgraph hetzner["Hetzner VPS 5.161.177.217"]
        ROUTER["morpheus-router\nproxy-router process\n:3333 inference  :8082 API"]
    end

    subgraph backends["Inference Backends"]
        VENICE["Venice AI\nGLM-5, Kimi K2.5"]
        AKASH["AkashChat\nOpenRouter\nOllama ..."]
    end

    subgraph chain["Arbitrum Mainnet"]
        MARKET["Morpheus Marketplace\nbids · sessions · MOR payments"]
    end

    CC --> MCP
    CLINE --> MCP
    AGENT --> OAI
    CLI --> core
    MCP --> core
    OAI --> core
    core --> CLIENT
    CLIENT -->|"REST API\nbasic auth"| ROUTER
    ROUTER -->|"OpenAI-compatible"| VENICE
    ROUTER -->|"OpenAI-compatible"| AKASH
    ROUTER <-->|"Arbitrum RPC\nbids · sessions · claims"| MARKET
    LOOP --> core
    LOOP --> AUDIT
    LOOP --> ALERTS
    LOOP -->|"systemctl restart"| ROUTER
```

## Components

### Interfaces

All three interfaces share the same core layer. The interface you choose depends on how you want to interact with the node:

- **CLI** -- direct terminal commands, scriptable, JSON output to stdout
- **MCP Server** -- stdio-based protocol for AI coding agents
- **OpenAI Tools** -- function-calling schema for any OpenAI-compatible agent

### Core Layer

The core layer (`src/core/`) contains the business logic:

- **client.ts** -- HTTP client with a strict endpoint allowlist. Dangerous endpoints (ETH/MOR transfers, wallet operations) are blocked before any network request is made.
- **health.ts** -- Two-stage health check: first confirms the process responds, then verifies blockchain connectivity.
- **models.ts** -- List, add, and remove models from the Morpheus marketplace.
- **bids.ts** -- Adjust bid pricing. Deletes the old bid and posts a new one with minimal gap.
- **earnings.ts** -- Inspect and claim MOR from completed provider sessions.
- **provider.ts** -- Provider registration info, balances, and BigInt-safe wei utilities.

### Ops Agent

A Docker-based autonomous monitoring daemon. Runs health checks, balance monitoring, auto-claiming, and bid presence verification on a configurable interval. See [Ops Agent](ops-agent.md) for details.

### Proxy-Router

The Morpheus proxy-router is the provider's node software. It listens on port 3333 for inference requests and port 8082 for the REST API. This tool wraps the REST API.
