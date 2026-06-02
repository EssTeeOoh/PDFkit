import React, { useCallback, useEffect, useRef, useState } from "react";
import { get, post } from "../../utils/http";
import "./CompressTool.css";
import { useToast } from "../../components/Toast";
import { checkFileSize } from "../../hooks/useFileSizeLimit";
import { hapticTap, hapticSuccess, hapticError } from "../../utils/haptics";
import { reportFrontendError, trackToolAction } from "../../utils/telemetry";
import { apiUrl } from "../../config/api";
import { getFriendlyApiError } from "../../utils/apiErrors";

const API = apiUrl();
const POLL_MS = 900;
const COMPRESS_JOB_KEY = "pdfkit-compress-job";
const COMPRESS_COMPLETE_KEY = "pdfkit-compress-complete";

const LEVELS = [
  { id: "low", label: "Low", desc: "Light compression. Full clarity preserved. Best for print or archiving." },
  { id: "medium", label: "Medium", desc: "Balanced compression. Noticeably smaller with no visible quality loss." },
  { id: "high", label: "High", desc: "Maximum compression. Smallest file size while keeping the PDF readable." },
];

function fmtSize(bytes) {
  if (bytes == null) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function filenameFromDisposition(disposition, fallbackName) {
  const match = disposition?.match(/filename="?([^";\n]+)"?/);
  return match ? match[1] : fallbackName;
}

function SizeDisplay({ original, actual, recompressed }) {
  const pct = Math.round((actual / original) * 100);
  const saved = original - actual;
  return (
    <div className="size-bar-wrap">
      <div className="size-bar-row">
        <span className="size-label">{recompressed ? "Original file" : "Original"}</span>
        <span className="size-value">{fmtSize(original)}</span>
      </div>
      <div className="size-bar-track">
        <div className="size-bar-orig" />
        <div className="size-bar-fill actual" style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <div className="size-bar-row">
        <span className="size-label">Compressed</span>
        <span className="size-value size-actual">
          {fmtSize(actual)}
          <span className="size-pct">{pct}%</span>
        </span>
      </div>
      {saved > 0 && (
        <div className="size-saved">
          {recompressed ? "Total saved from original: " : "Saved: "}
          {fmtSize(saved)}
        </div>
      )}
    </div>
  );
}

function ProgressCard({ progress }) {
  return (
    <div className="compress-progress-card" aria-live="polite">
      <div className="compress-progress-header">
        <span className="compress-progress-title">Compression in progress</span>
        <span className="compress-progress-percent">{progress.percent}%</span>
      </div>
      <div className="compress-progress-track">
        <div className="compress-progress-fill" style={{ width: `${progress.percent}%` }} />
      </div>
      <p className="compress-progress-stage">{progress.stage}</p>
    </div>
  );
}

export default function CompressTool() {
  const [file, setFile] = useState(null);
  const [originalFile, setOriginalFile] = useState(null);
  const [levelIdx, setLevelIdx] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [recompressing, setRecompressing] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, stage: "" });
  const [jobId, setJobId] = useState(null);
  const inputRef = useRef();
  const resultRef = useRef(null);
  const mountedRef = useRef(true);
  const resultUrlRef = useRef(null);
  const wakeLockRef = useRef(null);
  const pollingRef = useRef(false);
  const { error: toastError } = useToast();

  const level = LEVELS[levelIdx];

  const clearResultUrl = useCallback(() => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }
  }, []);

  const clearPendingJob = useCallback(() => {
    try {
      localStorage.removeItem(COMPRESS_JOB_KEY);
    } catch {
      // ignore
    }
  }, []);

  const savePendingJob = useCallback((payload) => {
    try {
      localStorage.setItem(COMPRESS_JOB_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, []);

  const clearCompletedJob = useCallback(() => {
    try {
      localStorage.removeItem(COMPRESS_COMPLETE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const saveCompletedJob = useCallback((payload) => {
    try {
      localStorage.setItem(COMPRESS_COMPLETE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (!wakeLockRef.current) return;
    try {
      await wakeLockRef.current.release();
    } catch {
      // ignore
    } finally {
      wakeLockRef.current = null;
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearResultUrl();
      releaseWakeLock();
    };
  }, [clearResultUrl, releaseWakeLock]);

  useEffect(() => {
    if (!result || loading || !resultRef.current) return;
    resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result, loading]);

  const replaceResult = useCallback((nextResult) => {
    clearResultUrl();
    resultUrlRef.current = nextResult?.url || null;
    setResult(nextResult);
  }, [clearResultUrl]);

  const loadFile = useCallback((nextFile) => {
    if (!nextFile || nextFile.type !== "application/pdf") {
      hapticError();
      setError("Please upload a PDF file.");
      return;
    }

    const sizeErr = checkFileSize(nextFile);
    if (sizeErr) {
      hapticError();
      setError(sizeErr);
      return;
    }

    setFile(nextFile);
    setOriginalFile(nextFile);
    replaceResult(null);
    setRecompressing(false);
    setError("");
    setProgress({ percent: 0, stage: "" });
    setJobId(null);
    clearPendingJob();
    clearCompletedJob();
    void releaseWakeLock();
    hapticTap();
  }, [clearCompletedJob, clearPendingJob, releaseWakeLock, replaceResult]);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    setDragOver(false);
    loadFile(event.dataTransfer.files[0]);
  }, [loadFile]);

  const onPickFile = (event) => loadFile(event.target.files[0]);

  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const compressLegacy = async (formData, fallbackName) => {
    setProgress({ percent: 35, stage: "Compressing PDF" });

    const response = await post(`${API}/api/compress`, formData, {
      responseType: "blob",
      onUploadProgress: (event) => {
        if (!event.total) return;
        const uploadPercent = Math.round((event.loaded / event.total) * 35);
        setProgress({
          percent: Math.max(4, Math.min(35, uploadPercent)),
          stage: "Uploading PDF",
        });
      },
    });

    const blob = response.data;
    const url = URL.createObjectURL(blob);
    const disposition = response.headers["content-disposition"] || "";
    const filename = filenameFromDisposition(disposition, fallbackName);

    replaceResult({ url, size: blob.size, filename });
    setProgress({ percent: 100, stage: "Ready to download" });
  };

  const downloadJobResult = useCallback(async (nextJobId, fallbackName, levelId = null) => {
    const response = await get(`${API}/api/compress/jobs/${nextJobId}/download`, {
      responseType: "blob",
    });

    const blob = response.data;
    const url = URL.createObjectURL(blob);
    const disposition = response.headers["content-disposition"] || "";
    const filename = filenameFromDisposition(disposition, fallbackName);

    replaceResult({ url, size: blob.size, filename });
    saveCompletedJob({
      jobId: nextJobId,
      fallbackName,
      levelId,
      completedAt: Date.now(),
    });
  }, [replaceResult, saveCompletedJob]);

  const pollJobUntilDone = useCallback(async (nextJobId, fallbackName) => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    while (mountedRef.current) {
      try {
        const response = await get(`${API}/api/compress/jobs/${nextJobId}`);
        const data = response.data;
        const nextPercent = typeof data.progress === "number" ? data.progress : 20;
        const nextStage = data.stage || "Compressing PDF";
        setProgress({ percent: Math.max(20, nextPercent), stage: nextStage });

        if (data.status === "done") {
          await downloadJobResult(nextJobId, fallbackName, level.id);
          clearPendingJob();
          saveCompletedJob({
            jobId: nextJobId,
            fallbackName,
            levelId: level.id,
            completedAt: Date.now(),
          });
          return;
        }

        if (data.status === "error") {
          clearPendingJob();
          throw new Error(data.error || "Compression failed. Please try again.");
        }
      } catch (error) {
        if (error?.response?.status === 404) {
          clearPendingJob();
          throw new Error("That compression job is no longer available. Please try again.");
        }
        throw error;
      }

      await wait(POLL_MS);
    }
  }, [clearPendingJob, downloadJobResult, saveCompletedJob, level.id]);

  const resumePendingJob = useCallback(async () => {
    let pending = null;
    try {
      pending = JSON.parse(localStorage.getItem(COMPRESS_JOB_KEY) || "null");
    } catch {
      clearPendingJob();
      return;
    }

    if (!pending?.jobId) {
      let completed = null;
      try {
        completed = JSON.parse(localStorage.getItem(COMPRESS_COMPLETE_KEY) || "null");
      } catch {
        clearCompletedJob();
        return;
      }

      if (!completed?.jobId || result) return;

      setLoading(true);
      setError("");
      setJobId(completed.jobId);
      setProgress({ percent: 100, stage: "Ready to download" });

      try {
        await downloadJobResult(completed.jobId, completed.fallbackName || "compressed.pdf", completed.levelId || null);
        trackToolAction("compress", "compress_complete", "success", { level: completed.levelId || "unknown", mode: "restored" });
        hapticSuccess();
      } catch (err) {
        const compMsg = await getFriendlyApiError(err, "We couldn't restore that finished download. Please try again.", {
          networkMessage: "We couldn't connect right now. Please try again in a moment.",
        });
        setError(compMsg);
        setProgress({ percent: 0, stage: "" });
        hapticError();
        trackToolAction("compress", "compress_complete", "error", { level: completed.levelId || "unknown", mode: "restored" });
        reportFrontendError("compress_restore_failed", err, { tool: "compress", mode: "restored" });
        toastError(compMsg);
        clearCompletedJob();
        setJobId(null);
      } finally {
        setLoading(false);
      }

      return;
    }

    setLoading(true);
    setError("");
    setJobId(pending.jobId);
    setProgress({ percent: 20, stage: "Resuming compression" });

    try {
      await pollJobUntilDone(pending.jobId, pending.fallbackName || "compressed.pdf");
      setProgress({ percent: 100, stage: "Ready to download" });
      trackToolAction("compress", "compress_complete", "success", { level: pending.levelId || "unknown", mode: "resumed" });
      hapticSuccess();
    } catch (err) {
      const compMsg = await getFriendlyApiError(err, "We couldn't resume that compression job. Please try again.", {
        networkMessage: "We couldn't connect right now. Please try again in a moment.",
      });
      setError(compMsg);
      setProgress({ percent: 0, stage: "" });
      hapticError();
      trackToolAction("compress", "compress_complete", "error", { level: pending.levelId || "unknown", mode: "resumed" });
      reportFrontendError("compress_resume_failed", err, { tool: "compress", mode: "resumed" });
      toastError(compMsg);
      clearPendingJob();
      clearCompletedJob();
      setJobId(null);
    } finally {
      setLoading(false);
      pollingRef.current = false;
    }
  }, [clearCompletedJob, clearPendingJob, downloadJobResult, pollJobUntilDone, result, toastError]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && jobId && !loading) {
        void resumePendingJob();
      }
    };

    const onPageShow = () => {
      if (jobId && !loading) {
        void resumePendingJob();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [jobId, loading, resumePendingJob]);

  useEffect(() => {
    if (jobId || result || loading) return;
    void resumePendingJob();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compress = async () => {
    if (!file) {
      hapticError();
      return;
    }

    setLoading(true);
    setError("");
    replaceResult(null);
    setJobId(null);
    setProgress({ percent: 4, stage: "Uploading PDF" });
    await requestWakeLock();
    let createdJobId = null;

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("level", level.id);

      const fallbackName = file.name.replace(/\.pdf$/i, "_compressed.pdf");
      const createResponse = await post(`${API}/api/compress/jobs`, formData, {
        onUploadProgress: (event) => {
          if (!event.total) return;
          const uploadPercent = Math.round((event.loaded / event.total) * 18);
          setProgress({
            percent: Math.max(4, Math.min(18, uploadPercent)),
            stage: "Uploading PDF",
          });
        },
      });

      const nextJobId = createResponse.data.job_id;
      createdJobId = nextJobId;
      setJobId(nextJobId);
      savePendingJob({
        jobId: nextJobId,
        fallbackName,
        levelId: level.id,
        createdAt: Date.now(),
      });
      setProgress({ percent: 20, stage: "Starting compression" });
      await pollJobUntilDone(nextJobId, fallbackName);
      setProgress({ percent: 100, stage: "Ready to download" });
      trackToolAction("compress", "compress_complete", "success", { level: level.id });
      hapticSuccess();
    } catch (err) {
      const status = err?.response?.status;
      const jobRouteUnavailable =
        status === 404 ||
        status === 405 ||
        (typeof err?.response?.data?.detail === "string" &&
          err.response.data.detail.toLowerCase().includes("not found"));

      if (!createdJobId && jobRouteUnavailable) {
        try {
          const legacyFormData = new FormData();
          legacyFormData.append("file", file);
          legacyFormData.append("level", level.id);
          const fallbackName = file.name.replace(/\.pdf$/i, "_compressed.pdf");
          await compressLegacy(legacyFormData, fallbackName);
          clearPendingJob();
          trackToolAction("compress", "compress_complete", "success", { level: level.id, mode: "legacy" });
          hapticSuccess();
          return;
        } catch (legacyErr) {
          const legacyMsg = await getFriendlyApiError(
            legacyErr,
            "We couldn't compress that PDF. Please try again.",
            {
              networkMessage: "We couldn't connect right now. Please try again in a moment.",
              fileTooLargeMessage: "This file is too large to process. Please choose a smaller PDF and try again.",
            }
          );
          setError(legacyMsg);
          setProgress({ percent: 0, stage: "" });
          hapticError();
          trackToolAction("compress", "compress_complete", "error", { level: level.id, mode: "legacy" });
          reportFrontendError("compress_failed", legacyErr, { tool: "compress", level: level.id, mode: "legacy" });
          toastError(legacyMsg);
          return;
        }
      }

      const compMsg = await getFriendlyApiError(err, "We couldn't compress that PDF. Please try again.", {
        networkMessage: "We couldn't connect right now. Please try again in a moment.",
        fileTooLargeMessage: "This file is too large to process. Please choose a smaller PDF and try again.",
      });
      setError(compMsg);
      setProgress({ percent: 0, stage: "" });
      hapticError();
      trackToolAction("compress", "compress_complete", "error", { level: level.id });
      reportFrontendError("compress_failed", err, { tool: "compress", level: level.id });
      toastError(compMsg);
      clearPendingJob();
    } finally {
      setLoading(false);
      setJobId(null);
      pollingRef.current = false;
      void releaseWakeLock();
    }
  };

  const download = () => {
    if (!result) return;
    const anchor = document.createElement("a");
    anchor.href = result.url;
    anchor.download = result.filename;
    anchor.click();
  };

  const recompress = () => {
    if (!result) return;
    fetch(result.url)
      .then((response) => response.blob())
      .then((blob) => {
        const nextFile = new File([blob], result.filename, { type: "application/pdf" });
        setFile(nextFile);
        replaceResult(null);
        setRecompressing(true);
        setError("");
        setProgress({ percent: 0, stage: "" });
        hapticTap();
      });
  };

  const cancelRecompress = () => {
    setFile(originalFile);
    setRecompressing(false);
    setError("");
    replaceResult(null);
    setProgress({ percent: 0, stage: "" });
  };

  const reset = useCallback(() => {
    setFile(null);
    setOriginalFile(null);
    replaceResult(null);
    setError("");
    setLevelIdx(1);
    setRecompressing(false);
    setProgress({ percent: 0, stage: "" });
    setJobId(null);
    clearPendingJob();
    clearCompletedJob();
    void releaseWakeLock();
    if (inputRef.current) inputRef.current.value = "";
  }, [clearCompletedJob, clearPendingJob, releaseWakeLock, replaceResult]);

  return (
    <div className="compress-tool">
      {!file ? (
        <div
          className={`compress-dropzone ${dragOver ? "drag-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="dropzone-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 3v13m0 0-4-4m4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="dropzone-main">Drop your PDF here</p>
          <p className="dropzone-sub">or click to browse</p>
          <input ref={inputRef} type="file" accept=".pdf" hidden onChange={onPickFile} />
        </div>
      ) : (
        <div className="compress-body">
          {recompressing && (
            <div className="recompress-notice">
              <span>
                You are recompressing an already-compressed file ({fmtSize(file?.size)}). The original file was{" "}
                {fmtSize(originalFile?.size)}.
              </span>
              <button className="recompress-cancel" onClick={cancelRecompress} title="Cancel" disabled={loading}>
                x
              </button>
            </div>
          )}

          <div className="file-info-row">
            <div className="file-info-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h4" />
              </svg>
            </div>
            <div className="file-info-text">
              <span className="file-info-name">{file.name}</span>
              <span className="file-info-size">{fmtSize(file.size)}</span>
            </div>
            <button className="file-change-btn" onClick={reset} disabled={loading}>
              Change
            </button>
          </div>

          {loading && <ProgressCard progress={progress} />}

          {result && (
            <div ref={resultRef} className="compress-result-panel">
              <div className="compress-result-header">
                <div>
                  <p className="compress-result-eyebrow">Compression complete</p>
                  <h3 className="compress-result-title">{result.filename}</h3>
                </div>
                <button className="compress-result-link" onClick={download}>
                  Download now
                </button>
              </div>

              <SizeDisplay
                original={originalFile ? originalFile.size : file.size}
                actual={result.size}
                recompressed={recompressing}
              />
            </div>
          )}

          {!result && (
            <div className="level-section">
              <div className="level-header">
                <span className="level-title">Compression level</span>
                {jobId && <span className="level-meta">Job active</span>}
              </div>

              <div className="level-chips">
                {LEVELS.map((item, index) => (
                  <button
                    key={item.id}
                    className={`level-chip ${index === levelIdx ? "active" : ""}`}
                    onClick={() => setLevelIdx(index)}
                    disabled={loading}
                  >
                    <span className="chip-label">{item.label}</span>
                    <span className="chip-desc">{item.desc}</span>
                  </button>
                ))}
              </div>

              <p className="level-note">
                Large files now show live upload and compression progress. If the file is still too large afterward,
                you can recompress to a higher level.
              </p>
            </div>
          )}

          {error && <div className="compress-error">{error}</div>}

          {!result ? (
            <div className="compress-btn-row">
              <button className="compress-btn" onClick={compress} disabled={loading}>
                {loading ? (
                  <>
                    <span className="compress-spinner" />
                    Compressing {progress.percent}%
                  </>
                ) : (
                  "Compress PDF"
                )}
              </button>
              {recompressing && !loading && (
                <button className="compress-btn cancel" onClick={cancelRecompress} title="Cancel recompress">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          ) : (
            <div className="result-actions">
              <div className="result-success">
                Compressed successfully - {Math.round((1 - result.size / file.size) * 100)}% smaller
              </div>
              <div className="result-btns">
                <button className="compress-btn download" onClick={download}>
                  Download
                </button>
                <button className="compress-btn recompress" onClick={recompress}>
                  Recompress to smaller size
                </button>
                <button className="compress-btn ghost" onClick={reset}>
                  Compress another
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
