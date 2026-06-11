import { createHash } from 'node:crypto';

/** Short stable id from bearer token — isolates stored specs per MCP key. */
export function tenantBranchFromToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 16);
}
