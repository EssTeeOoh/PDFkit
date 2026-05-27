import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { reportFrontendError } from "./utils/telemetry";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

async function clearDevelopmentCaches() {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith("pdfkit-shell-") || key.startsWith("pdfkit-shell-v") || key.includes("pdfkit"))
        .map((key) => caches.delete(key))
    );
  } catch (error) {
    reportFrontendError("cache_cleanup_failed", error);
  }
}

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              installingWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
        reportFrontendError("service_worker_registration_failed", error);
      });
  });
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .then(() => clearDevelopmentCaches())
    .catch((error) => {
      reportFrontendError("service_worker_unregister_failed", error);
    });
}

reportWebVitals();
