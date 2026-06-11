# hoppscotch-mcp-api-docs

Streamable HTTP [Model Context Protocol](https://modelcontextprotocol.io/) server for storing and editing team API specifications (OpenAPI JSON/YAML or Hoppscotch-style JSON collections). Storage is per Bearer token (hashed tenant prefix), on **filesystem** or **S3-compatible** object storage.

Designed for self-hosted Hoppscotch deployments: run this service beside your stack (see root `docker-compose.yml` profile `mcp-api-docs`) and point Cursor (or any MCP client) at it with HTTPS and a Bearer key.

## Features

- **Tools:** `api_spec_list`, `api_spec_read`, `api_spec_write`, `api_spec_delete`, `api_spec_validate` (OpenAPI via `@apidevtools/swagger-parser`).
- **Optional:** `api_spec_publish_to_hoppscotch` when `HOPPSCOTCH_GRAPHQL_URL` and `HOPPSCOTCH_ACCESS_TOKEN` are set (imports JSON into Hoppscotch via `importUserCollectionsFromJSON`).
- **Auth:** `Authorization: Bearer <key>` must match one of `MCP_CLIENT_KEYS` (comma-separated).
- **Health:** `GET /health` (no auth).

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `MCP_CLIENT_KEYS` | Yes | Comma-separated Bearer secrets accepted by the server. |
| `DATA_DIR` **or** `S3_BUCKET` | Yes | If both are set, **`DATA_DIR` takes precedence** (filesystem backend). |
| `PORT` | No | Default `8790`. |
| `HOST` | No | Bind address (default `0.0.0.0` in code — check `src/index.ts`). |
| `MCP_ALLOWED_HOSTS` | No | Comma-separated allowed `Host` header values (empty = allow any). |
| `S3_REGION` | For S3 | AWS region. |
| `S3_ENDPOINT` | No | Custom endpoint (MinIO, etc.). |
| `S3_FORCE_PATH_STYLE` | No | `true` for many MinIO setups. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | For S3 | Standard AWS SDK credentials. |
| `HOPPSCOTCH_GRAPHQL_URL` | Optional | e.g. `https://your-hoppscotch/graphql` |
| `HOPPSCOTCH_ACCESS_TOKEN` | Optional | User/session JWT for GraphQL (both URL and token required to register publish tool). |

Do **not** commit real keys; use environment files or a secret manager.

## Local development

From monorepo root:

```bash
pnpm install
export MCP_CLIENT_KEYS="dev-local-key"
export DATA_DIR="$PWD/.mcp-api-docs-data"
mkdir -p "$DATA_DIR"
pnpm --filter hoppscotch-mcp-api-docs run build
pnpm --filter hoppscotch-mcp-api-docs start
```

## Docker

From monorepo root:

```bash
docker build -f packages/hoppscotch-mcp-api-docs/Dockerfile -t hoppscotch-mcp-api-docs .
docker run --rm -e MCP_CLIENT_KEYS=your-secret -e DATA_DIR=/data -v mcp-data:/data -p 8790:8790 hoppscotch-mcp-api-docs
```

### Docker Compose

From monorepo root, profile **`mcp-api-docs`** exposes port **8790**, sets `DATA_DIR=/data`, and mounts a named volume. Add **`MCP_CLIENT_KEYS`** (and optional `MCP_ALLOWED_HOSTS`, Hoppscotch publish vars) to `.env`.

```bash
docker compose --profile mcp-api-docs up -d
```

For **S3-only** storage, avoid setting `DATA_DIR` in that service (when both `DATA_DIR` and `S3_BUCKET` are set, filesystem wins). Use `docker-compose.override.yml` or a forked service definition to remove the `DATA_DIR` environment variable and the `/data` volume, and set `S3_BUCKET`, `AWS_REGION`, and AWS credentials instead.

## Documentation

- [MCP.md](./MCP.md) — Cursor `mcp.json` example and transport notes.
