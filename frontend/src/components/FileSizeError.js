// src/components/FileSizeError.js
// Reusable error banner for file size violations

import React from "react";
import { MAX_FILE_MB } from "../hooks/useFileSizeLimit";
import "./FileSizeError.css";

export default function FileSizeError({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="file-size-error">
      <div className="fse-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
            strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="fse-text">
        <span className="fse-title">File too large</span>
        <span className="fse-msg">{message || `Maximum file size is ${MAX_FILE_MB} MB.`}</span>
      </div>
      {onDismiss && (
        <button className="fse-dismiss" onClick={onDismiss}>✕</button>
      )}
    </div>
  );
}