import { useState, useRef } from "react";
import { post } from "../../utils/http";
import "./ConvertTool.css";
import "../../styles/toolButtons.css";
import { useToast } from "../../components/Toast";
import { checkFileSize } from "../../hooks/useFileSizeLimit";
import { hapticTap, hapticSuccess, hapticError } from "../../utils/haptics";
import { reportFrontendError, trackToolAction } from "../../utils/telemetry";
import { apiUrl } from "../../config/api";
import { getFriendlyApiError } from "../../utils/apiErrors";

const DIRECTIONS = [
  {
    id: "pdf-to-word",
    label: "PDF to Word",
    from: "PDF",
    to: "DOCX",
    accept: ".pdf",
    ext: ".docx",
  },
  {
    id: "word-to-pdf",
    label: "Word to PDF",
    from: "DOCX",
    to: "PDF",
    accept: ".docx,.doc",
    ext: ".pdf",
  },
];

function getFilenameFromResponse(headers, uploadedFilename, fallbackExt) {
  const disposition = headers["content-disposition"] || headers["Content-Disposition"] || "";
  if (disposition) {
    const quotedMatch = disposition.match(/filename="([^"]+)"/);
    if (quotedMatch) return quotedMatch[1];
    const plainMatch = disposition.match(/filename=([^;]+)/);
    if (plainMatch) return plainMatch[1].trim();
  }
  if (uploadedFilename) {
    const stem = uploadedFilename.replace(/\.[^/.]+$/, "");
    return `${stem}${fallbackExt}`;
  }
  return `converted${fallbackExt}`;
}

export default function ConvertTool({ libOk = true }) {
  const [direction, setDirection] = useState("pdf-to-word");
  const [file, setFile] = useState(null);
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const inputRef = useRef();

  const active = DIRECTIONS.find((item) => item.id === direction);

  const handleFile = (incoming) => {
    const nextFile = incoming[0];
    if (!nextFile) return;

    const sizeErr = checkFileSize(nextFile);
    if (sizeErr) {
      hapticError();
      setError(sizeErr);
      return;
    }

    const ext = nextFile.name.split(".").pop().toLowerCase();
    const allowed = active.accept.split(",").map((item) => item.replace(".", "").trim());
    if (!allowed.includes(ext)) {
      hapticError();
      setError(`Please select a ${active.from} file (${active.accept}).`);
      return;
    }

    setFile(nextFile);
    setError("");
    setSuccess(false);
    hapticTap();
  };

  const handleConvert = async () => {
    if (!file) {
      hapticError();
      setError("Please select a file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setLoading(true);
      setError("");
      const response = await post(apiUrl(`/api/${direction}`), formData, {
        responseType: "blob",
        headers: { Accept: "*/*" },
      });
      const downloadName = getFilenameFromResponse(response.headers, file.name, active.ext);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", downloadName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess(true);
      hapticSuccess();
      trackToolAction("convert", "convert_complete", "success", { direction });
      toastSuccess("Converted successfully — check your downloads!");
    } catch (err) {
      const msg = await getFriendlyApiError(err, "We couldn't convert that file. Please try again.", {
        networkMessage: "We couldn't connect right now. Please try again in a moment.",
        fileTooLargeMessage: "This file is too large to process. Please choose a smaller file and try again.",
      });
      setError(msg);
      hapticError();
      trackToolAction("convert", "convert_complete", "error", { direction });
      reportFrontendError("convert_failed", err, { tool: "convert", direction });
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  const switchDirection = (id) => {
    setDirection(id);
    setFile(null);
    setError("");
    setSuccess(false);
  };

  const formatSize = (bytes) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="convert-tool">
      <div className="direction-toggle">
        {DIRECTIONS.map((item) => {
          const isDisabled = item.id === "word-to-pdf" && !libOk;
          return (
            <button
              key={item.id}
              className={`direction-btn ${direction === item.id ? "active" : ""} ${isDisabled ? "disabled" : ""}`}
              onClick={() => !isDisabled && switchDirection(item.id)}
              title={isDisabled ? "LibreOffice is not installed on this server" : undefined}
            >
              <span className="dir-from">{item.from}</span>
              <span className="dir-arrow">→</span>
              <span className="dir-to">{item.to}</span>
              {isDisabled && <span className="dir-unavailable">Unavailable</span>}
            </button>
          );
        })}
      </div>

      {direction === "pdf-to-word" && (
        <div className="scanned-notice">
          <button className="scanned-notice-header" onClick={() => setNoticeOpen((open) => !open)}>
            <span className="notice-icon">i</span>
            <span className="notice-title">Text-based PDFs only</span>
            <span className={`notice-chevron ${noticeOpen ? "open" : ""}`}>▾</span>
          </button>
          {noticeOpen && (
            <div className="scanned-notice-body">
              <p>This tool works best on PDFs exported digitally from Word, Google Docs, or similar sources.</p>
              <p>
                <strong>Scanned PDFs</strong> are image-based and may convert poorly unless OCR is able to recover the
                text.
              </p>
            </div>
          )}
        </div>
      )}

      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-files" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFile(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={active.accept}
          style={{ display: "none" }}
          onChange={(event) => handleFile(event.target.files)}
        />
        <div className="dropzone-inner">
          <div className="drop-icon">{dragging ? "↓" : file ? "✓" : "⇄"}</div>
          <div className="drop-title">{file ? file.name : `Drop a ${active.from} file here`}</div>
          <div className="drop-sub">{file ? formatSize(file.size) : "or click to browse"}</div>
        </div>
        <div className="dropzone-corner tl" />
        <div className="dropzone-corner tr" />
        <div className="dropzone-corner bl" />
        <div className="dropzone-corner br" />
      </div>

      {error && <div className="status-bar error"><span>⚠</span> {error}</div>}
      {success && <div className="status-bar success"><span>✓</span> Converted successfully — check your downloads!</div>}

      <div className="action-row">
        {file && (
          <button className="btn-ghost tool-nav-btn" onClick={() => {
            setFile(null);
            setSuccess(false);
            setError("");
          }}>
            Clear
          </button>
        )}
        <button className={`btn-primary ${loading ? "loading" : ""}`} onClick={handleConvert} disabled={loading || !file}>
          {loading ? <><span className="spinner" /> Converting…</> : <>Convert to {active.to}</>}
        </button>
      </div>
    </div>
  );
}
