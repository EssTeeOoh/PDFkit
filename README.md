# PDFKit

PDFKit is a local-first PDF toolkit with a React frontend and a FastAPI backend.

It includes five tools:

- `Merge` combines multiple PDFs into one file.
- `Split` exports every page, fixed chunks, or custom page ranges.
- `Convert` supports PDF to Word and Word to PDF.
- `Sign & Fill` analyzes PDFs, fills fields, and places text, signatures, and checkmarks.
- `Compress` reduces file size with selectable compression levels and progress feedback.

## Stack

- Frontend: React
- Backend: FastAPI
- PDF processing: `pypdf`, `reportlab`, `python-docx`, and related helpers
- Optional document/OCR dependencies: LibreOffice, Tesseract, Poppler

## Project Layout

- [frontend](frontend/) - React app
- [backend](backend/) - FastAPI API and PDF services
- [backend/ROADMAP.md](backend/ROADMAP.md) - implementation status and next milestones

## Local Development

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

## Environment

Backend environment settings live in [backend/.env.example](backend/.env.example).

Frontend can point to another backend with:

```cmd
set REACT_APP_API_BASE_URL=https://your-api-host
```

Backend hosts can also override nonstandard tool locations with:

- `PDFKIT_LIBREOFFICE_PATH`
- `PDFKIT_TESSERACT_PATH`
- `PDFKIT_POPPLER_PATH`

## Deployment Flow

The usual production split is:

- **GitHub** holds the source of truth.
- **Render** runs the FastAPI backend.
- **Vercel** serves the React frontend.

How the pieces connect:

- The frontend reads `REACT_APP_API_BASE_URL` from build-time environment variables in [frontend/src/config/api.js](frontend/src/config/api.js).
- The backend reads `PDFKIT_CORS_ORIGINS` and other settings from environment variables in [backend/app/config.py](backend/app/config.py).
- The installed PWA updates in place because the frontend build stamps a fresh service worker cache version automatically before each build.

That means you deploy a new GitHub commit, Render and Vercel publish their new builds, and users keep the same installed app shortcut while the shell updates behind it.

## Testing

Frontend:

```cmd
cd frontend
npm test -- --watchAll=false
```

Backend router tests:

```cmd
cd backend
python -m unittest tests.test_api_routes
```

## Notes

- Word to PDF requires LibreOffice on the backend host.
- OCR-based PDF to Word depends on Tesseract and Poppler.
- The Sign tool uses local PDF.js assets instead of a CDN.
- Development mode does not keep a service worker registered, which avoids stale cached frontend builds on `localhost`.
- Production builds automatically bump the service worker cache version, so the web app can update without forcing a reinstall.

## More Detail

- Backend setup and API notes: [backend/README.md](backend/README.md)
- Frontend notes: [frontend/README.md](frontend/README.md)
