/**
 * Normalize user-facing paths: no leading slash, no ".." segments.
 */
export function normalizeRelativePath(input: string): string {
  const trimmed = input.trim().replace(/^\/+/u, '');
  const parts = trimmed.split('/').filter((p) => p.length > 0 && p !== '.');
  if (parts.some((p) => p === '..')) {
    throw new Error('relativePath must not contain ".." segments');
  }
  return parts.join('/');
}

export function guessContentType(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'application/yaml';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}
