# PDFKit Frontend

React frontend for PDFKit.

## Scripts

- `npm start` - start the development server on `http://localhost:3000`
- `npm test -- --watchAll=false` - run the frontend test suite once
- `npm run build` - create a production build in `frontend/build`

## Configuration

Set `REACT_APP_API_BASE_URL` to point at the backend when it is not running on `http://localhost:8000`.

Example:

```cmd
set REACT_APP_API_BASE_URL=https://pdfkit-api.example.com
```

## Notes

- The Sign tool now loads PDF.js from local static assets in `public/pdfjs/` instead of from a CDN.
- Tool requests share the same API helper in `src/config/api.js`.
- Frontend coverage includes the app shell plus one tested flow each for Merge, Split, Convert, Compress, and Sign.
