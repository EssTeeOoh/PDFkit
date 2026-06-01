import { useState, useRef, useCallback } from "react";
import { post } from "../../utils/http";
import "./MergeTool.css";
import "../../styles/toolButtons.css";
import { useToast } from "../../components/Toast";
import { checkFileSizes } from "../../hooks/useFileSizeLimit";
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
    return `${stem}_merged.pdf`;
  }
  return "merged.pdf";
}

export default function MergeTool() {
  const [files, setFiles] = useState([]);
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const dragItem = useRef(null);
  const dragOver = useRef(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);

  const onDragStart = useCallback((index) => {
    dragItem.current = index;
    setDragIdx(index);
  }, []);

  const onDragEnter = useCallback((index) => {
    dragOver.current = index;
    setOverIdx(index);
  }, []);

  const onDragEnd = useCallback(() => {
    const from = dragItem.current;
    const to = dragOver.current;
    if (from !== null && to !== null && from !== to) {
      setFiles((prev) => {
        const next = [...prev];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      });
      hapticTap();
    }
    dragItem.current = null;
    dragOver.current = null;
    setDragIdx(null);
    setOverIdx(null);
  }, []);

  const touchStartY = useRef(0);
  const touchItemH = useRef(0);
  const listRef = useRef();

  const onTouchStart = useCallback((event, index) => {
    dragItem.current = index;
    setDragIdx(index);
    touchStartY.current = event.touches[0].clientY;
    touchItemH.current = event.currentTarget.getBoundingClientRect().height + 6;
  }, []);

  const onTouchMove = useCallback((event) => {
    if (dragItem.current === null) return;
    event.preventDefault();
    const diff = event.touches[0].clientY - touchStartY.current;
    const steps = Math.round(diff / touchItemH.current);
    const newOver = Math.max(
      0,
      Math.min((listRef.current?.children.length ?? 1) - 1, dragItem.current + steps)
    );
    dragOver.current = newOver;
    setOverIdx(newOver);
  }, []);

  const onTouchEnd = useCallback(() => {
    onDragEnd();
  }, [onDragEnd]);

  const addFiles = (incoming) => {
    const pdfs = Array.from(incoming).filter((file) => file.type === "application/pdf");
    if (pdfs.length !== incoming.length) {
      hapticError();
      setError("Only PDF files are accepted.");
      return;
    }

    const sizeErr = checkFileSizes(pdfs);
    if (sizeErr) {
      hapticError();
      setError(sizeErr);
      return;
    }

    setError("");
    setFiles((prev) => {
      const names = new Set(prev.map((file) => file.name));
      const fresh = pdfs.filter((file) => !names.has(file.name));
      return [...prev, ...fresh];
    });
    setSuccess(false);
    if (pdfs.length > 0) hapticTap();
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setError("");
    setSuccess(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const handleMerge = async () => {
    if (files.length < 2) {
      hapticError();
      setError("Please add at least 2 PDF files.");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      setLoading(true);
      setError("");
      const response = await post(apiUrl("/api/merge"), formData, {
        responseType: "blob",
      });
      const downloadName = getFilenameFromResponse(response.headers, files[0]?.name);
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
      toastSuccess("Merged successfully — check your downloads!");
      trackToolAction("merge", "merge_complete", "success", { file_count: files.length });
    } catch (err) {
      const mergeMsg = await getFriendlyApiError(
        err,
        "We couldn't merge those PDFs. Please try again.",
        {
          networkMessage: "We couldn't connect right now. Please try again in a moment.",
          fileTooLargeMessage: "One of those files is too large to process. Please choose smaller PDFs and try again.",
        }
      );
      setError(mergeMsg);
      hapticError();
      trackToolAction("merge", "merge_complete", "error", { file_count: files.length });
      reportFrontendError("merge_failed", err, { tool: "merge", fileCount: files.length });
      toastError(mergeMsg);
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);

  return (
    <div className="merge-tool">
      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${files.length > 0 ? "has-files" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={(event) => addFiles(event.target.files)}
        />
        <div className="dropzone-inner">
          <div className="drop-icon">{dragging ? "↓" : "⊕"}</div>
          <div className="drop-title">{dragging ? "Release to add files" : "Drop PDFs here"}</div>
          <div className="drop-sub">or click to browse</div>
        </div>
        <div className="dropzone-corner tl" />
        <div className="dropzone-corner tr" />
        <div className="dropzone-corner bl" />
        <div className="dropzone-corner br" />
      </div>

      {files.length > 0 && (
        <div className="file-section">
          <div className="file-section-header">
            <span className="file-count">{files.length} file{files.length !== 1 ? "s" : ""}</span>
            <span className="file-total">{formatSize(totalSize)} total</span>
          </div>

          <div className="file-list" ref={listRef}>
            {files.map((file, index) => (
              <div
                key={file.name}
                className={`file-item ${dragIdx === index ? "dragging" : ""} ${overIdx === index && dragIdx !== index ? "drag-over" : ""}`}
                style={{ animationDelay: `${index * 0.05}s` }}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragEnter={() => onDragEnter(index)}
                onDragEnd={onDragEnd}
                onDragOver={(event) => event.preventDefault()}
                onTouchStart={(event) => onTouchStart(event, index)}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                <div className="file-drag-handle" title="Drag to reorder">⋮⋮</div>
                <div className="file-order">{String(index + 1).padStart(2, "0")}</div>

                <div className="file-icon">
                  <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                    <path d="M2 0h8l6 6v14a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z" fill="currentColor" opacity="0.15" />
                    <path d="M9 0l7 7H9V0z" fill="currentColor" opacity="0.4" />
                    <rect x="3" y="10" width="10" height="1.5" rx="0.75" fill="currentColor" opacity="0.6" />
                    <rect x="3" y="13" width="7" height="1.5" rx="0.75" fill="currentColor" opacity="0.4" />
                  </svg>
                </div>

                <div className="file-info">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatSize(file.size)}</span>
                </div>

                <div className="file-actions">
                  <button className="file-btn remove" onClick={() => removeFile(index)} title="Remove">
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="status-bar error">
          <span>⚠</span> {error}
        </div>
      )}

      {success && (
        <div className="status-bar success">
          <span>✓</span> Merged successfully — check your downloads!
        </div>
      )}

      <div className="action-row">
        {files.length > 0 && (
          <button className="btn-ghost tool-nav-btn" onClick={() => {
            setFiles([]);
            setSuccess(false);
            setError("");
          }}>
            Clear all
          </button>
        )}
        <button className={`btn-primary ${loading ? "loading" : ""}`} onClick={handleMerge} disabled={loading || files.length < 2}>
          {loading ? <><span className="spinner" /> Merging…</> : <>Merge {files.length > 1 ? `${files.length} PDFs` : "PDFs"}</>}
        </button>
      </div>
    </div>
  );
}
