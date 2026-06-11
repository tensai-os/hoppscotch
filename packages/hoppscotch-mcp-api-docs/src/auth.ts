import type { Request, RequestHandler } from 'express';

export function loadClientKeys(): Set<string> {
  const raw = process.env.MCP_CLIENT_KEYS ?? '';
  const keys = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (keys.length === 0) {
    throw new Error('MCP_CLIENT_KEYS is required (comma-separated bearer tokens)');
  }
  return new Set(keys);
}

function getHeader(req: Request, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

export function createBearerAuthMiddleware(keys: Set<string>): RequestHandler {
  return (req, res, next) => {
    const auth = getHeader(req, 'authorization');
    if (!auth?.toLowerCase().startsWith('bearer ')) {
      res.status(401).json({ error: 'Missing Authorization: Bearer <token>' });
      return;
    }
    const token = auth.slice(7).trim();
    if (!token || !keys.has(token)) {
      res.status(403).json({ error: 'Invalid bearer token' });
      return;
    }
    next();
  };
}
