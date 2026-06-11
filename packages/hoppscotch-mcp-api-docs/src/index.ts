import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import type { Request, Response } from 'express';
import express from 'express';
import { createBearerAuthMiddleware, loadClientKeys } from './auth.js';
import { createApiSpecMcpServer } from './mcp-server.js';
import { createApiSpecStorageForToken } from './create-storage.js';
import type { HoppscotchPublishConfig } from './hoppscotch-graphql.js';

const SERVICE_VERSION = '1.0.0';

function readConfig() {
  const port = parseInt(process.env.PORT ?? '8790', 10);
  if (!Number.isFinite(port) || port <= 0) throw new Error('PORT must be a positive integer');
  const bindHost = process.env.HOST ?? '0.0.0.0';

  const hasFs = Boolean(process.env.DATA_DIR?.trim());
  const hasS3 = Boolean(process.env.S3_BUCKET?.trim());
  if (!hasFs && !hasS3) {
    throw new Error('Set DATA_DIR (filesystem) and/or S3_BUCKET for object storage.');
  }

  const gql = process.env.HOPPSCOTCH_GRAPHQL_URL?.trim();
  const token = process.env.HOPPSCOTCH_ACCESS_TOKEN?.trim();
  let hoppscotch: HoppscotchPublishConfig | undefined;
  if (gql && token) {
    hoppscotch = { graphqlUrl: gql, accessToken: token };
  } else if (gql || token) {
    throw new Error('HOPPSCOTCH_GRAPHQL_URL and HOPPSCOTCH_ACCESS_TOKEN must both be set to enable publish tool.');
  }

  return { port, bindHost, hoppscotch };
}

function parseAllowedHosts(): string[] | undefined {
  const raw = process.env.MCP_ALLOWED_HOSTS?.trim();
  if (!raw) return undefined;
  const hosts = raw.split(',').map((h) => h.trim()).filter(Boolean);
  return hosts.length ? hosts : undefined;
}

function jsonRpcError(status: number, code: number, message: string, res: Response) {
  if (!res.headersSent) {
    res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
  }
}

const { port, bindHost, hoppscotch } = readConfig();
const clientKeys = loadClientKeys();
const allowedHosts = parseAllowedHosts();

const app = createMcpExpressApp({ host: bindHost, allowedHosts, jsonLimit: '10mb' });

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hoppscotch-mcp-api-docs',
    version: SERVICE_VERSION,
    storage: process.env.DATA_DIR?.trim() ? 'filesystem' : 's3',
    hoppscotchPublish: Boolean(hoppscotch),
  });
});

const mcpRouter = express.Router();
mcpRouter.use(createBearerAuthMiddleware(clientKeys));

mcpRouter.post('/', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'] ?? '';
  const actorKey = Array.isArray(authHeader) ? authHeader[0]! : authHeader;
  const bearer = actorKey.startsWith('Bearer ') ? actorKey.slice(7).trim() : actorKey;

  const storage = createApiSpecStorageForToken(bearer);
  const server = createApiSpecMcpServer(storage, { hoppscotch });

  try {
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    console.error('[hoppscotch-mcp-api-docs] MCP request error:', error);
    jsonRpcError(500, -32_603, 'Internal server error', res);
  }
});

mcpRouter.get('/', (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32_000, message: 'Use POST for MCP' },
    id: null,
  });
});

mcpRouter.delete('/', (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32_000, message: 'Use POST for MCP' },
    id: null,
  });
});

app.use('/mcp', mcpRouter);

app.listen(port, bindHost, () => {
  console.log(`hoppscotch-mcp-api-docs v${SERVICE_VERSION} on http://${bindHost}:${port}`);
  if (bindHost === '0.0.0.0' && !allowedHosts?.length) {
    console.warn('Binding 0.0.0.0 without MCP_ALLOWED_HOSTS — set in production behind a reverse proxy.');
  }
});
