# PDFKit

Local-first PDF toolkit with a FastAPI backend and React frontend.

## Tools

- `Merge` combines multiple PDFs into one file.
- `Split` exports every page, fixed chunks, or custom page ranges.
- `Convert` supports PDF to Word and Word to PDF.
- `Sign & Fill` analyzes a PDF, fills fields, and applies annotations.
- `Compress` supports synchronous compression and queued job-based compression with progress polling.

## Requirements

- Python 3.10+
- Node.js 18+
- `pip`

Optional system dependencies:

- LibreOffice for Word to PDF
- Tesseract for OCR
- Poppler for OCR page rendering

The backend auto-detects common install paths in `app/config.py`.
If your tools live elsewhere, set explicit env overrides instead of editing code:

- `PDFKIT_LIBREOFFICE_PATH`
- `PDFKIT_TESSERACT_PATH`
- `PDFKIT_POPPLER_PATH`

## Local Setup

### Backend

```cmd
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend default: `http://localhost:8000`

### Frontend

```cmd
cd frontend
npm install
npm start
```

Frontend default: `http://localhost:3000`

## Environment Variables

Copy [`.env.example`](.env.example) to `.env` and adjust as needed.

- `PDFKIT_CORS_ORIGINS`
  Comma-separated allowed frontend origins.
- `PDFKIT_RATE_LIMIT_REQUESTS`
  Requests allowed per IP in the configured window.
- `PDFKIT_RATE_LIMIT_WINDOW_SECONDS`
  Rate-limit window length in seconds.
- `PDFKIT_LIBREOFFICE_PATH`
  Absolute path to `soffice` / LibreOffice binary.
- `PDFKIT_TESSERACT_PATH`
  Absolute path to the Tesseract binary.
- `PDFKIT_POPPLER_PATH`
  Absolute path to the Poppler bin directory used for OCR page rendering.

`backend/.env.local` can override values in `backend/.env`.

## Health and Monitoring

- `GET /health` reports dependency availability, active CORS origins, and rate-limit settings.
- Backend logs are written to `backend/app/logs/` during local runs.
- Anonymous local telemetry summary is available at `GET /api/telemetry/summary`.

## Testing

### Frontend

```cmd
cd frontend
npm test -- --watchAll=false
```

Current frontend coverage includes the app shell plus one flow each for Merge, Split, Convert, Compress, and Sign.

### Backend

Router-level backend tests live in `backend/tests/test_api_routes.py` and mock the heavy PDF operations.

Typical run command:

```cmd
cd backend
python -m unittest tests.test_api_routes
```

## Deployment Notes

- The Sign tool loads PDF.js from local frontend static assets; it no longer depends on a CDN.
- Word to PDF remains unavailable unless LibreOffice is installed on the backend host.
- OCR-based PDF to Word requires both Tesseract and Poppler on the backend host.

## Cloud Run Deployment

This backend is ready to run in a container. The included [Dockerfile](Dockerfile) installs:

- LibreOffice
- Tesseract OCR
- Poppler utilities

Build and run locally from the `backend/` directory:

```cmd
docker build -t pdfkit-backend .
docker run --rm -p 8080:8080 --env-file .env pdfkit-backend
```

For Cloud Run, deploy the `backend/` folder as the source root or use the Dockerfile directly. Set these env vars in Cloud Run:

- `PDFKIT_CORS_ORIGINS`
  Comma-separated list of frontend origins, for example `https://your-app.vercel.app`
- `PDFKIT_LIBREOFFICE_PATH`
  Optional override if LibreOffice is installed at a nonstandard path
- `PDFKIT_TESSERACT_PATH`
  Optional override if Tesseract is installed at a nonstandard path
- `PDFKIT_POPPLER_PATH`
  Optional override if Poppler is installed at a nonstandard path

Cloud Run listens on port `8080`, which matches the container default.

## Roadmap

See [ROADMAP.md](ROADMAP.md).
