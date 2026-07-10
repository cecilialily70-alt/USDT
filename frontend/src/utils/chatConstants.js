// Vercel serverless body limit ~4.5MB — keep client limit aligned
export const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;

export const SUPPORTED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

export const UNSUPPORTED_IMAGE_CODE = 'IMAGE_TYPE_NOT_SUPPORTED';

const IMAGE_EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

export function resolveImageMime(file) {
  const type = (file?.type || '').split(';')[0].trim().toLowerCase();
  if (type && SUPPORTED_IMAGE_MIME.has(type)) return type;
  const ext = (file?.name?.split('.').pop() || '').toLowerCase();
  return IMAGE_EXT_TO_MIME[ext] || '';
}

export function isSupportedImageFile(file) {
  if (!file) return false;
  const ext = (file.name?.split('.').pop() || '').toLowerCase();
  if (ext === 'heic' || ext === 'heif') return false;
  const mime = resolveImageMime(file);
  return Boolean(mime) && SUPPORTED_IMAGE_MIME.has(mime);
}
