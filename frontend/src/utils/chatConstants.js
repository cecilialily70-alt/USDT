export const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

export const SUPPORTED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

export const UNSUPPORTED_IMAGE_MESSAGE = '仅支持 JPG/PNG/GIF/WebP/BMP，HEIC/HEIF 暂不支持';
