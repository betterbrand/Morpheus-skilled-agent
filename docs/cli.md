# CLI Reference

```
morpheus-node-manager <command> [options]

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
  --insecure        Allow http:// for non-localhost URLs (trusted networks only)
```

All commands return JSON to stdout. The `status` command exits with code 1 if the node is unhealthy, making it suitable for use in shell scripts and health checks.

## Examples

```bash
# Claim up to 5 sessions, minimum 0.001 MOR each
morpheus-node-manager claim --max-claims 5 --min-claimable 1000000000000000

# Dry-run: see what's claimable without submitting transactions
morpheus-node-manager claim --dry-run

# Adjust bid price
morpheus-node-manager adjust-bid --model-id 0xabcdef1234... --price-wei 200000000

# Remove a model (first 8 chars of model ID required in confirm token)
morpheus-node-manager remove-model \
  --model-id 0xabcdef1234567890 \
  --confirm DELETE_MODEL_0xabcdef

# Read password from proxy-router .cookie file automatically
morpheus-node-manager status --cookie /path/to/proxy-router/.cookie
```
