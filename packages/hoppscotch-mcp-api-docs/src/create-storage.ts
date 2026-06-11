import type { ApiSpecStorage } from './storage.js';
import { FsApiSpecStorage } from './fs-api-spec-storage.js';
import { S3ApiSpecStorage } from './s3-api-spec-storage.js';
import { tenantBranchFromToken } from './tenant.js';

export function createApiSpecStorageForToken(token: string): ApiSpecStorage {
  const tenantHash = tenantBranchFromToken(token);
  const dataDir = process.env.DATA_DIR?.trim();
  if (dataDir) {
    return new FsApiSpecStorage(dataDir, tenantHash);
  }

  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error('Configure either DATA_DIR (filesystem) or S3_BUCKET (object storage).');
  }

  const region = process.env.S3_REGION?.trim() ?? 'us-east-1';
  return new S3ApiSpecStorage(bucket, region, tenantHash, {
    endpoint: process.env.S3_ENDPOINT?.trim(),
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID?.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  });
}
