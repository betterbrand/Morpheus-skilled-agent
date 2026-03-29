# Security

## Endpoint allowlist

The HTTP client enforces a strict allowlist. Any endpoint not on the list throws before making a network request. The following endpoints are additionally blocked regardless of allowlist position:

| Blocked path | Reason |
|---|---|
| `POST /blockchain/send/eth` | Irreversible ETH transfer |
| `POST /blockchain/send/mor` | Irreversible MOR transfer |
| `DELETE /wallet` | Removes the wallet entirely |
| `POST /wallet/mnemonic` | Replaces the wallet seed phrase |
| `POST /wallet/privateKey` | Replaces the wallet private key |
| `GET /docker/*` | Remote code execution risk |
| `GET /ipfs/download/*` | Path traversal risk |

## Confirmation tokens

`remove_model` requires a `confirm` token of the form `DELETE_MODEL_<first8chars_of_modelId>`. This is enforced in code before any API call is made. The wrong token throws `Confirmation mismatch`.

## HTTPS enforcement

`http://` is refused for non-localhost URLs. Use `--insecure` or `MORPHEUS_INSECURE=true` only when connecting over an SSH tunnel, VPN, or private network you control.

Private network IPs (10.x, 172.16-31.x, 192.168.x, 100.x for Tailscale) and `host.docker.internal` are treated as local and allowed over `http://`.

## Config file permissions

`~/.morpheus-node-manager.json` is written with mode `0600`. The config loader warns if the file is group- or world-readable.

## Bid adjustment gap

Adjusting a bid deletes the old bid before posting the new one. There is a brief (<1s) gap where no bid is active. For high-traffic models, plan bid adjustments during low-traffic windows.
