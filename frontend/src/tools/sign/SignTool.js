import React, { useState, useRef, useEffect, useCallback } from "react";
import { post } from "../../utils/http";
import "./SignTool.css";
import { useToast } from "../../components/Toast";
import { checkFileSize } from "../../hooks/useFileSizeLimit";
import { hapticTap, hapticSuccess, hapticError } from "../../utils/haptics";
import { reportFrontendError, trackToolAction } from "../../utils/telemetry";
import { apiUrl } from "../../config/api";
import { getFriendlyApiError } from "../../utils/apiErrors";

/* ─── helpers ──────────────────────────────────────────────────────────────── */
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
    return `${stem}_signed.pdf`;
  }
  return "signed.pdf";
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function resizeDataUrl(dataUrl, maxDimension = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not prepare image for upload."));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = () => reject(new Error("Could not read image file."));
    image.src = dataUrl;
  });
}

const TYPED_FONTS = [
  { label: "Cursive",     value: "'Dancing Script', cursive" },
  { label: "Elegant",     value: "'Great Vibes', cursive" },
  { label: "Script",      value: "'Pacifico', cursive" },
  { label: "Handwritten", value: "'Caveat', cursive" },
];

let _nextId = 1;
const nextId = () => String(_nextId++);

const HANDLE_SIZE = 8;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const DEFAULT_TEXT_STYLE = {
  font_size: 12,
  font_weight: 400,
  font_style: "normal",
  color: "#1a1a2e",
};
const TEXT_COLORS = [
  { label: "Ink", value: "#1a1a2e" },
  { label: "Slate", value: "#475569" },
  { label: "Blue", value: "#1d4ed8" },
  { label: "Green", value: "#166534" },
  { label: "Red", value: "#991b1b" },
];

function getHandleOffset(item, h) {
  const { width: w, height: ht } = item;
  const hx = h.includes("w") ? 0 : h.includes("e") ? w : w / 2;
  const hy = h.includes("n") ? 0 : h.includes("s") ? ht : ht / 2;
  return { x: hx, y: hy };
}

function cursorForHandle(h) {
  return {
    nw: "nw-resize", n: "n-resize", ne: "ne-resize", e: "e-resize",
    se: "se-resize", s: "s-resize", sw: "sw-resize", w: "w-resize",
  }[h] || "default";
}

function normalizeTextStyle(item = {}) {
  return {
    font_size: item.font_size ?? DEFAULT_TEXT_STYLE.font_size,
    font_weight: item.font_weight ?? DEFAULT_TEXT_STYLE.font_weight,
    font_style: item.font_style || DEFAULT_TEXT_STYLE.font_style,
    color: item.color || DEFAULT_TEXT_STYLE.color,
  };
}

function extractInitials(text) {
  const parts = String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  return parts
    .map(part => part[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function formatToday() {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date());
}

function TextFormatBar({ item, contentValue, onApplyPatch, onApplyContent }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  if (!item) return null;

  const current = normalizeTextStyle(item);
  const isBold = Number(current.font_weight) >= 600;
  const isItalic = String(current.font_style).toLowerCase() === "italic";
  const textValue = contentValue ?? item.content;
  const hasContent = Boolean(String(textValue || "").trim());

  const setStyle = (patch) => {
    onApplyPatch(patch);
  };

  return (
    <div className="text-format-bar" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={`text-format-btn ${isBold ? "active" : ""}`}
        title="Bold"
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        onClick={() => setStyle({ font_weight: isBold ? 400 : 700 })}
      >
        B
      </button>
      <button
        type="button"
        className={`text-format-btn ${isItalic ? "active" : ""}`}
        title="Italic"
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        onClick={() => setStyle({ font_style: isItalic ? "normal" : "italic" })}
      >
        I
      </button>
      <div className="text-color-wrap">
        <button
          type="button"
          className="text-format-btn text-color-btn"
          title="Text color"
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={() => setPaletteOpen((open) => !open)}
        >
          <span className="text-color-dot" style={{ backgroundColor: current.color }} />
        </button>
        {paletteOpen && (
          <div className="text-color-popover">
            {TEXT_COLORS.map(color => (
              <button
                key={color.value}
                type="button"
                className={`text-color-swatch ${current.color === color.value ? "active" : ""}`}
                style={{ backgroundColor: color.value }}
                title={color.label}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                onClick={() => {
                  setStyle({ color: color.value });
                  setPaletteOpen(false);
                }}
              />
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className="text-format-btn text-format-action"
        title={hasContent ? "Convert typed name to initials" : "Type a name first to use initials"}
        disabled={!hasContent}
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        onClick={() => {
          const initials = extractInitials(textValue);
          if (initials) onApplyContent(initials);
        }}
      >
        Initials
      </button>
      <button
        type="button"
        className="text-format-btn text-format-action"
        title="Insert today's date"
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.preventDefault()}
        onClick={() => onApplyContent(formatToday())}
      >
        Date
      </button>
    </div>
  );
}

/* ─── DrawPad ───────────────────────────────────────────────────────────────── */
function DrawPad({ onSave }) {
  const canvasRef = useRef();
  const drawing   = useRef(false);
  const lastPos   = useRef(null);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e, canvasRef.current);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pos    = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.stroke();
    lastPos.current = pos;
  };
  const stop  = () => { drawing.current = false; };
  const clear = () => canvasRef.current.getContext("2d").clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

  return (
    <div className="drawpad-wrap">
      <canvas ref={canvasRef} width={460} height={140} className="drawpad-canvas"
        onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop}
        onTouchStart={start} onTouchMove={move} onTouchEnd={stop} />
      <div className="drawpad-actions">
        <button className="btn-ghost small" onClick={clear}>Clear</button>
        <button className="btn-primary small" onClick={() => onSave(canvasRef.current.toDataURL("image/png"))}>
          Use Signature
        </button>
      </div>
    </div>
  );
}

/* ─── TypePad ───────────────────────────────────────────────────────────────── */
function TypePad({ onSave }) {
  const [text, setText] = useState("");
  const [font, setFont] = useState(TYPED_FONTS[0].value);
  const canvasRef = useRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!text) return;
    ctx.font         = `42px ${font}`;
    ctx.fillStyle    = "#1a1a2e";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 20, canvas.height / 2);
  }, [text, font]);

  return (
    <div className="typepad-wrap">
      <div className="typepad-font-row">
        {TYPED_FONTS.map(f => (
          <button key={f.value} className={`font-chip ${font === f.value ? "active" : ""}`}
            style={{ fontFamily: f.value }} onClick={() => setFont(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      <input className="typepad-input" style={{ fontFamily: font }}
        placeholder="Type your name…" value={text}
        onChange={e => setText(e.target.value)} maxLength={60} />
      <canvas ref={canvasRef} width={460} height={80} style={{ display: "none" }} />
      <div className="drawpad-actions">
        <button className="btn-primary small"
          onClick={() => onSave(canvasRef.current.toDataURL("image/png"))}
          disabled={!text.trim()}>
          Use Signature
        </button>
      </div>
    </div>
  );
}

/* ─── SignaturePicker modal ─────────────────────────────────────────────────── */
function SignaturePicker({ onSelect, onClose }) {
  const [tab, setTab] = useState("draw");
  return (
    <div className="sig-picker-overlay" onClick={onClose}>
      <div className="sig-picker" onClick={e => e.stopPropagation()}>
        <div className="sig-picker-header">
          <span>Create Signature</span>
          <button className="sig-picker-close" onClick={onClose}>✕</button>
        </div>
        <div className="sig-tabs">
          <button className={`sig-tab ${tab === "draw" ? "active" : ""}`} onClick={() => setTab("draw")}>Draw</button>
          <button className={`sig-tab ${tab === "type" ? "active" : ""}`} onClick={() => setTab("type")}>Type</button>
        </div>
        {tab === "draw"
          ? <DrawPad onSave={img => { onSelect(img); onClose(); }} />
          : <TypePad onSave={img => { onSelect(img); onClose(); }} />}
      </div>
    </div>
  );
}

/* --- PdfPageRenderer ---------------------------------------------------------- */
function PdfPageRenderer({ file, pageNumber, width }) {
  const canvasRef = useRef();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    const loadPdfJs = () => new Promise((resolve, reject) => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";
        resolve(window.pdfjsLib);
        return;
      }

      const script = document.createElement("script");
      script.src = "/pdfjs/pdf.min.js";
      script.onload = () => {
        if (!window.pdfjsLib) {
          reject(new Error("PDF.js failed to initialize."));
          return;
        }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error("Could not load local PDF.js assets."));
      document.head.appendChild(script);
    });

    const render = async () => {
      try {
        const pdfjsLib = await loadPdfJs();
        const arrayBuffer = await file.arrayBuffer();
        if (cancelled) return;
        const pdf  = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 1 });
        const scale    = width / viewport.width;
        const scaled   = page.getViewport({ scale });
        const canvas   = canvasRef.current;
        if (!canvas) return;
        canvas.width  = scaled.width;
        canvas.height = scaled.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: scaled }).promise;
        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error("PDF render error:", err);
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    render();
    return () => { cancelled = true; };
  }, [file, pageNumber, width]);

  return (
    <>
      {loading && <div className="icanvas-pdf-loading">Rendering page...</div>}
      <canvas ref={canvasRef} className="icanvas-pdf-canvas" style={{ opacity: loading ? 0 : 1 }} />
    </>
  );
}


/* ─── InteractiveCanvas ─────────────────────────────────────────────────────── */
function InteractiveCanvas({ file, pageNumber, items, setItems, pageWidth, pageHeight, onSelectionChange, onWidthChange, onTextStyleChange }) {
  const [PREVIEW_W, setPREVIEW_W] = useState(794);
  const PREVIEW_H = Math.round(PREVIEW_W * (pageHeight / pageWidth));

  // Fill the container width exactly
  useEffect(() => {
    const parent = containerRef.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(entries => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 100) { setPREVIEW_W(w); if (onWidthChange) onWidthChange(w); }
    });
    ro.observe(parent);
    // Set immediately too
    const w = Math.floor(parent.getBoundingClientRect().width);
    if (w > 100) { setPREVIEW_W(w); if (onWidthChange) onWidthChange(w); }
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const containerRef  = useRef();
  const activeOp      = useRef(null);
  const selectedIdRef = useRef(null);
  const lastTap       = useRef(0);

  // All mutable state in refs so native touch listeners always see latest values
  const stateRef = useRef({});
  const [selectedId, _setSelectedId] = useState(null);
  const [editingId,  setEditingId]   = useState(null);
  const [editState,  setEditState]   = useState(null);

  const setSelectedId = (id) => {
    selectedIdRef.current = id;
    _setSelectedId(id);
    if (onSelectionChange) onSelectionChange(id);
  };

  // Update ref every render so touch handlers always call fresh logic
  stateRef.current = { items, setItems, editingId, editState, setEditingId, setEditState, setSelectedId, PREVIEW_W, PREVIEW_H };

  // ── Helpers (read from stateRef so they're always fresh) ──────────────────
  const getRelPos = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : (e.changedTouches ? e.changedTouches[0] : e);
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const hitTest = (pos) => {
    const { items: its } = stateRef.current;
    for (let i = its.length - 1; i >= 0; i--) {
      const item = its[i];
      if (item.id !== selectedIdRef.current) continue;
      for (const h of HANDLES) {
        const off = getHandleOffset(item, h);
        const hx  = item.x + off.x - HANDLE_SIZE / 2;
        const hy  = item.y + off.y - HANDLE_SIZE / 2;
        if (pos.x >= hx && pos.x <= hx + HANDLE_SIZE && pos.y >= hy && pos.y <= hy + HANDLE_SIZE)
          return { itemId: item.id, mode: `resize-${h}` };
      }
    }
    for (let i = its.length - 1; i >= 0; i--) {
      const item = its[i];
      if (pos.x >= item.x && pos.x <= item.x + item.width &&
          pos.y >= item.y && pos.y <= item.y + item.height)
        return { itemId: item.id, mode: "move" };
    }
    return null;
  };

  const commitEdit = () => {
    const { editState: es, editingId: eid, setItems: si } = stateRef.current;
    if (!es || !eid) return;
    si(prev => prev.map(it => it.id === eid ? { ...it, content: es.content } : it));
    stateRef.current.setEditingId(null);
    stateRef.current.setEditState(null);
  };

  const updateEditingItem = useCallback((patch, syncContent = false) => {
    const { editingId: eid, setItems: si, setEditState: se, items: its } = stateRef.current;
    if (!eid) return;
    si(prev => prev.map(it => it.id === eid ? { ...it, ...patch } : it));
    if (syncContent && Object.prototype.hasOwnProperty.call(patch, "content")) {
      se(prev => (prev ? { ...prev, content: patch.content } : prev));
    }
    if (onTextStyleChange) {
      const current = its.find(it => it.id === eid) || {};
      const next = { ...normalizeTextStyle(current), ...patch };
      onTextStyleChange(normalizeTextStyle(next));
    }
  }, [onTextStyleChange]);

  const pointerDown = (e) => {
    const { editingId: eid, items: its } = stateRef.current;
    if (eid) { commitEdit(); return; }
    const pos = getRelPos(e);
    const hit = hitTest(pos);
    if (!hit) { stateRef.current.setSelectedId(null); activeOp.current = null; return; }
    const item = its.find(it => it.id === hit.itemId);
    if (!item) return;
    stateRef.current.setSelectedId(hit.itemId);
    const src0 = e.touches ? e.touches[0] : e;
    activeOp.current = { itemId: hit.itemId, mode: hit.mode, startMouse: { x: src0.clientX, y: src0.clientY }, startItem: { ...item }, moved: false };
    e.preventDefault();
    e.stopPropagation();
  };

  const pointerMove = (e) => {
    if (!activeOp.current) return;
    activeOp.current.moved = true;
    const { itemId, mode, startMouse, startItem } = activeOp.current;
    const { PREVIEW_W: pw, PREVIEW_H: ph } = stateRef.current;
    const src = e.touches ? e.touches[0] : e;
    const dx = src.clientX - startMouse.x;
    const dy = src.clientY - startMouse.y;
    const MIN = 8;
    stateRef.current.setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      if (mode === "move") return { ...item, x: Math.max(0, Math.min(pw - item.width, startItem.x + dx)), y: Math.max(0, Math.min(ph - item.height, startItem.y + dy)) };
      let { x, y, width, height } = startItem;
      const dir = mode.replace("resize-", "");
      if (dir.includes("e")) width  = Math.max(MIN, startItem.width  + dx);
      if (dir.includes("s")) height = Math.max(MIN, startItem.height + dy);
      if (dir.includes("w")) { const nw = Math.max(MIN, startItem.width  - dx); x = startItem.x + startItem.width  - nw; width  = nw; }
      if (dir.includes("n")) { const nh = Math.max(MIN, startItem.height - dy); y = startItem.y + startItem.height - nh; height = nh; }
      x = Math.max(0, x); y = Math.max(0, y);
      width = Math.min(pw - x, width); height = Math.min(ph - y, height);
      return { ...item, x, y, width, height };
    }));
  };

  const pointerUp = () => { activeOp.current = null; };

  const openEditor = (pos) => {
    const { items: its } = stateRef.current;
    const hit = hitTest(pos);
    if (!hit) return;
    const item = its.find(it => it.id === hit.itemId);
    if (item?.type === "text") {
      stateRef.current.setEditingId(item.id);
      stateRef.current.setEditState({ content: item.content || "" });
    }
  };

  // ── Native touch listeners ────────────────────────────────────────────────
  // touchstart is passive:false so we can preventDefault immediately on hits,
  // giving zero-latency drag. We only preventDefault when finger hits an item.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ts = (e) => {
      const pos = getRelPos(e);
      const hit = hitTest(pos);
      if (hit) {
        // Finger landed on an item — block scroll immediately for zero latency
        e.preventDefault();
      }
      const now = Date.now();
      if (now - lastTap.current < 300) {
        openEditor(pos);
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      pointerDown(e);
    };
    const tm = (e) => {
      if (activeOp.current) e.preventDefault();
      pointerMove(e);
    };
    const te = () => pointerUp();
    el.addEventListener("touchstart", ts, { passive: false });
    el.addEventListener("touchmove",  tm, { passive: false });
    el.addEventListener("touchend",   te, { passive: true });
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove",  tm);
      el.removeEventListener("touchend",   te);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps



  // Mouse handlers just call the same shared logic
  const onMouseDown   = (e) => pointerDown(e);
  const onMouseMove   = (e) => pointerMove(e);
  const onMouseUp     = ()  => pointerUp();
  const onDoubleClick = (e) => openEditor(getRelPos(e));



  return (
    <div
      ref={containerRef}
      className="icanvas"
      style={{ width: PREVIEW_W, height: PREVIEW_H }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onDoubleClick={onDoubleClick}
    >
      <PdfPageRenderer file={file} pageNumber={pageNumber} width={PREVIEW_W} />

      {items.map(item => {
        const isSel     = selectedId === item.id;
        const isEditing = editingId  === item.id;
        const textStyle = normalizeTextStyle(item);

        return (
          <div key={item.id}
            className={`icanvas-item ${isSel ? "selected" : ""}`}
            style={{ left: item.x, top: item.y, width: item.width, height: item.height }}>

            {/* image items */}
            {(item.type === "signature" || item.type === "photo") && (
              <img
                src={item.image_data}
                alt={item.type === "photo" ? "photo" : "sig"}
                className={`icanvas-sig-img ${item.type === "photo" ? "icanvas-photo-img" : ""}`}
                draggable={false}
              />
            )}

            {/* checkmark — scales with box size */}
            {item.type === "checkbox" && (
              <div className="icanvas-checkmark-item"
                style={{ fontSize: Math.min(item.width, item.height) * 0.8 }}>
                ✓
              </div>
            )}

            {/* text preview */}
            {item.type === "text" && !isEditing && (
              <div
                className="icanvas-text-preview"
                style={{
                  fontSize: textStyle.font_size,
                  fontWeight: textStyle.font_weight,
                  fontStyle: textStyle.font_style,
                  color: textStyle.color,
                  lineHeight: 1,
                }}
              >
                {item.content || <span className="icanvas-placeholder">dbl-click</span>}
              </div>
            )}

            {/* text editor */}
            {item.type === "text" && isEditing && (
              <div className="icanvas-edit-wrap"
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
              >
                <TextFormatBar
                  item={item}
                  contentValue={editState.content}
                  onApplyPatch={(patch) => updateEditingItem(patch, false)}
                  onApplyContent={(content) => updateEditingItem({ content }, true)}
                />
                <textarea
                  className="icanvas-textarea"
                  autoFocus
                  value={editState.content}
                  style={{
                    fontSize: textStyle.font_size,
                    fontWeight: textStyle.font_weight,
                    fontStyle: textStyle.font_style,
                    color: textStyle.color,
                    lineHeight: 1,
                  }}
                  onChange={e => stateRef.current.setEditState(prev => ({ ...prev, content: e.target.value }))}
                  onBlur={commitEdit}
                  onKeyDown={e => { if (e.key === "Escape") commitEdit(); }}
                />
              </div>
            )}



            {/* resize handles — corners only for checkbox, all for others */}
            {isSel && (item.type === "checkbox" ? ["nw","ne","se","sw"] : HANDLES).map(h => {
              const off = getHandleOffset(item, h);
              const hs  = item.type === "checkbox" ? 8 : HANDLE_SIZE;
              return (
                <div key={h} className="icanvas-handle"
                  style={{
                    left: off.x - hs / 2,
                    top:  off.y - hs / 2,
                    width: hs,
                    height: hs,
                    cursor: cursorForHandle(h),
                  }} />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Zoom Hint ─────────────────────────────────────────────────────────────── */


/* ─── TipsBox ────────────────────────────────────────────────────────────────── */
function TipsBox() {
  const [open, setOpen] = useState(false);
  return (
    <div className="tips-box">
      <button className="tips-toggle" onClick={() => setOpen(o => !o)}>
        
        <span className="tips-title">Tips for accurate placement</span>
        <span className={`tips-chevron ${open ? "open" : ""}`}>▾</span>
      </button>
      {open && (
        <ul className="tips-list">
          <li><strong>Text boxes:</strong> place the <em>bottom edge</em> of the box slightly above the form line - text sits on that edge in the PDF.</li>
          <li><strong>Font size:</strong> use 10-12px for standard form fields. Resize the box to match the line height.</li>
          <li><strong>Checkmarks:</strong> resize the checkmark box to fit inside the checkbox on the form - it will be centered automatically.</li>
          <li><strong>Signatures:</strong> drag and resize the signature box to fit the designated signature area.</li>
          <li><strong>Photos:</strong> upload a passport photograph or ID image, then drag and resize it into the correct frame.</li>
          <li><strong>Duplicate:</strong> place and size one item perfectly, then duplicate it to reuse the same size elsewhere.</li>
          <li><strong>Precision:</strong> the PDF output may shift by 1-2px - nudge your placement slightly to compensate if needed.</li>
        </ul>
      )}
    </div>
  );
}

/* ─── STEP 1 — Upload ───────────────────────────────────────────────────────── */
function StepUpload({ onAnalyzed }) {
  const [file, setFile]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleFile = (files) => {
    const f = files[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) { hapticError(); setError("Please select a PDF file."); return; }
    const sizeErr = checkFileSize(f);
    if (sizeErr) { hapticError(); setError(sizeErr); return; }
    setFile(f); setError(""); hapticTap();
  };

  const analyze = async () => {
    if (!file) { hapticError(); setError("Please select a PDF file."); return; }
    const formData = new FormData();
    formData.append("file", file);
    try {
      setLoading(true); setError("");
      const res = await post(apiUrl("/api/sign/analyze"), formData);
      hapticSuccess();
      trackToolAction("sign", "sign_analyze", "success");
      onAnalyzed(file, res.data);
    } catch (err) {
      const msg = await getFriendlyApiError(err, "We couldn't read that PDF. Please try another file or try again.", {
        networkMessage: "We couldn't connect right now. Please try again in a moment.",
        fileTooLargeMessage: "This file is too large to process. Please choose a smaller PDF and try again.",
      });
      setError(msg);
      hapticError();
      trackToolAction("sign", "sign_analyze", "error");
      reportFrontendError("sign_analyze_failed", err, { tool: "sign" });
    } finally { setLoading(false); }
  };

  return (
    <div className="sign-step">
      <div className="step-label">Step 1 — Upload PDF</div>
      <div
        className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-files" : ""}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files); }}
        onClick={() => inputRef.current.click()}
      >
        <input ref={inputRef} type="file" accept=".pdf" style={{ display: "none" }}
          onChange={e => handleFile(e.target.files)} />
        <div className="dropzone-inner">
          <div className="drop-icon">{dragging ? "↓" : file ? "✓" : "✦"}</div>
          <div className="drop-title">{file ? file.name : "Drop a PDF here"}</div>
          <div className="drop-sub">{file ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : "or click to browse"}</div>
        </div>
        <div className="dropzone-corner tl" /><div className="dropzone-corner tr" />
        <div className="dropzone-corner bl" /><div className="dropzone-corner br" />
      </div>
      {error && <div className="status-bar error"><span>⚠</span> {error}</div>}
      <div className="action-row">
        {file && <button className="btn-ghost" onClick={() => { setFile(null); setError(""); }}>Clear</button>}
        <button className={`btn-primary ${loading ? "loading" : ""}`} onClick={analyze} disabled={loading || !file}>
          {loading ? <><span className="spinner" /> Analyzing…</> : <>Analyze PDF →</>}
        </button>
      </div>
    </div>
  );
}

/* ─── STEP 2 — Fill & Sign ──────────────────────────────────────────────────── */
function StepSign({ file, analysis, onBack }) {
  const { page_count, has_fields, fields, page_dimensions } = analysis;
  const [PREVIEW_W, setPREVIEW_W_outer] = useState(794);

  // ── Draft restore ────────────────────────────────────────────────────
  const DRAFT_KEY   = "pdfkit-sign-draft";
  // A lightweight fingerprint: filename + size + page count. Not cryptographic —
  // just enough to avoid restoring a draft onto the wrong PDF.
  const fileFingerprint = `${file.name}|${file.size}|${page_count}`;
  const [draftBanner, setDraftBanner] = useState(() => {
    try {
      const raw = localStorage.getItem("pdfkit-sign-draft");
      if (!raw) return null;
      const { ts, fingerprint } = JSON.parse(raw);
      // Only offer restore if draft is less than 7 days old AND same file
      if (fingerprint !== `${file.name}|${file.size}|${page_count}`) return null;
      if (Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return ts;
    } catch { /* ignore */ }
    return null;
  });

  const historyRef  = useRef([]);   // array of {pageItems snapshots}
  const historyIdx  = useRef(-1);   // pointer into historyRef

  const pushHistory = useCallback((snapshot) => {
    // Trim any redo states ahead of current pointer
    historyRef.current = historyRef.current.slice(0, historyIdx.current + 1);
    historyRef.current.push(snapshot);
    // Keep at most 50 history entries
    if (historyRef.current.length > 50) historyRef.current.shift();
    historyIdx.current = historyRef.current.length - 1;
  }, []);

  const restoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem("pdfkit-sign-draft");
      if (!raw) return;
      const { pageItems: saved, fieldValues: savedFields } = JSON.parse(raw);
      setPageItems(saved);
      pushHistory(saved);
      if (savedFields) setFieldValues(savedFields);
    } catch { /* ignore */ }
    setDraftBanner(null);
  }, [pushHistory]);

  const dismissDraft = useCallback(() => {
    try { localStorage.removeItem("pdfkit-sign-draft"); } catch { /* ignore */ }
    setDraftBanner(null);
  }, []);

  const undo = useCallback(() => {
    if (historyIdx.current <= 0) return;
    historyIdx.current -= 1;
    setPageItems(historyRef.current[historyIdx.current]);
  }, []);

  const redo = useCallback(() => {
    if (historyIdx.current >= historyRef.current.length - 1) return;
    historyIdx.current += 1;
    setPageItems(historyRef.current[historyIdx.current]);
  }, []);

  const canUndo = historyIdx.current > 0;
  const canRedo = historyIdx.current < historyRef.current.length - 1;

  const [fieldValues,   setFieldValues]   = useState(() => {
    const init = {};
    (fields || []).forEach(f => { init[f.field_id] = ""; });
    return init;
  });

  const [activePage,    setActivePage]    = useState(1);
  const [pageItems,     setPageItems]     = useState({});
  const [sigImage,      setSigImage]      = useState(null);
  const [photoImage,    setPhotoImage]    = useState(null);
  const [sigPickerOpen, setSigPickerOpen] = useState(false);
  const [globalFontSize, setGlobalFontSize] = useState(12);
  const [defaultTextStyle, setDefaultTextStyle] = useState(DEFAULT_TEXT_STYLE);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const photoInputRef = useRef(null);

  const [loading,       setLoading]       = useState(false);
  const { success: toastSuccess } = useToast();
  const [error,         setError]         = useState("");
  const [success,       setSuccess]       = useState(false);

  const pageDim  = page_dimensions?.find(p => p.page === activePage) || { width: 612, height: 792 };
  const currentItems   = pageItems[activePage] || [];
  const setCurrentItems = useCallback((updater) => {
    setPageItems(prev => {
      const next = {
        ...prev,
        [activePage]: typeof updater === "function" ? updater(prev[activePage] || []) : updater,
      };
      pushHistory(next);
      return next;
    });
  }, [activePage, pushHistory]);

  // ── Auto-save draft every 30 seconds ────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        // Only save if there are items placed — don't overwrite a real draft with empty
        const total = Object.values(pageItems).reduce((s, arr) => s + arr.length, 0);
        const hasFieldValues = Object.values(fieldValues).some(v => v !== "");
        if (total > 0 || hasFieldValues) {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ pageItems, fieldValues, ts: Date.now(), fingerprint: fileFingerprint }));
        }
      } catch { /* localStorage full or unavailable */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [pageItems, fieldValues, DRAFT_KEY, fileFingerprint]);

  // Clear draft on successful sign & download
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  }, [DRAFT_KEY]);

  // Keyboard undo/redo
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // px input always shows globalFontSize — changing it updates both global and selected item
  const selectedItem = currentItems.find(it => it.id === selectedItemId && it.type === "text");
  const selectedTextStyle = selectedItem ? normalizeTextStyle(selectedItem) : defaultTextStyle;

  const handleFontSizeChange = (val) => {
    const size = Math.min(40, Math.max(6, Number(val)));
    setGlobalFontSize(size);
    setDefaultTextStyle(prev => ({ ...prev, font_size: size }));
    if (selectedItem) {
      setCurrentItems(prev => prev.map(it => it.id === selectedItemId ? { ...it, font_size: size } : it));
    }
  };

  const addTextBox = () => {
    const baseStyle = selectedItem ? normalizeTextStyle(selectedItem) : selectedTextStyle;
    const fs = baseStyle.font_size || globalFontSize || 12;
    setCurrentItems(prev => [...(prev || []), {
      id: nextId(), type: "text",
      x: 40, y: 40, width: 160, height: Math.round(fs * 1.6),
      content: "",
      font_size: fs,
      font_weight: baseStyle.font_weight,
      font_style: baseStyle.font_style,
      color: baseStyle.color,
    }]);
  };

  const addSignature = () => {
    if (!sigImage) { setSigPickerOpen(true); return; }
    setCurrentItems(prev => [...(prev || []), {
      id: nextId(), type: "signature",
      x: 60, y: 60, width: 180, height: 60,
      image_data: sigImage,
    }]);
    hapticTap();
  };

  const placePhoto = useCallback((imageData) => {
    setCurrentItems(prev => [...(prev || []), {
      id: nextId(), type: "photo",
      x: 60, y: 60, width: 120, height: 150,
      image_data: imageData,
    }]);
    hapticTap();
  }, [setCurrentItems]);

  const addPhoto = () => {
    if (photoImage) {
      placePhoto(photoImage);
      return;
    }
    photoInputRef.current?.click();
  };

  const handlePhotoFile = async (event) => {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;
    if (!nextFile.type.startsWith("image/")) {
      setError("Please choose an image file for the photo.");
      hapticError();
      event.target.value = "";
      return;
    }

    try {
      const imageData = await readFileAsDataUrl(nextFile);
      const compressed = await resizeDataUrl(imageData);
      setPhotoImage(compressed);
      setError("");
      placePhoto(compressed);
    } catch {
      setError("We couldn't read that image. Please try another one.");
      hapticError();
    } finally {
      event.target.value = "";
    }
  };

  const addCheckbox = () => {
    setCurrentItems(prev => [...(prev || []), {
      id: nextId(), type: "checkbox",
      x: 40, y: 40, width: 28, height: 28,
    }]);
  };

  const duplicateSelected = () => {
    if (!selectedItemId) return;
    const item = currentItems.find(it => it.id === selectedItemId);
    if (!item) return;
    // Clear content for text boxes — duplicate the size/position only
    const copy = { ...item, id: nextId(), x: item.x + 12, y: item.y + 12 };
    if (copy.type === "text") copy.content = "";
    setCurrentItems(prev => [...(prev || []), copy]);
  };

  const deleteSelected = () => {
    if (!selectedItemId) return;
    setCurrentItems(prev => prev.filter(it => it.id !== selectedItemId));
    setSelectedItemId(null);
  };

  const buildAnnotations = () => {
    const ann = [];
    Object.entries(pageItems).forEach(([pageNum, items]) => {
      const pNum = Number(pageNum);
      const dim  = page_dimensions?.find(p => p.page === pNum) || { width: 612, height: 792 };
      const pH   = Math.round(PREVIEW_W * (dim.height / dim.width));
      items.forEach(item => {
        ann.push({
          type: item.type === "photo" ? "signature" : item.type, page: pNum,
          x: item.x, y: item.y,
          width: item.width, height: item.height,
          content: item.type === "checkbox" ? "\u2713" : (item.content || ""),
          font_size: item.font_size || 12,
          font_weight: item.font_weight ?? DEFAULT_TEXT_STYLE.font_weight,
          font_style: item.font_style || DEFAULT_TEXT_STYLE.font_style,
          color: item.color || DEFAULT_TEXT_STYLE.color,
          image_data: item.image_data || null,
          preview_width: PREVIEW_W,
          preview_height: pH,
        });
      });
    });
    return ann;
  };

  const submit = async () => {
    const hasFieldValues = Object.values(fieldValues).some(v => v !== "");
    const annotations    = buildAnnotations();
    if (!hasFieldValues && annotations.length === 0) {
      setError("Nothing to apply — add text, a signature, a photo, or fill a field."); return;
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("field_values", JSON.stringify(fieldValues));
    formData.append("annotations",  JSON.stringify(annotations));
    try {
      setLoading(true); setError("");
      const res = await post(apiUrl("/api/sign/apply"), formData, {
        responseType: "blob", headers: { Accept: "*/*" },
      });
      const downloadName = getFilenameFromResponse(res.headers, file.name);
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href  = url; link.setAttribute("download", downloadName);
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(url);
      setSuccess(true);
      clearDraft();
      hapticSuccess();
      trackToolAction("sign", "sign_apply", "success", { annotations: annotations.length });
      toastSuccess("Signed PDF downloaded!");
    } catch (err) {
      console.debug("[sign/apply] debug status:", err?.response?.status);
      console.debug("[sign/apply] debug raw data:", err?.response?.data);
      const msg = await getFriendlyApiError(err, "We couldn't finish signing that PDF. Please try again.", {
        networkMessage: "We couldn't connect right now. Please try again in a moment.",
        fileTooLargeMessage: "This file is too large to process. Please choose a smaller PDF and try again.",
      });
      setError(msg);
      hapticError();
      trackToolAction("sign", "sign_apply", "error", { annotations: annotations.length });
      reportFrontendError("sign_apply_failed", msg, {
        tool: "sign",
        annotations: annotations.length,
        backend_detail: msg,
      });
    } finally { setLoading(false); }
  };

  const fieldTypeLabel = (type) =>
    ({ text: "Text", checkbox: "Checkbox", radio_group: "Radio", choice: "Dropdown" }[type] || type);

  const totalItems = Object.values(pageItems).reduce((s, arr) => s + arr.length, 0);
  const pageOptions = Array.from({ length: page_count }, (_, i) => i + 1);

  return (
    <div className="sign-step">
      <div className="step-header">
        <button className="btn-ghost small" onClick={onBack}>← Back</button>
        <div className="step-label" style={{ margin: 0 }}>
          Step 2 — Fill &amp; Sign
          <span className="page-badge">{page_count} page{page_count !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* AcroForm fields */}
      {has_fields && (
        <section className="sign-section">
          <div className="section-title">Form Fields</div>
          <div className="fields-list">
            {fields.map(f => (
              <div key={f.field_id} className="field-row">
                <label className="field-label">
                  <span className="field-name">{f.field_id}</span>
                  <span className="field-type-badge">{fieldTypeLabel(f.type)}</span>
                </label>
                {f.type === "checkbox" && (
                  <label className="checkbox-wrap">
                    <input type="checkbox"
                      checked={fieldValues[f.field_id] === (f.checked_value || "Yes")}
                      onChange={e => setFieldValues(prev => ({
                        ...prev,
                        [f.field_id]: e.target.checked ? (f.checked_value || "Yes") : (f.unchecked_value || "Off"),
                      }))} />
                    <span className="checkbox-label">Check</span>
                  </label>
                )}
                {f.type === "radio_group" && (
                  <div className="radio-group">
                    {(f.radio_options || []).map((opt, i) => {
                      const val = typeof opt === "object" ? (opt.value ?? String(i)) : String(opt);
                      return (
                        <label key={val} className="radio-opt">
                          <input type="radio" name={f.field_id} value={val}
                            checked={fieldValues[f.field_id] === val}
                            onChange={() => setFieldValues(prev => ({ ...prev, [f.field_id]: val }))} />
                          <span>{val}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {(f.type === "text" || f.type === "choice") && (
                  <input className="field-input" type="text"
                    placeholder={`Enter ${f.type === "choice" ? "value" : "text"}…`}
                    value={fieldValues[f.field_id] || ""}
                    onChange={e => setFieldValues(prev => ({ ...prev, [f.field_id]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Canvas section */}
      <section className="sign-section">
        <div className="section-title">
          Place Text, Signature &amp; Photo
          {totalItems > 0 && (
            <span className="items-badge">{totalItems} item{totalItems !== 1 ? "s" : ""}</span>
          )}
        </div>

        {/* toolbar */}
        <div className="canvas-toolbar">
          <div className="canvas-toolbar-left">
            <button className="toolbar-btn" onClick={addTextBox}>＋ Text</button>
            <button className="toolbar-btn" onClick={addCheckbox}>✓ Check</button>
            <button className="toolbar-btn accent" onClick={addSignature}>
              {sigImage ? "＋ Sig" : "✦ Sign"}
            </button>
            {sigImage && (
              <button className="toolbar-btn ghost" onClick={() => setSigPickerOpen(true)}>✎</button>
            )}
            <button className="toolbar-btn" onClick={addPhoto}>
              {photoImage ? "＋ Insert Photo" : "▣ Insert Photo"}
            </button>
            {photoImage && (
              <button className="toolbar-btn ghost" onClick={() => photoInputRef.current?.click()}>Change Photo</button>
            )}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handlePhotoFile}
            />
            <div className="toolbar-font-size">
              <span className="toolbar-font-label">px</span>
              <input
                type="number" min="6" max="40"
                className="toolbar-font-input"
                value={globalFontSize}
                onChange={e => handleFontSizeChange(e.target.value)}
              />
            </div>
            {selectedItemId && (
              <div className="toolbar-selection-actions">
                <button className="toolbar-btn dup" onClick={duplicateSelected} title="Duplicate">⧉ Dup</button>
                <button className="toolbar-btn del" onClick={deleteSelected} title="Delete selected">🗑 Del</button>
              </div>
            )}
            <div className="toolbar-divider" />
            <button className="toolbar-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩ Undo</button>
            <button className="toolbar-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">↪ Redo</button>
          </div>
          {page_count > 1 && (
            <div className="canvas-toolbar-right">
              <div className="page-picker">
                {pageOptions.map(p => (
                  <button key={p}
                    className={`page-btn ${activePage === p ? "active" : ""}${(pageItems[p] || []).length > 0 ? " has-items" : ""}`}
                    onClick={() => setActivePage(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <TipsBox />

        {draftBanner && (
          <div className="draft-banner">
            <span>Unsaved draft found from a previous session.</span>
            <button className="draft-btn restore" onClick={restoreDraft}>Restore</button>
            <button className="draft-btn dismiss" onClick={dismissDraft}>Discard</button>
          </div>
        )}
        <div className="icanvas-wrap">
          <InteractiveCanvas
            file={file}
            pageNumber={activePage}
            items={currentItems}
            setItems={setCurrentItems}
            pageWidth={pageDim.width}
            pageHeight={pageDim.height}
            onSelectionChange={setSelectedItemId}
            onWidthChange={setPREVIEW_W_outer}
            onTextStyleChange={setDefaultTextStyle}
          />
        </div>

        {/* placed items summary */}

      </section>

      {error   && <div className="status-bar error"><span>⚠</span> {error}</div>}
      {success && <div className="status-bar success"><span>✓</span> Signed PDF downloaded!</div>}

      <div className="action-row">
        <button className={`btn-primary ${loading ? "loading" : ""}`} onClick={submit} disabled={loading}>
          {loading ? <><span className="spinner" /> Applying…</> : <>✦ Apply &amp; Download</>}
        </button>
      </div>

      {sigPickerOpen && (
        <SignaturePicker
          onSelect={img => { setSigImage(img); setSigPickerOpen(false); hapticTap(); }}
          onClose={() => setSigPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* ─── ROOT ──────────────────────────────────────────────────────────────────── */
export default function SignTool() {
  const [step,     setStep]     = useState("upload");
  const [file,     setFile]     = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const handleAnalyzed = (f, data) => { setFile(f); setAnalysis(data); setStep("sign"); };
  const handleBack     = () => { setStep("upload"); setFile(null); setAnalysis(null); };

  return (
    <div className="sign-tool">
      {step === "upload" && <StepUpload onAnalyzed={handleAnalyzed} />}
      {step === "sign"   && analysis && <StepSign file={file} analysis={analysis} onBack={handleBack} />}
    </div>
  );
}
