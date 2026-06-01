import { useState, useRef } from "react";
import { post } from "../../utils/http";
import "./SplitTool.css";
import "../../styles/toolButtons.css";
import { useToast } from "../../components/Toast";
import { checkFileSize } from "../../hooks/useFileSizeLimit";
import { hapticTap, hapticSuccess, hapticError } from "../../utils/haptics";
import { reportFrontendError, trackToolAction } from "../../utils/telemetry";
import { apiUrl } from "../../config/api";
import { getFriendlyApiError } from "../../utils/apiErrors";

function getFilenameFromResponse(headers, uploadedFilename) {
  const disposition = headers["content-disposition"] || headers["Content-Disposition"] || "";
  if (disposition) {
    const quotedMatch = disposition.match(/filename="([^"]+)"/);
    if (quotedMatch) return quotedMatch[1];
    const plainMatch = disposition.match(/filename=([^;]+)/);
    if (plainMatch) return plainMatch[1].trim();
  }
  if (uploadedFilename) {
    const stem = uploadedFilename.replace(/\.[^/.]+$/, "");
    return `${stem}_split.zip`;
  }
  return "split.zip";
}

const MODES = [
  { id: "every", label: "Every Page", desc: "Each page becomes its own PDF" },
  { id: "chunk", label: "Fixed Chunks", desc: "Split into equal page groups" },
  { id: "ranges", label: "Custom Ranges", desc: 'e.g. "1-3, 5, 7-10"' },
];

export default function SplitTool() {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("every");
  const [chunkSize, setChunkSize] = useState(2);
  const [ranges, setRanges] = useState("");
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleFile = (incoming) => {
    const nextFile = incoming[0];
    if (!nextFile) return;
    if (nextFile.type !== "application/pdf") {
      hapticError();
      setError("Only PDF files are accepted.");
      return;
    }
    const sizeErr = checkFileSize(nextFile);
    if (sizeErr) {
      hapticError();
      setError(sizeErr);
      return;
    }
    setFile(nextFile);
    setError("");
    setSuccess(false);
    hapticTap();
  };

  const handleSplit = async () => {
    if (!file) {
      hapticError();
      setError("Please select a PDF file.");
      return;
    }
    if (mode === "chunk" && (!chunkSize || chunkSize < 1)) {
      hapticError();
      setError("Chunk size must be at least 1.");
      return;
    }
    if (mode === "ranges" && !ranges.trim()) {
      hapticError();
      setError("Please enter page ranges.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", mode);
    if (mode === "chunk") formData.append("chunk_size", chunkSize);
    if (mode === "ranges") formData.append("ranges", ranges);

    try {
      setLoading(true);
      setError("");
      const response = await post(apiUrl("/api/split"), formData, {
        responseType: "blob",
      });
      const downloadName = getFilenameFromResponse(response.headers, file.name);
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
      trackToolAction("split", "split_complete", "success", { mode });
      toastSuccess("Split complete — check your downloads!");
    } catch (err) {
      const msg = await getFriendlyApiError(err, "We couldn't split that PDF. Please try again.", {
        networkMessage: "We couldn't connect right now. Please try again in a moment.",
        fileTooLargeMessage: "This file is too large to process. Please choose a smaller PDF and try again.",
      });
      setError(msg);
      hapticError();
      trackToolAction("split", "split_complete", "error", { mode });
      reportFrontendError("split_failed", err, { tool: "split", mode });
      toastError(msg);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <div className="split-tool">
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
          accept=".pdf"
          style={{ display: "none" }}
          onChange={(event) => handleFile(event.target.files)}
        />
        <div className="dropzone-inner">
          <div className="drop-icon">{dragging ? "↓" : file ? "✓" : "⊘"}</div>
          <div className="drop-title">{file ? file.name : dragging ? "Release to add file" : "Drop a PDF here"}</div>
          <div className="drop-sub">{file ? formatSize(file.size) : "or click to browse"}</div>
        </div>
        <div className="dropzone-corner tl" />
        <div className="dropzone-corner tr" />
        <div className="dropzone-corner bl" />
        <div className="dropzone-corner br" />
      </div>

      <div className="mode-section">
        <div className="section-label">SPLIT MODE</div>
        <div className="mode-grid">
          {MODES.map((item) => (
            <button
              key={item.id}
              className={`mode-card ${mode === item.id ? "active" : ""}`}
              onClick={() => {
                setMode(item.id);
                setError("");
                setSuccess(false);
              }}
            >
              <span className="mode-label">{item.label}</span>
              <span className="mode-desc">{item.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {mode === "chunk" && (
        <div className="option-row">
          <label className="option-label">Pages per chunk</label>
          <input type="number" min={1} value={chunkSize} onChange={(event) => setChunkSize(Number(event.target.value))} className="option-input" />
        </div>
      )}

      {mode === "ranges" && (
        <div className="option-row column">
          <label className="option-label">Page ranges</label>
          <input
            type="text"
            placeholder="e.g. 1-3, 5, 7-10"
            value={ranges}
            onChange={(event) => setRanges(event.target.value)}
            className="option-input wide"
          />
          <span className="option-hint">Comma-separated. Use a dash for ranges. Each group becomes one PDF.</span>
        </div>
      )}

      {error && <div className="status-bar error"><span>⚠</span> {error}</div>}
      {success && <div className="status-bar success"><span>✓</span> Split complete — check your downloads!</div>}

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
        <button className={`btn-primary ${loading ? "loading" : ""}`} onClick={handleSplit} disabled={loading || !file}>
          {loading ? <><span className="spinner" /> Splitting…</> : <>Split PDF</>}
        </button>
      </div>
    </div>
  );
}
