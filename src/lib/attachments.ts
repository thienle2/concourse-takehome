// Files a worker attaches when logging a document they received outside the workspace.
// Nothing is uploaded anywhere: the file stays in the browser for this session and is
// opened through a local object URL.

export interface Attachment {
  name: string;
  type: string;
  size: number;
  /** Local object URL for viewing in this session. */
  url: string;
}

// PLACEHOLDER: accepted formats and size limit are prototype choices, not agency policy.
export const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
};
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type FileLike = { name: string; type: string; size: number };

/** Returns an error message for the chosen files, or '' when they're fine. */
export function validateFiles(files: FileLike[]): string {
  if (files.length > MAX_FILES) return `Attach up to ${MAX_FILES} files at a time. You chose ${files.length}.`;
  const wrong = files.filter((f) => !ACCEPTED_TYPES[f.type]);
  if (wrong.length) return `${wrong.map((f) => f.name).join(', ')} ${wrong.length === 1 ? "isn't" : "aren't"} a PDF, JPG or PNG. Choose a different file.`;
  const big = files.filter((f) => f.size > MAX_FILE_BYTES);
  if (big.length) return `${big.map((f) => `${f.name} (${formatBytes(f.size)})`).join(', ')} ${big.length === 1 ? 'is' : 'are'} over the ${formatBytes(MAX_FILE_BYTES)} limit.`;
  return '';
}

export const isImage = (a: Attachment) => a.type.startsWith('image/');
