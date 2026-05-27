const FALLBACK_API_BASE_URL = "http://localhost:8000";

function normalizeBaseUrl(value) {
  if (!value) return FALLBACK_API_BASE_URL;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export const API_BASE_URL = normalizeBaseUrl(process.env.REACT_APP_API_BASE_URL);

export function apiUrl(path = "") {
  if (!path) return API_BASE_URL;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
