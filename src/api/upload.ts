/**
 * S3 media upload helpers.
 * Flow: presign (get signed PUT URL) → PUT blob to S3 → confirm (save URL to DB)
 */

import api from './client';

export interface PresignResult {
  uploadUrl: string;
  publicUrl: string;
  key: string;
}

/** Request a presigned S3 upload URL from the server. */
export async function presignMedia(
  contentType: string,
  folder: 'memories' | 'avatars'
): Promise<PresignResult> {
  const { data } = await api.post('/media/presign', { contentType, folder });
  return data.data as PresignResult;
}

/**
 * PUT a local file URI directly to S3 using a presigned URL.
 * Uses XMLHttpRequest which reliably handles file:// URIs in React Native.
 */
export async function uploadToS3(
  localUri: string,
  uploadUrl: string,
  contentType: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status} — ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during S3 upload'));
    // React Native supports passing a file URI object directly as XHR body
    xhr.send({ uri: localUri, type: contentType, name: 'upload' } as any);
  });
}

/** Tell the server the upload is complete and save the URL to the DB. */
export async function confirmMedia(
  publicUrl: string,
  type: 'avatar' | 'memory',
  referenceId?: string
): Promise<void> {
  await api.post('/media/confirm', { publicUrl, type, referenceId });
}

/**
 * Full upload pipeline: presign → PUT to S3 → confirm.
 * Returns the final public S3 URL.
 */
export async function uploadMedia(
  localUri: string,
  contentType: string,
  folder: 'memories' | 'avatars',
  type: 'avatar' | 'memory',
  referenceId?: string
): Promise<string> {
  const presign = await presignMedia(contentType, folder);
  await uploadToS3(localUri, presign.uploadUrl, contentType);
  await confirmMedia(presign.publicUrl, type, referenceId);
  return presign.publicUrl;
}
