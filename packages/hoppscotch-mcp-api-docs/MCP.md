# MCP client setup (Cursor)

This server uses **Streamable HTTP** transport (`POST /mcp` with JSON-RPC). Cursor connects with a **URL** and sends the Bearer token as the `Authorization` header.

## Example `~/.cursor/mcp.json`

Use an `env` file or your OS secret store for the key; do not paste production secrets into tracked config.

```json
{
  "mcpServers": {
    "hoppscotch-api-docs": {
      "url": "https://mcp-api-docs.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MCP_API_DOCS_BEARER}"
      }
    }
  }
}
```

Set `MCP_API_DOCS_BEARER` in your environment to one of the values from `MCP_CLIENT_KEYS` on the server.

## Health check

```bash
curl -sS https://mcp-api-docs.example.com/health
```

Expect JSON with `status: "ok"`, `service`, `version`, `storage` (`filesystem` or `s3`), and `hoppscotchPublish`.

## TLS and Host header

- Terminate TLS at your reverse proxy (Caddy, nginx, Traefik) and forward to the container port (default `8790`).
- If you set `MCP_ALLOWED_HOSTS`, include the hostname clients use (e.g. `mcp-api-docs.example.com`).

## Hoppscotch publish tool (optional)

When the server process has both `HOPPSCOTCH_GRAPHQL_URL` and `HOPPSCOTCH_ACCESS_TOKEN`, the tool `api_spec_publish_to_hoppscotch` is registered. The token must be able to call `importUserCollectionsFromJSON` in your self-host GraphQL API. Imports typically **create** new collections; idempotency is not guaranteed—see Hoppscotch docs for your version.
