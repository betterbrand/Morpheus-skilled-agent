# Configuration

## Priority order

CLI flags > environment variables > `~/.morpheus-node-manager.json` > `.cookie` file > defaults.

## Environment variables

| Environment variable | CLI flag | Description | Default |
|---|---|---|---|
| `MORPHEUS_API_URL` | `--url` | Proxy-router REST API URL | `http://localhost:8082` |
| `MORPHEUS_API_USER` | `--user` | Basic auth username | `admin` |
| `MORPHEUS_API_PASSWORD` | `--password` | Basic auth password | _(empty)_ |
| `MORPHEUS_COOKIE_PATH` | `--cookie` | Path to proxy-router `.cookie` file | _(none)_ |
| `MORPHEUS_INSECURE` | `--insecure` | Allow `http://` for non-localhost | `false` |

## Cookie file

The `.cookie` file is the password file written by the proxy-router at startup. If the file contains `user:password`, only the password portion is used.

## Persistent config file

To persist configuration so you don't have to pass flags every time:

```bash
cat > ~/.morpheus-node-manager.json << EOF
{
  "apiUrl": "http://localhost:8082",
  "apiUser": "admin",
  "apiPassword": "your-password"
}
EOF
chmod 600 ~/.morpheus-node-manager.json
```
