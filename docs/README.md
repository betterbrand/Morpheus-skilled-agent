# Morpheus Node Manager

A portable Node.js/TypeScript tool for managing a [Morpheus Lumerin](https://mor.org) AI inference provider node. It exposes all provider operations -- health checks, model management, bid adjustment, earnings claiming, and balance monitoring -- through three interfaces:

- **CLI** for terminal use
- **MCP server** for AI coding agents (Claude Code, Cline, Continue.dev, OpenCode)
- **OpenAI function-calling schema** for any agent using the OpenAI tools API

An optional autonomous **ops agent** monitors the node on a configurable interval, auto-claims earnings, alerts on low balances, and restarts the proxy-router when it goes down.

## What is Morpheus?

[Morpheus](https://mor.org) is a decentralized AI marketplace on Arbitrum. Providers stake MOR tokens, register models, and post bids to sell inference capacity to users. The proxy-router is the provider's node software: it manages sessions, validates payments on-chain, and routes inference requests to a backend (Venice AI, AkashChat, OpenRouter, local Ollama, etc.). This tool wraps the proxy-router's REST API to make provider operations scriptable and agent-accessible.

## Links

- **Source:** [github.com/betterbrand/Morpheus-skilled-agent](https://github.com/betterbrand/Morpheus-skilled-agent)
- **Morpheus:** [mor.org](https://mor.org)
