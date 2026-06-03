import { apiUrl } from "../config/api";

const API = apiUrl("/api/telemetry/events");
const CLIENT_KEY = "pdfkit-anon-client-id";
const EXTERNAL_ERROR_PATTERNS = [
  /metamask/i,
  /wallet connect/i,
  /failed to connect to (?:the )?supplied address/i,
  /the message port closed before a response was received/i,
  /a listener indicated an asynchronous response/i,
  /could not establish connection/i,
];

function getClientId() {
  try {
    const existing = localStorage.getItem(CLIENT_KEY);
    if (existing) return existing;
    const created = `client_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_KEY, created);
    return created;
  } catch {
    return "client_unavailable";
  }
}

function postTelemetry(payload) {
  const body = JSON.stringify({
    source: "frontend",
    ...payload,
    metadata: {
      path: window.location.pathname,
      client_id: getClientId(),
      ...payload.metadata,
    },
  });

  try {
    const telemetryUrl = new URL(API, window.location.href);
    const isCrossOrigin = telemetryUrl.origin !== window.location.origin;

    if (navigator.sendBeacon && !isCrossOrigin) {
      const sent = navigator.sendBeacon(API, new Blob([body], { type: "application/json" }));
      if (sent) return;
    }
  } catch {
    // Fall through to fetch.
  }

  fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "omit",
    keepalive: true,
  }).catch(() => {});
}

function getErrorMessage(error, fallback = "Unknown frontend error") {
  if (typeof error === "string") return error;
  return error?.message || fallback;
}

function isExternalNoise(error, context = {}) {
  const message = getErrorMessage(error, context?.message || "");
  const stack = typeof error === "object" && error?.stack ? String(error.stack) : "";
  const haystack = `${message}\n${stack}`;
  return EXTERNAL_ERROR_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function trackToolView(tool) {
  postTelemetry({ category: "usage", name: "tool_view", tool, status: "view" });
}

export function trackToolAction(tool, name, status = "success", metadata = {}) {
  postTelemetry({ category: "usage", name, tool, status, metadata });
}

export function reportFrontendError(name, error, context = {}) {
  const isExternal = context?.ignoreExternal !== false && isExternalNoise(error, context);

  const message = getErrorMessage(error, context?.message || "Unknown frontend error");

  postTelemetry({
    category: isExternal ? "external" : "error",
    name,
    tool: context.tool,
    status: "error",
    message,
    metadata: {
      stack: typeof error === "object" && error?.stack ? String(error.stack).slice(0, 1200) : undefined,
      ...context,
    },
  });
}
