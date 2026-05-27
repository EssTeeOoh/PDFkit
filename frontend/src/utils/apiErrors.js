const DEFAULT_SAFE_PATTERNS = [
  "file must be a pdf",
  "only pdf files are accepted",
  "please upload a pdf file",
  "file is too large",
  "file exceeds the",
  "nothing to apply",
  "field_values must be valid json",
  "annotations must be valid json",
  "please enter page ranges",
  "chunk size must be at least",
  "please select a pdf file",
  "please select a file",
  "too many requests",
  "unsupported",
  "invalid",
];

function isSafeDetail(detail, extraPatterns = []) {
  if (!detail || typeof detail !== "string") return false;
  const normalized = detail.toLowerCase();
  return [...DEFAULT_SAFE_PATTERNS, ...extraPatterns].some((pattern) => normalized.includes(pattern));
}

async function readResponseDetail(responseData, extraPatterns = []) {
  if (isSafeDetail(responseData?.detail, extraPatterns)) return responseData.detail;

  if (typeof responseData === "string") {
    try {
      const parsed = JSON.parse(responseData);
      if (isSafeDetail(parsed?.detail, extraPatterns)) return parsed.detail;
    } catch {
      if (isSafeDetail(responseData.trim(), extraPatterns)) return responseData.trim();
    }
  }

  if (responseData instanceof Blob) {
    try {
      const text = await responseData.text();
      if (!text) return null;
      try {
        const parsed = JSON.parse(text);
        if (isSafeDetail(parsed?.detail, extraPatterns)) return parsed.detail;
      } catch {
        if (isSafeDetail(text, extraPatterns)) return text;
      }
    } catch {
      return null;
    }
  }

  return null;
}

export async function getFriendlyApiError(err, fallback, options = {}) {
  const { networkMessage, fileTooLargeMessage, safeDetailPatterns = [] } = options;
  const status = err?.response?.status;
  const detail = await readResponseDetail(err?.response?.data, safeDetailPatterns);

  if (detail) return detail;

  if (err?.message === "Network Error" || err?.code === "ERR_NETWORK") {
    return networkMessage || "We couldn't connect right now. Please try again in a moment.";
  }

  if (status === 413 && fileTooLargeMessage) {
    return fileTooLargeMessage;
  }

  return fallback;
}
