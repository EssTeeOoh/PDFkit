const fs = require("fs");
const path = require("path");

const templatePath = path.join(__dirname, "..", "public", "service-worker.template.js");
const serviceWorkerPath = path.join(__dirname, "..", "public", "service-worker.js");
const version = `pdfkit-shell-${Date.now().toString(36)}`;

const source = fs.readFileSync(templatePath, "utf8");
const updated = source.replace("__PDFKIT_CACHE_VERSION__", version);

if (updated === source) {
  throw new Error("Could not find service worker cache version placeholder.");
}

fs.writeFileSync(serviceWorkerPath, updated);
console.log(`Updated service worker cache version to ${version}`);
