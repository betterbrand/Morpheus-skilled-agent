// openai-tools.ts — OpenAI function calling schema + handler
// Drop-in for any agent using OpenAI-compatible tool calling API.
// Usage: pass `tools` to the API, then call handleToolCall() with name+args from the response.

import type { Config } from "./core/types.js";
import { MorpheusClient } from "./core/client.js";
import { nodeStatus } from "./core/health.js";
import { listModels, addModel, removeModel } from "./core/models.js";
import { adjustBid } from "./core/bids.js";
import { claimEarnings } from "./core/earnings.js";
import { checkBalances, providerInfo } from "./core/provider.js";

export const tools = [
  {
    type: "function",
    function: {
      name: "node_status",
      description:
        "Check the health and status of the Morpheus proxy-router node. Returns process liveness, blockchain connectivity, wallet balances, active bids, and active sessions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_models",
      description:
        "List all models registered on the Morpheus marketplace, including your active bids and current prices.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_model",
      description:
        `Register a model on the Morpheus marketplace and post an opening bid.\n\n` +
        `apiType: "openai" (Venice, AkashChat, NEAR AI, Together AI, Hyperbolic LLM, OpenRouter, Ollama), ` +
        `"claudeai" (Anthropic), "prodia-v2"/"hyperbolic-sd"/"prodia-sd"/"prodia-sdxl" (image gen).\n\n` +
        `Ready backends: Venice https://api.venice.ai/api/v1, AkashChat https://chatapi.akash.network/api/v1, ` +
        `NEAR AI https://cloud-api.near.ai/v1, OpenRouter https://openrouter.ai/api/v1, ` +
        `Together https://api.together.xyz/v1, Hyperbolic LLM https://api.hyperbolic.xyz/v1, ` +
        `Ollama http://localhost:11434/v1`,
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Model name on the marketplace" },
          ipfsCID: { type: "string", description: "IPFS CID of the model card" },
          stakeWei: { type: "string", description: "MOR stake amount in wei" },
          pricePerSecondWei: { type: "string", description: "Price per second in MOR wei" },
          apiType: {
            type: "string",
            enum: ["openai", "claudeai", "prodia-v2", "hyperbolic-sd", "prodia-sd", "prodia-sdxl"],
            description: "Backend API type",
          },
          apiUrl: { type: "string", description: "Backend base URL" },
          apiKey: { type: "string", description: "Backend API key" },
          modelName: { type: "string", description: "Model name on the backend (optional)" },
        },
        required: ["name", "ipfsCID", "stakeWei", "pricePerSecondWei", "apiType", "apiUrl", "apiKey"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_model",
      description:
        "Remove a model and all your bids from the Morpheus marketplace. Requires confirm='DELETE_MODEL_<first8chars>' to prevent accidents.",
      parameters: {
        type: "object",
        properties: {
          modelId: { type: "string", description: "Model ID to remove" },
          confirm: {
            type: "string",
            description: "Must be 'DELETE_MODEL_<first8chars_of_modelId>' to confirm deletion",
          },
        },
        required: ["modelId", "confirm"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_bid",
      description:
        "Adjust your bid price for a model. WARNING: Brief bid gap (<1s) between old and new bid.",
      parameters: {
        type: "object",
        properties: {
          modelId: { type: "string", description: "Model ID to adjust bid for" },
          newPricePerSecondWei: { type: "string", description: "New price per second in MOR wei" },
        },
        required: ["modelId", "newPricePerSecondWei"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "claim_earnings",
      description: "Check and optionally claim earnings from completed provider sessions.",
      parameters: {
        type: "object",
        properties: {
          doClaim: {
            type: "boolean",
            description: "If true (default), claim. If false, only report claimable amounts.",
          },
          maxClaims: { type: "integer", description: "Max sessions to claim (default 10)" },
          minClaimableWei: {
            type: "string",
            description: "Minimum claimable wei to bother claiming (default '0')",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_balances",
      description: "Check ETH and MOR balances for the node wallet.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "provider_info",
      description:
        "Get provider registration details: stake, fee, endpoint, and all active bids.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
] as const;

type ToolArgs = Record<string, unknown>;

/** Handle a tool call from an OpenAI-compatible response. Returns JSON string result. */
export async function handleToolCall(
  name: string,
  args: ToolArgs,
  config: Config
): Promise<string> {
  const client = new MorpheusClient(config);

  switch (name) {
    case "node_status":
      return JSON.stringify(await nodeStatus(client), null, 2);

    case "list_models":
      return JSON.stringify(await listModels(client), null, 2);

    case "add_model":
      return JSON.stringify(
        await addModel(client, {
          name: String(args.name),
          ipfsCID: String(args.ipfsCID),
          stakeWei: String(args.stakeWei),
          pricePerSecondWei: String(args.pricePerSecondWei),
          apiType: String(args.apiType),
          apiUrl: String(args.apiUrl),
          apiKey: String(args.apiKey),
          modelName: args.modelName ? String(args.modelName) : undefined,
        }),
        null,
        2
      );

    case "remove_model":
      return JSON.stringify(
        await removeModel(client, {
          modelId: String(args.modelId),
          confirm: String(args.confirm),
        }),
        null,
        2
      );

    case "adjust_bid":
      return JSON.stringify(
        await adjustBid(client, {
          modelId: String(args.modelId),
          newPricePerSecondWei: String(args.newPricePerSecondWei),
        }),
        null,
        2
      );

    case "claim_earnings":
      return JSON.stringify(
        await claimEarnings(client, {
          doClaim: args.doClaim !== false,
          maxClaims: typeof args.maxClaims === "number" ? args.maxClaims : 10,
          minClaimableWei: args.minClaimableWei ? String(args.minClaimableWei) : "0",
        }),
        null,
        2
      );

    case "check_balances":
      return JSON.stringify(await checkBalances(client), null, 2);

    case "provider_info":
      return JSON.stringify(await providerInfo(client), null, 2);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
