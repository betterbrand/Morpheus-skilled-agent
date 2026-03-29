# Tools Reference

The node manager exposes 8 tools, available through all three interfaces (CLI, MCP, OpenAI Tools).

| Tool | What it does |
|------|--------------|
| `node_status` | Two-stage health check: first confirms the process responds to `/healthcheck`, then verifies blockchain connectivity via `/blockchain/latestBlock`. Returns wallet address, formatted ETH/MOR balances, active bid count, active session count, and provider registration status. |
| `list_models` | All models registered on the Morpheus marketplace. Your active bids are surfaced inline on each model (`myBid` field) with current price and bid ID. |
| `add_model` | Register a model on-chain and post an opening bid in a single call. Accepts all 6 proxy-router backend `apiType` values. Returns the new model ID and bid ID. |
| `remove_model` | Remove a model and all your bids for it. Requires a `confirm` token of the form `DELETE_MODEL_<first8chars>` to prevent accidental deletion. |
| `adjust_bid` | Update your price for a model. Deletes the existing bid and posts a new one. Note: there is a brief (<1s) bid gap between the delete and re-post. |
| `claim_earnings` | Inspect and claim MOR from completed provider sessions. Supports dry-run mode, per-call claim caps, and a minimum claimable threshold. |
| `check_balances` | ETH and MOR balances for the node wallet, returned in both human-readable format (`0.05 ETH`) and raw wei. |
| `provider_info` | Provider registration record: stake, fee (basis points), registered endpoint, and all currently active bids. |
