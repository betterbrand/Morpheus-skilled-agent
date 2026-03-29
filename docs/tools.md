# Tools Reference

The node manager exposes 8 tools, available through all three interfaces (CLI, MCP, and function calling).

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

## Function Calling Integration

For agents using the function-calling API directly:

```typescript
import { tools, handleToolCall } from 'morpheus-node-manager';

const config = {
  apiUrl: 'http://localhost:8082',
  apiUser: 'admin',
  apiPassword: 'your-password',
};

// Pass tools to your OpenAI-compatible API call
const response = await client.chat.completions.create({
  model: 'your-model',
  messages,
  tools,
  tool_choice: 'auto',
});

// Handle tool calls from the response
for (const call of response.choices[0].message.tool_calls ?? []) {
  const result = await handleToolCall(
    call.function.name,
    JSON.parse(call.function.arguments),
    config
  );
  // result is a JSON string -- add to messages as a tool response
}
```

`tools` is a static array of function-calling schema objects (OpenAI-compatible format). `handleToolCall(name, args, config)` dispatches to the appropriate core function and returns a JSON string result. Both are typed exports from `dist/index.js`.
