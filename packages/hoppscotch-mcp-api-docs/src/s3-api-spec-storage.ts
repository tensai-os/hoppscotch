import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { ApiSpecStorage, StoredFile, StoredFileMeta } from './storage.js';
import { normalizeRelativePath } from './paths.js';

export class S3ApiSpecStorage implements ApiSpecStorage {
  private readonly client: S3Client;
  private readonly keyPrefix: string;

  constructor(
    private readonly bucket: string,
    region: string,
    tenantHash: string,
    opts?: {
      endpoint?: string;
      forcePathStyle?: boolean;
      accessKeyId?: string;
      secretAccessKey?: string;
    },
  ) {
    this.keyPrefix = `api-specs/${tenantHash}/`;
    this.client = new S3Client({
      region,
      endpoint: opts?.endpoint,
      forcePathStyle: opts?.forcePathStyle,
      ...(opts?.accessKeyId && opts.secretAccessKey
        ? { credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } }
        : {}),
    });
  }

  private toKey(relativePath: string): string {
    return this.keyPrefix + normalizeRelativePath(relativePath);
  }

  async getFile(relativePath: string): Promise<StoredFile> {
    const key = this.toKey(relativePath);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const content = await res.Body!.transformToString('utf-8');
      return {
        content,
        etag: (res.ETag ?? '').replace(/"/g, ''),
        lastModified: res.LastModified ?? new Date(),
      };
    } catch (err) {
      if (err instanceof NoSuchKey) {
        const e = new Error(`Not found: ${relativePath}`);
        (e as Error & { status?: number }).status = 404;
        throw e;
      }
      throw err;
    }
  }

  async putFile(
    relativePath: string,
    content: string,
    contentType: string,
    opts?: { ifMatch?: string },
  ): Promise<{ etag: string }> {
    const key = this.toKey(relativePath);
    try {
      const res = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: content,
          ContentType: contentType,
          ...(opts?.ifMatch
            ? {
                IfMatch: opts.ifMatch.startsWith('"') ? opts.ifMatch : `"${opts.ifMatch}"`,
              }
            : {}),
        }),
      );
      return { etag: (res.ETag ?? '').replace(/"/g, '') };
    } catch (err) {
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 412) {
        const e = new Error(
          `ETag conflict for "${relativePath}". Call api_spec_read and retry with the current etag.`,
        );
        (e as Error & { status?: number }).status = 409;
        throw e;
      }
      throw err;
    }
  }

  async deleteFile(relativePath: string): Promise<void> {
    const key = this.toKey(relativePath);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async listFiles(pathPrefix?: string): Promise<StoredFileMeta[]> {
    const norm = pathPrefix?.trim() ? normalizeRelativePath(pathPrefix) : '';
    const prefix = norm ? `${this.keyPrefix}${norm}` : this.keyPrefix;
    const results: StoredFileMeta[] = [];
    let token: string | undefined;

    do {
      const res = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const obj of res.Contents ?? []) {
        if (!obj.Key || obj.Key.endsWith('/')) continue;
        if (!obj.Key.startsWith(this.keyPrefix)) continue;
        const relativePath = obj.Key.slice(this.keyPrefix.length);
        if (!relativePath) continue;
        if (norm && relativePath !== norm && !relativePath.startsWith(`${norm}/`)) continue;
        results.push({
          relativePath,
          etag: (obj.ETag ?? '').replace(/"/g, ''),
          size: obj.Size ?? 0,
          lastModified: obj.LastModified ?? new Date(),
        });
      }
      token = res.NextContinuationToken;
    } while (token);

    return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }
}
