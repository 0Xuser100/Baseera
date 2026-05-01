export async function uploadToR2(
  bucket: R2Bucket,
  key: string,
  body: ArrayBuffer,
  contentType = "application/octet-stream"
): Promise<void> {
  await bucket.put(key, body, { httpMetadata: { contentType } });
}

export async function downloadFromR2(
  bucket: R2Bucket,
  key: string
): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}
