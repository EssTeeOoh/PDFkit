import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import "./Toast.css";

const ToastContext = createContext(null);

let _nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
  }, []);

  const toast = useCallback((message, type = "info", duration = 3500) => {
    const id = ++_nextId;
    setToasts(prev => [...prev, { id, message, type, leaving: false }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const success = useCallback((msg, dur) => toast(msg, "success", dur), [toast]);
  const error   = useCallback((msg, dur) => toast(msg, "error",   dur || 5000), [toast]);
  const info    = useCallback((msg, dur) => toast(msg, "info",    dur), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, dismiss }}>
      {children}
      <div className="toast-portal">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type} ${t.leaving ? "toast-out" : "toast-in"}`}>
            <span className="toast-icon">
              {t.type === "success" && "✓"}
              {t.type === "error"   && "⚠"}
              {t.type === "info"    && "ℹ"}
            </span>
            <span className="toast-msg">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
