/** Shared by file pickers and server-side attachment validation. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'image/bmp', 'image/x-icon', 'image/vnd.microsoft.icon'] as const;
export const UPLOAD_MIME_TYPES = ['application/pdf', DOCX_MIME, ...IMAGE_MIME_TYPES];
export const UPLOAD_ACCEPT = `${UPLOAD_MIME_TYPES.join(',')},.docx`;

export function uploadProblem(file: { name: string; type: string; size: number }, maxBytes = MAX_UPLOAD_BYTES): string | null {
  if (!file.name.trim()) return "That file has no name.";
  if (file.type !== "application/pdf" && file.type !== DOCX_MIME && !IMAGE_MIME_TYPES.some(type => type === file.type)) return "Upload a PDF, Word document (.docx), or browser-viewable image (PNG, JPG, GIF, WebP, AVIF, SVG, or BMP). Convert HEIC or TIFF images to JPG or PNG first.";
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return "That file looks empty or has an invalid size.";
  if (file.size > maxBytes) return "That file is over the 20 MB limit.";
  return null;
}
