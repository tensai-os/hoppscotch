import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { ApiSpecStorage, StoredFile, StoredFileMeta } from './storage.js';
import { normalizeRelativePath } from './paths.js';

function etagFromContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function walkFiles(dir: string, base: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walkFiles(full, base)));
    } else if (ent.isFile()) {
      out.push(relative(base, full).replaceAll('\\', '/'));
    }
  }
  return out;
}

export class FsApiSpecStorage implements ApiSpecStorage {
  private readonly tenantRoot: string;

  constructor(dataDir: string, tenantHash: string) {
    this.tenantRoot = join(dataDir, tenantHash);
  }

  private absPath(relativePath: string): string {
    const norm = normalizeRelativePath(relativePath);
    return join(this.tenantRoot, norm);
  }

  async getFile(relativePath: string): Promise<StoredFile> {
    const abs = this.absPath(relativePath);
    try {
      const [content, st] = await Promise.all([readFile(abs, 'utf8'), stat(abs)]);
      const contentStr = content;
      return {
        content: contentStr,
        etag: etagFromContent(contentStr),
        lastModified: st.mtime,
      };
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        const ex = new Error(`Not found: ${relativePath}`);
        (ex as Error & { status?: number }).status = 404;
        throw ex;
      }
      throw e;
    }
  }

  async putFile(
    relativePath: string,
    content: string,
    _contentType: string,
    opts?: { ifMatch?: string },
  ): Promise<{ etag: string }> {
    const norm = normalizeRelativePath(relativePath);
    const abs = this.absPath(norm);
    if (opts?.ifMatch) {
      let cur: string;
      try {
        cur = await readFile(abs, 'utf8');
      } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException;
        if (err?.code === 'ENOENT') {
          const ex = new Error(
            `ETag was provided but file does not exist yet. Omit etag to create "${norm}".`,
          );
          (ex as Error & { status?: number }).status = 409;
          throw ex;
        }
        throw e;
      }
      const curEtag = etagFromContent(cur);
      if (curEtag !== opts.ifMatch) {
        const ex = new Error(
          `ETag conflict for "${norm}". Call api_spec_read and retry with the current etag.`,
        );
        (ex as Error & { status?: number }).status = 409;
        throw ex;
      }
    }
    await mkdir(join(abs, '..'), { recursive: true });
    await writeFile(abs, content, 'utf8');
    return { etag: etagFromContent(content) };
  }

  async deleteFile(relativePath: string): Promise<void> {
    const abs = this.absPath(relativePath);
    await rm(abs, { force: true });
  }

  async listFiles(pathPrefix?: string): Promise<StoredFileMeta[]> {
    await mkdir(this.tenantRoot, { recursive: true });
    const rels = await walkFiles(this.tenantRoot, this.tenantRoot);
    const norm = pathPrefix?.trim() ? normalizeRelativePath(pathPrefix) : '';
    const filtered = norm
      ? rels.filter((r) => r === norm || r.startsWith(`${norm}/`))
      : rels;
    const metas: StoredFileMeta[] = [];
    for (const r of filtered) {
      const abs = join(this.tenantRoot, r);
      try {
        const [content, st] = await Promise.all([readFile(abs, 'utf8'), stat(abs)]);
        metas.push({
          relativePath: r,
          etag: etagFromContent(content),
          size: st.size,
          lastModified: st.mtime,
        });
      } catch {
        /* skip race */
      }
    }
    return metas.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }
}
