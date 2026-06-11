export type StoredFile = {
  content: string;
  etag: string;
  lastModified: Date;
};

export type StoredFileMeta = {
  /** Path relative to tenant root (e.g. specs/v1/openapi.yaml) */
  relativePath: string;
  etag: string;
  size: number;
  lastModified: Date;
};

/**
 * CRUD for API spec files scoped to one tenant (derived from bearer token).
 */
export interface ApiSpecStorage {
  getFile(relativePath: string): Promise<StoredFile>;
  putFile(
    relativePath: string,
    content: string,
    contentType: string,
    opts?: { ifMatch?: string },
  ): Promise<{ etag: string }>;
  deleteFile(relativePath: string): Promise<void>;
  /** List files under optional path prefix (relative paths). */
  listFiles(pathPrefix?: string): Promise<StoredFileMeta[]>;
}
