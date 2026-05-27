# PDFKit - Project Roadmap

## About This Document

This roadmap tracks what is built, what is still planned, and what is intentionally parked.
Update it whenever implementation status changes so it stays aligned with the codebase.

---

## Current Status

### Tools

| Tool | Status | Notes |
|------|--------|-------|
| Merge | Done | Multi-file, drag/drop upload, reorder controls, file size limit |
| Split | Done | Every page, chunks, custom ranges, file size limit |
| Convert PDF to Word | Done | Text-based plus OCR fallback for scanned PDFs |
| Convert Word to PDF | Done | Requires LibreOffice on server |
| Sign & Fill | Done | Text, checkmarks, signatures, touch support, undo/redo, draft restore |
| Compress | Done | Low, Medium, High, recompress flow, faster low/medium processing, live upload and compression progress |

### Infrastructure

| Item | Status |
|------|--------|
| FastAPI backend | Done |
| React frontend | Done |
| Responsive app shell | Done |
| Refreshed frontend UI system | Done |
| Installable PWA shell | Done |
| Folder structure (tools/merge/, tools/split/, etc.) | Done |
| File size limits - frontend (all 5 tools) | Done |
| File size limits - backend (100MB, all 5 tools) | Done |
| CID character fix in Convert | Done |
| Compress rewritten for current pypdf | Done |
| Toast notifications | Done |
| Error boundary per tool | Done |
| Backend health and offline detection | Done |
| LibreOffice availability check in UI | Done |
| Remember last used tool | Done |
| Theme respects system preference on first load | Done |
| Local error logging | Done |
| Local usage analytics | Done |
| Frontend flow tests | Done |
| Backend router tests | Done |

---

## Known Limitations

### Word to PDF requires LibreOffice

The Word to PDF direction in the Convert tool runs LibreOffice in headless mode on the server:

```bash
soffice --headless --convert-to pdf --outdir /tmp yourfile.docx
```

This means the machine running the backend must have LibreOffice installed.

**What happens if it is not installed:**
The backend checks for LibreOffice on startup. If it is missing, the
`/word-to-pdf` endpoint returns HTTP 503 with the message:
`"LibreOffice is not installed on this server. Word to PDF is unavailable."`

**Current mitigation already implemented:**
- The frontend calls `/health` on load
- The Word to PDF option is disabled when LibreOffice is unavailable
- The backend still returns a clear 503 if the endpoint is called directly

### PWA support is shell-only while the backend is offline

PDFKit can now be installed and the frontend shell can open from cache,
but PDF processing still requires the backend to be reachable.

This means:
- The interface can still load when offline
- Users get a clearer fallback message instead of a broken screen
- Actual Merge, Split, Convert, Sign, and Compress actions still need the backend

---

## Roadmap

### Phase 1 - Polish & Reliability

- [x] **Toast notifications** - Shared toast feedback across tools.
- [x] **Error boundary** - One tool can crash without blanking the whole app.
- [x] **Offline / backend unreachable detection** - Health checks with retryable fallback messaging.
- [x] **Convert tool - LibreOffice unavailable UI** - Word to PDF is disabled when LibreOffice is missing.
- [x] **Remember last used tool** - Active tool persists in `localStorage`.

### Phase 2 - User Experience

- [x] **Drag to reorder on mobile (Merge)** - Touch and desktop drag-to-reorder are both supported.
- [x] **Dark/light theme respects system preference** - First visit uses `prefers-color-scheme`.
- [x] **Sign & Fill - Undo/redo** - Toolbar controls plus desktop keyboard shortcuts.
- [x] **Sign & Fill - Auto-save draft** - Drafts restore from `localStorage`; reusable signature preset still has a small limitation.
- [x] **Consistent download filenames** - All tools honor backend filenames with client fallbacks.
- [x] **Frontend visual refresh** - Shell, navigation, hero area, and workspace framing were redesigned for a more polished experience.

### Phase 3 - Mobile Specific

- [x] **PWA support** - Real manifest, branded icons, static asset caching, and offline fallback shell are implemented.
- [x] **Haptic feedback** - Mobile vibration feedback now runs for key actions such as file drops, successful processing, reconnect refresh, and error states where supported.
- [x] **Pull to refresh** - The main workspace now supports pull-to-refresh to recheck backend connectivity on mobile.

### Phase 4 - Performance

- [x] **Compress speed optimization** - Low and Medium now use faster image resampling while High keeps the highest-quality pass.
- [x] **Loading progress for large files** - Compress now shows upload progress plus backend job progress while large files are processing.

### Phase 5 - Analytics & Monitoring

- [x] **Error logging** - Frontend crashes and failed tool actions now report into local backend error logs.
- [x] **Usage analytics** - Anonymous local counters now track tool views and key tool completions.

### Phase 6 - Hosting & Distribution

- [ ] **GitHub repository** - Confirm repository setup, remote, README quality, and sharing workflow.
- [ ] **Backend hosting** - Deploy FastAPI to a server with LibreOffice, Tesseract, and Poppler installed.
- [ ] **Frontend hosting** - Deploy the React frontend or serve it as static assets from the backend host.
- [x] **Rate limiting** - In-memory per-IP rate limiting is now enforced for API routes with response headers and retry guidance.
- [x] **CORS update** - Allowed frontend origins now come from environment config instead of being hardcoded to one localhost origin.

---

## Completed Log

| Date | Item |
|------|------|
| Mar 2026 | Merge, Split, and Convert tools built |
| Mar 2026 | Sign & Fill built with full touch support |
| Mar 2026 | Compress built and rewritten for current pypdf |
| Mar 2026 | Responsive layout with bottom tab navigation |
| Mar 2026 | Unified CSS design system across tools |
| Mar 2026 | Folder restructure (`src/tools/merge/`, etc.) |
| Mar 2026 | File size limits on frontend and backend (100MB) |
| Mar 2026 | CID bullet point and special character fix in Convert |
| Mar 2026 | Recompress flow with original file size tracking |
| Mar 2026 | Collapsible info notice in Convert |
| Mar 2026 | Tips box in Sign & Fill |
| Mar 2026 | LibreOffice missing now returns a clear 503 instead of crashing |
| Mar 2026 | Toast notification system added |
| Mar 2026 | Per-tool error boundary added |
| Mar 2026 | Backend health check and offline banner added |
| Mar 2026 | Last-used tool persistence added |
| Mar 2026 | Theme initialization updated to respect system preference |
| May 2026 | Merge and Split updated to honor backend download filenames |
| May 2026 | Merge touch drag-to-reorder confirmed and documented |
| May 2026 | Sign & Fill undo/redo and keyboard shortcuts added |
| May 2026 | Sign & Fill draft auto-save and restore added |
| May 2026 | PWA manifest, icons, service worker, and offline fallback shell added |
| May 2026 | Frontend shell redesigned with improved navigation and workspace framing |
| May 2026 | Mobile haptic feedback added for key frontend actions |
| May 2026 | Pull-to-refresh added to recheck backend availability on mobile |
| May 2026 | Compress updated with faster low/medium processing and live progress tracking |
| May 2026 | Local error logging and anonymous usage analytics added |
| May 2026 | Configurable CORS origins and per-IP API rate limiting added |
| May 2026 | Frontend flow tests added for app shell, merge, split, convert, compress, and sign |
| May 2026 | Backend router tests added with mocked PDF operations |
