#!/usr/bin/env node
// CLI entry point for morpheus-node-manager
// Usage: morpheus-node-manager <command> [options]
// Env: MORPHEUS_API_URL, MORPHEUS_API_USER, MORPHEUS_API_PASSWORD, MORPHEUS_COOKIE_PATH

import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { MorpheusClient } from "./core/client.js";
import { nodeStatus } from "./core/health.js";
import { listModels, addModel, removeModel } from "./core/models.js";
import { adjustBid } from "./core/bids.js";
import { claimEarnings } from "./core/earnings.js";
import { checkBalances, providerInfo } from "./core/provider.js";

const COMMANDS = ["status", "models", "add-model", "remove-model", "adjust-bid", "claim", "balances", "provider"] as const;
type Command = typeof COMMANDS[number];

function usage(): void {
  console.log(`Usage: morpheus-node-manager <command> [options]

Commands:
  status          Check node health and status
  models          List marketplace models and your bids
  add-model       Register a new model on the marketplace
  remove-model    Remove a model (requires --model-id and --confirm)
  adjust-bid      Adjust your bid price for a model
  claim           Claim earnings from provider sessions
  balances        Check ETH and MOR balances
  provider        Show provider registration info

Global options:
  --url <url>       Proxy-router API URL (default: http://localhost:8082)
  --user <user>     API basic auth user (default: admin)
  --password <pwd>  API basic auth password
  --cookie <path>   Path to proxy-router .cookie file

Add-model options:
  --name <name>             Model name on marketplace
  --ipfs-cid <cid>          IPFS CID of model card
  --stake-wei <wei>         MOR stake in wei
  --price-wei <wei>         Price per second in MOR wei
  --api-type <type>         openai|claudeai|prodia-v2|hyperbolic-sd|prodia-sd|prodia-sdxl
  --api-url <url>           Backend base URL
  --api-key <key>           Backend API key
  --model-name <name>       Model name on backend

Remove-model options:
  --model-id <id>           Model ID to remove
  --confirm <token>         Must be DELETE_MODEL_<first8chars>

Adjust-bid options:
  --model-id <id>           Model ID to adjust
  --price-wei <wei>         New price per second in MOR wei

Claim options:
  --dry-run                 Only report, do not claim
  --max-claims <n>          Max sessions to claim (default: 10)
  --min-claimable <wei>     Minimum wei to bother claiming (default: 0)

Environment:
  MORPHEUS_API_URL          API URL
  MORPHEUS_API_USER         API user
  MORPHEUS_API_PASSWORD     API password
  MORPHEUS_COOKIE_PATH      Path to .cookie file
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] as Command | undefined;

  if (!command || args.includes("--help") || args.includes("-h")) {
    usage();
    process.exit(0);
  }

  if (!COMMANDS.includes(command as Command)) {
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  }

  // Parse remaining args after the command
  const { values: rawValues } = parseArgs({
    args: args.slice(1),
    options: {
      url: { type: "string" },
      user: { type: "string" },
      password: { type: "string" },
      cookie: { type: "string" },
      insecure: { type: "boolean" },
      name: { type: "string" },
      "ipfs-cid": { type: "string" },
      "stake-wei": { type: "string" },
      "price-wei": { type: "string" },
      "api-type": { type: "string" },
      "api-url": { type: "string" },
      "api-key": { type: "string" },
      "model-name": { type: "string" },
      "model-id": { type: "string" },
      confirm: { type: "string" },
      "dry-run": { type: "boolean" },
      "max-claims": { type: "string" },
      "min-claimable": { type: "string" },
    },
    allowPositionals: true,
    strict: false,
  });

  // Narrow to string-only values for options we use as strings
  const str = (v: string | boolean | undefined): string | undefined =>
    typeof v === "string" ? v : undefined;
  const values = {
    url: str(rawValues.url),
    user: str(rawValues.user),
    password: str(rawValues.password),
    cookie: str(rawValues.cookie),
    name: str(rawValues.name),
    "ipfs-cid": str(rawValues["ipfs-cid"]),
    "stake-wei": str(rawValues["stake-wei"]),
    "price-wei": str(rawValues["price-wei"]),
    "api-type": str(rawValues["api-type"]),
    "api-url": str(rawValues["api-url"]),
    "api-key": str(rawValues["api-key"]),
    "model-name": str(rawValues["model-name"]),
    "model-id": str(rawValues["model-id"]),
    confirm: str(rawValues.confirm),
    insecure: rawValues.insecure === true,
    "dry-run": rawValues["dry-run"] === true,
    "max-claims": str(rawValues["max-claims"]),
    "min-claimable": str(rawValues["min-claimable"]),
  };

  if (values.password) {
    console.warn(
      "[cli] Warning: --password exposes credentials in the process table. " +
        "Prefer MORPHEUS_API_PASSWORD env var or --cookie for the .cookie file path."
    );
  }

  const config = loadConfig({
    url: values.url,
    user: values.user,
    password: values.password,
    cookiePath: values.cookie,
    insecure: values.insecure,
  });

  const client = new MorpheusClient(config);

  try {
    switch (command) {
      case "status": {
        const result = await nodeStatus(client);
        console.log(JSON.stringify(result, null, 2));
        if (!result.healthy) process.exit(1);
        break;
      }

      case "models": {
        const result = await listModels(client);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "add-model": {
        const missing = [];
        if (!values.name) missing.push("--name");
        if (!values["ipfs-cid"]) missing.push("--ipfs-cid");
        if (!values["stake-wei"]) missing.push("--stake-wei");
        if (!values["price-wei"]) missing.push("--price-wei");
        if (!values["api-type"]) missing.push("--api-type");
        if (!values["api-url"]) missing.push("--api-url");
        if (!values["api-key"]) missing.push("--api-key");
        if (missing.length > 0) {
          console.error(`Missing required options: ${missing.join(", ")}`);
          process.exit(1);
        }
        const result = await addModel(client, {
          name: values.name!,
          ipfsCID: values["ipfs-cid"]!,
          stakeWei: values["stake-wei"]!,
          pricePerSecondWei: values["price-wei"]!,
          apiType: values["api-type"]!,
          apiUrl: values["api-url"]!,
          apiKey: values["api-key"]!,
          modelName: values["model-name"],
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "remove-model": {
        if (!values["model-id"] || !values.confirm) {
          console.error("Required: --model-id <id> --confirm DELETE_MODEL_<first8chars>");
          process.exit(1);
        }
        const result = await removeModel(client, {
          modelId: values["model-id"]!,
          confirm: values.confirm!,
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "adjust-bid": {
        if (!values["model-id"] || !values["price-wei"]) {
          console.error("Required: --model-id <id> --price-wei <wei>");
          process.exit(1);
        }
        const result = await adjustBid(client, {
          modelId: values["model-id"]!,
          newPricePerSecondWei: values["price-wei"]!,
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "claim": {
        const maxClaims = values["max-claims"] ? parseInt(values["max-claims"], 10) : 10;
        if (Number.isNaN(maxClaims) || maxClaims <= 0) {
          console.error("--max-claims must be a positive integer");
          process.exit(1);
        }
        const minClaimable = values["min-claimable"] ?? "0";
        if (!/^\d+$/.test(minClaimable)) {
          console.error("--min-claimable must be a non-negative integer (wei)");
          process.exit(1);
        }
        const result = await claimEarnings(client, {
          doClaim: !values["dry-run"],
          maxClaims,
          minClaimableWei: minClaimable,
        });
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "balances": {
        const result = await checkBalances(client);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "provider": {
        const result = await providerInfo(client);
        console.log(JSON.stringify(result, null, 2));
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${msg}`);
    process.exit(1);
  }
}

main();
