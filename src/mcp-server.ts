#!/usr/bin/env node
// MCP server — exposes all 8 node manager tools via stdio transport.
// Compatible with Claude Code, Cline, Continue.dev, OpenCode, and any MCP client.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { MorpheusClient } from "./core/client.js";
import { nodeStatus } from "./core/health.js";
import { listModels, addModel, removeModel } from "./core/models.js";
import { adjustBid } from "./core/bids.js";
import { claimEarnings } from "./core/earnings.js";
import { checkBalances, providerInfo } from "./core/provider.js";

const config = loadConfig();
const client = new MorpheusClient(config);

const server = new McpServer({
  name: "morpheus-node-manager",
  version: "1.0.0",
});

// --- node_status ---
server.tool(
  "node_status",
  "Check the health and status of the Morpheus proxy-router node. Returns process liveness, blockchain connectivity, wallet balances, active bids, and active sessions.",
  {},
  async () => {
    const status = await nodeStatus(client);
    return {
      content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
    };
  }
);

// --- list_models ---
server.tool(
  "list_models",
  "List all models registered on the Morpheus marketplace, including your active bids and current prices.",
  {},
  async () => {
    const models = await listModels(client);
    return {
      content: [{ type: "text", text: JSON.stringify(models, null, 2) }],
    };
  }
);

// --- add_model ---
server.tool(
  "add_model",
  `Register a model on the Morpheus marketplace and post an opening bid.

apiType options:
  - "openai": Any OpenAI-compatible endpoint (Venice, AkashChat, NEAR AI, Together AI, Hyperbolic LLM, OpenRouter, local Ollama)
  - "claudeai": Anthropic Claude API directly
  - "prodia-v2": Prodia image generation
  - "hyperbolic-sd": Hyperbolic Labs image generation only (use "openai" for Hyperbolic LLM)
  - "prodia-sd" / "prodia-sdxl": Prodia legacy image gen

Ready-to-use OpenAI-compatible backends:
  - Venice AI:      https://api.venice.ai/api/v1       (DIEM credits, free tier)
  - AkashChat:      https://chatapi.akash.network/api/v1 (always free)
  - AkashML:        https://api.akashml.com/v1          ($100 signup credit)
  - NEAR AI Cloud:  https://cloud-api.near.ai/v1        (beta)
  - OpenRouter:     https://openrouter.ai/api/v1        (300+ models, USDC accepted)
  - Together AI:    https://api.together.xyz/v1         ($25 credit)
  - Hyperbolic LLM: https://api.hyperbolic.xyz/v1       (free tier)
  - Local Ollama:   http://localhost:11434/v1           (always free)`,
  {
    name: z.string().describe("Model name as it will appear on the marketplace"),
    ipfsCID: z.string().describe("IPFS CID of the model card (use a placeholder if not available)"),
    stakeWei: z.string().describe("MOR stake amount in wei (e.g. '100000000000000000' for 0.1 MOR)"),
    pricePerSecondWei: z.string().describe("Price per second in MOR wei (e.g. '100000000' for ~0.0000000001 MOR/s)"),
    apiType: z.enum(["openai", "claudeai", "prodia-v2", "hyperbolic-sd", "prodia-sd", "prodia-sdxl"]).describe("Backend API type"),
    apiUrl: z.string().url().describe("Backend base URL"),
    apiKey: z.string().describe("Backend API key"),
    modelName: z.string().optional().describe("Model name on the backend (e.g. 'glm-4-9b')"),
  },
  async (params) => {
    const result = await addModel(client, params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- remove_model ---
server.tool(
  "remove_model",
  "Remove a model and all your bids for it from the Morpheus marketplace. REQUIRES confirm param set to 'DELETE_MODEL_<first8chars_of_modelId>' to prevent accidents.",
  {
    modelId: z.string().describe("Model ID to remove"),
    confirm: z.string().describe("Must be 'DELETE_MODEL_<first8chars>' to confirm. E.g. for model 0xabcdef1234... pass 'DELETE_MODEL_0xabcdef'"),
  },
  async (params) => {
    const result = await removeModel(client, params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- adjust_bid ---
server.tool(
  "adjust_bid",
  "Adjust your bid price for a model. WARNING: There is a brief bid gap (<1s) between deleting the old bid and posting the new one. Plan accordingly for high-traffic models.",
  {
    modelId: z.string().describe("Model ID to adjust bid for"),
    newPricePerSecondWei: z.string().describe("New price per second in MOR wei"),
  },
  async (params) => {
    const result = await adjustBid(client, params);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- claim_earnings ---
server.tool(
  "claim_earnings",
  "Check and optionally claim earnings from completed provider sessions.",
  {
    doClaim: z.boolean().optional().default(true).describe("If true, claim earnings. If false, only report claimable amounts."),
    maxClaims: z.number().int().positive().optional().default(10).describe("Max sessions to claim in one call"),
    minClaimableWei: z.string().optional().default("0").describe("Minimum claimable amount in wei to bother claiming"),
  },
  async (params) => {
    const result = await claimEarnings(client, {
      doClaim: params.doClaim ?? true,
      maxClaims: params.maxClaims ?? 10,
      minClaimableWei: params.minClaimableWei ?? "0",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- check_balances ---
server.tool(
  "check_balances",
  "Check ETH and MOR balances for the node wallet.",
  {},
  async () => {
    const result = await checkBalances(client);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// --- provider_info ---
server.tool(
  "provider_info",
  "Get provider registration details including stake, fee, endpoint, and all active bids.",
  {},
  async () => {
    const result = await providerInfo(client);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Start MCP server
const transport = new StdioServerTransport();
await server.connect(transport);
// All console.error goes to stderr (not the MCP protocol stream)
console.error("[morpheus-node-manager] MCP server started");
