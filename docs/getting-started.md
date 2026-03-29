# Getting Started

## Installation

```bash
npm install -g morpheus-node-manager
```

Requires Node.js >= 22.

## Quick start

```bash
# Check node health (process alive + blockchain connected)
morpheus-node-manager status --url http://localhost:8082 --password admin

# List marketplace models with your active bids highlighted
morpheus-node-manager models

# Check ETH and MOR wallet balances
morpheus-node-manager balances

# Register a new model with an opening bid
morpheus-node-manager add-model \
  --name "glm-4-9b" \
  --ipfs-cid QmYourModelCard \
  --stake-wei 100000000000000000 \
  --price-wei 100000000 \
  --api-type openai \
  --api-url https://api.venice.ai/api/v1 \
  --api-key YOUR_VENICE_KEY \
  --model-name glm-4-9b
```

## Build from source

```bash
git clone https://github.com/betterbrand/Morpheus-skilled-agent.git
cd Morpheus-skilled-agent
npm install
npm run build
npm test
```

The test suite runs 21 tests against an in-process mock HTTP server -- no running proxy-router required. Tests cover the client allowlist, health check logic, balance formatting (BigInt-safe), bid active/inactive detection, model listing, `remove_model` confirmation guard, and config HTTPS enforcement.

```
npm test

  client allowlist
    - blocks POST /blockchain/send/eth
    - blocks DELETE /wallet
    - blocks POST /wallet/privateKey
    - blocks GET /docker/anything
    - blocks GET /ipfs/download/file

  node_status
    - returns healthy when both healthcheck and latestBlock succeed
    - includes formatted balances
    - reports activeBids from wrapped response

  checkBalances
    - returns formatted ETH and MOR (lowercase API keys)

  weiToFormatted
    - formats 1 ETH correctly
    - formats 0.05 ETH correctly
    - handles BigInt safely (no precision loss at large values)

  bidIsActive
    - treats DeletedAt='0' as active
    - treats DeletedAt=null as active
    - treats non-zero DeletedAt as inactive

  listModels
    - returns models with bid info from wrapped response

  removeModel confirmation guard
    - rejects wrong confirm token
    - accepts correct DELETE_MODEL_<first8> token

  config
    - rejects http:// for remote URLs
    - allows http:// for localhost
    - allows http:// for remote with --insecure
    - strips trailing slash from URL

  tests 21
  pass 21
```
