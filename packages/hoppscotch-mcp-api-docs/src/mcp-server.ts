import { McpServer } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import SwaggerParser from '@apidevtools/swagger-parser';
import * as z from 'zod';
import type { ApiSpecStorage } from './storage.js';
import { guessContentType, normalizeRelativePath } from './paths.js';
import { importCollectionsToHoppscotch, type HoppscotchPublishConfig } from './hoppscotch-graphql.js';

const VERSION = '1.0.0';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function createApiSpecMcpServer(
  storage: ApiSpecStorage,
  opts: {
    hoppscotch?: HoppscotchPublishConfig;
  } = {},
): McpServer {
  const server = new McpServer({ name: 'hoppscotch-mcp-api-docs', version: VERSION });

  server.registerTool(
    'api_spec_list',
    {
      description:
        'List stored API specification files for this MCP bearer key (OpenAPI YAML/JSON or Hoppscotch export JSON). Optional pathPrefix filters by folder.',
      inputSchema: z.object({
        pathPrefix: z
          .string()
          .optional()
          .describe('Only return files under this relative path prefix, e.g. "public/v1".'),
      }),
    },
    async ({ pathPrefix }): Promise<CallToolResult> => {
      try {
        const files = await storage.listFiles(pathPrefix);
        return ok({ files, total: files.length, service: 'hoppscotch-mcp-api-docs', version: VERSION });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'api_spec_read',
    {
      description:
        'Read one API spec file by relative path. Returns content and etag for optimistic updates (api_spec_write).',
      inputSchema: z.object({
        relativePath: z
          .string()
          .describe('Path under the tenant store, e.g. "openapi.yaml" or "team/payments.json".'),
      }),
    },
    async ({ relativePath }): Promise<CallToolResult> => {
      try {
        const norm = normalizeRelativePath(relativePath);
        const file = await storage.getFile(norm);
        return ok({ relativePath: norm, etag: file.etag, content: file.content });
      } catch (e) {
        const status = (e as Error & { status?: number }).status;
        if (status === 404) return err(`Not found: ${relativePath}`);
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'api_spec_write',
    {
      description:
        'Create or overwrite an API spec file. Pass etag from api_spec_read to avoid overwriting concurrent edits.',
      inputSchema: z.object({
        relativePath: z.string().describe('Relative path for the file.'),
        content: z.string().describe('Full file body (OpenAPI YAML/JSON or Hoppscotch collection JSON).'),
        etag: z
          .string()
          .optional()
          .describe('Omit for create / blind overwrite. Provide previous etag for safe update.'),
      }),
    },
    async ({ relativePath, content, etag }): Promise<CallToolResult> => {
      try {
        const norm = normalizeRelativePath(relativePath);
        const ct = guessContentType(norm);
        const result = await storage.putFile(norm, content, ct, etag ? { ifMatch: etag } : {});
        return ok({ relativePath: norm, etag: result.etag });
      } catch (e) {
        const status = (e as Error & { status?: number }).status;
        if (status === 409) {
          return err(
            `${e instanceof Error ? e.message : String(e)}\nHint: call api_spec_read, then retry with the latest etag.`,
          );
        }
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'api_spec_delete',
    {
      description: 'Delete a stored API spec file by relative path.',
      inputSchema: z.object({
        relativePath: z.string().describe('Relative path to delete.'),
      }),
    },
    async ({ relativePath }): Promise<CallToolResult> => {
      try {
        const norm = normalizeRelativePath(relativePath);
        await storage.deleteFile(norm);
        return ok({ deleted: true, relativePath: norm });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'api_spec_validate',
    {
      description:
        'Parse and validate OpenAPI 2/3 JSON or YAML in memory (does not persist). Fails on invalid specs.',
      inputSchema: z.object({
        content: z.string().describe('OpenAPI document as string (JSON or YAML).'),
      }),
    },
    async ({ content }): Promise<CallToolResult> => {
      try {
        await SwaggerParser.validate(content, { validate: { spec: true } });
        return ok({ valid: true, message: 'OpenAPI document is valid.' });
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  if (opts.hoppscotch) {
    const hc = opts.hoppscotch;
    server.registerTool(
      'api_spec_publish_to_hoppscotch',
      {
        description:
          'Import a stored Hoppscotch collection JSON into the configured Hoppscotch workspace via GraphQL importUserCollectionsFromJSON. Creates new collections (not an idempotent upsert). Requires HOPPSCOTCH_GRAPHQL_URL and HOPPSCOTCH_ACCESS_TOKEN on the server.',
        inputSchema: z.object({
          relativePath: z
            .string()
            .describe('Relative path of the JSON file in this MCP store (Hoppscotch export format).'),
          reqType: z
            .enum(['REST', 'GQL'])
            .describe('Target request tree: REST or GQL collections.'),
          parentCollectionID: z
            .string()
            .optional()
            .describe('Optional parent folder/collection ID in Hoppscotch.'),
        }),
      },
      async ({ relativePath, reqType, parentCollectionID }): Promise<CallToolResult> => {
        try {
          const norm = normalizeRelativePath(relativePath);
          const file = await storage.getFile(norm);
          const result = await importCollectionsToHoppscotch(hc, {
            jsonString: file.content,
            reqType,
            parentCollectionID: parentCollectionID ?? null,
          });
          return ok({ published: true, hoppscotchResult: result });
        } catch (e) {
          const status = (e as Error & { status?: number }).status;
          if (status === 404) return err(`Not found in MCP store: ${relativePath}`);
          return err(e instanceof Error ? e.message : String(e));
        }
      },
    );
  }

  return server;
}
