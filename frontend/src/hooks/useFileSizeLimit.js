// src/hooks/useFileSizeLimit.js
// Shared file size validation — 100MB limit enforced on every tool

export const MAX_FILE_MB   = 100;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/**
 * Validates a single File object against the size limit.
 * Returns null if ok, or an error string if too large.
 */
export function checkFileSize(file) {
  if (!file) return null;
  if (file.size > MAX_FILE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `File is too large (${sizeMB} MB). Maximum allowed size is ${MAX_FILE_MB} MB.`;
  }
  return null;
}

/**
 * Validates multiple File objects.
 * Returns null if all ok, or an error string listing offending files.
 */
export function checkFileSizes(files) {
  if (!files || files.length === 0) return null;
  const overLimit = files.filter(f => f.size > MAX_FILE_BYTES);
  if (overLimit.length === 0) return null;
  if (overLimit.length === 1) {
    const sizeMB = (overLimit[0].size / (1024 * 1024)).toFixed(1);
    return `"${overLimit[0].name}" is too large (${sizeMB} MB). Maximum allowed size is ${MAX_FILE_MB} MB.`;
  }
  return `${overLimit.length} files exceed the ${MAX_FILE_MB} MB limit. Please remove them and try again.`;
}