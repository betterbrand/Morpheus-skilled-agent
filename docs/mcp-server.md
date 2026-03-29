# MCP Server

The MCP server exposes all 8 tools over stdio, compatible with any MCP client.

## Claude Code

Add to `~/.claude/claude_desktop_config.json` or `.mcp.json`:

```json
{
  "mcpServers": {
    "morpheus": {
      "command": "node",
      "args": ["/path/to/morpheus-node-manager/dist/mcp-server.js"],
      "env": {
        "MORPHEUS_API_URL": "http://localhost:8082",
        "MORPHEUS_API_PASSWORD": "your-password"
      }
    }
  }
}
```

## Cline

Add to `.clinerules` or MCP settings:

```json
{
  "mcpServers": {
    "morpheus": {
      "command": "morpheus-node-manager-mcp",
      "env": {
        "MORPHEUS_API_URL": "http://localhost:8082",
        "MORPHEUS_API_PASSWORD": "your-password"
      }
    }
  }
}
```

If installed globally via npm, the binary `morpheus-node-manager-mcp` is available directly. Otherwise point to `dist/mcp-server.js` with `node`.

The MCP server reads configuration from environment variables. All `MORPHEUS_*` env vars apply -- see [Configuration](configuration.md).
