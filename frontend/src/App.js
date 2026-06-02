import { useState, useEffect, useCallback, useRef } from "react";
import { ToastProvider } from "./components/Toast";
import ErrorBoundary from "./components/ErrorBoundary";
import AdminTelemetryDashboard from "./components/AdminTelemetryDashboard";
import MergeTool from "./tools/merge/MergeTool";
import SplitTool from "./tools/split/SplitTool";
import ConvertTool from "./tools/convert/ConvertTool";
import SignTool from "./tools/sign/SignTool";
import CompressTool from "./tools/compress/CompressTool";
import { hapticSuccess } from "./utils/haptics";
import { reportFrontendError, trackToolView } from "./utils/telemetry";
import { apiUrl } from "./config/api";
import "./App.css";

const tools = [
  { id: "merge", label: "Merge", short: "MG", description: "Combine multiple PDF files into one document." },
  { id: "split", label: "Split", short: "SP", description: "Split pages by page, chunk, or custom range." },
  { id: "convert", label: "Convert", short: "CV", description: "Convert between PDF and Word formats." },
  { id: "sign", label: "Sign & Fill", short: "SF", description: "Add signatures, text, and checkmarks." },
  { id: "compress", label: "Compress", short: "CP", description: "Reduce file size with adjustable compression." },
];

const toolSummaries = {
  merge: "Merge documents, adjust ordering, and export a single PDF.",
  split: "Create page-by-page splits, fixed chunks, or targeted range exports.",
  convert: "Handle PDF and Word conversion with dependency-aware availability checks.",
  sign: "Place signatures and form content with undo, draft restore, and touch support.",
  compress: "Optimize large PDFs with clear compression levels and size comparison.",
};

const introHighlights = [
  {
    label: "Private by default",
    value: "Files stay in your own flow instead of a third-party queue.",
  },
  {
    label: "Built for careful work",
    value: "Dragging, annotating, signing, and resizing stay deliberate and tactile.",
  },
  {
    label: "Installable and fast",
    value: "Works like a desktop app without turning the page into a glossy ad.",
  },
];

const introSteps = [
  { title: "Drop in", text: "Bring a PDF or a scan and start from the first page." },
  { title: "Shape it", text: "Merge, split, reorder, convert, or compress with a few direct moves." },
  { title: "Finish", text: "Sign, fill, and export without losing your place or your files." },
];

const footerLinks = [
  { label: "Privacy Policy", href: "/privacy.html" },
  { label: "Terms of Use", href: "/terms.html" },
];

const creatorPortfolio = "https://teeooh.pythonanywhere.com";

function StatusItem({ label, value, tone = "default" }) {
  return (
    <div className={`status-item tone-${tone}`}>
      <span className="status-item-label">{label}</span>
      <strong className="status-item-value">{value}</strong>
    </div>
  );
}

export default function App() {
  const [showIntro, setShowIntro] = useState(() => localStorage.getItem("pdfkit-intro-dismissed") !== "1");
  const [rememberIntro, setRememberIntro] = useState(true);
  const [activeTool, setActiveTool] = useState(() => localStorage.getItem("pdfkit-last-tool") || "merge");
  const [adminMode, setAdminMode] = useState(() => window.location.hash === "#admin");
  const [canInstallApp, setCanInstallApp] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("pdfkit-theme");
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  const [offline, setOffline] = useState(false);
  const [libOk, setLibOk] = useState(true);
  const [healthReady, setHealthReady] = useState(false);
  const [hasHealthyBackend, setHasHealthyBackend] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const activeToolMeta = tools.find((tool) => tool.id === activeTool) || tools[0];
  const mainRef = useRef(null);
  const pullStartY = useRef(null);
  const pullArmed = useRef(false);
  const installPromptRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pdfkit-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      installPromptRef.current = event;
      setCanInstallApp(true);
    };

    const handleAppInstalled = () => {
      installPromptRef.current = null;
      setCanInstallApp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!showIntro && !adminMode) {
      trackToolView(activeTool);
    }
  }, [activeTool, showIntro, adminMode]);

  const handleSetTool = useCallback((id) => {
    setActiveTool(id);
    localStorage.setItem("pdfkit-last-tool", id);
  }, []);

  useEffect(() => {
    const onHashChange = () => setAdminMode(window.location.hash === "#admin");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const enterWorkspace = useCallback(() => {
    if (rememberIntro) {
      localStorage.setItem("pdfkit-intro-dismissed", "1");
    } else {
      localStorage.removeItem("pdfkit-intro-dismissed");
    }
    setShowIntro(false);
  }, [rememberIntro]);

  const checkBackendHealth = useCallback(async ({ fromPull = false } = {}) => {
    if (fromPull) setIsRefreshing(true);
    try {
      const response = await fetch(apiUrl("/health"));
      const data = await response.json();
      setOffline(false);
      setLibOk(data.libreoffice !== false);
      setHasHealthyBackend(true);
      setHealthReady(true);
      if (fromPull) hapticSuccess();
    } catch {
      setOffline(true);
      setHealthReady(true);
    } finally {
      if (fromPull) {
        setPullDistance(0);
        setTimeout(() => setIsRefreshing(false), 220);
      }
    }
  }, []);

  useEffect(() => {
    checkBackendHealth();
  }, [checkBackendHealth]);

  useEffect(() => {
    const onOnline = () => checkBackendHealth();
    const onOffline = () => {
      setOffline(true);
      setHealthReady(true);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [checkBackendHealth]);

  useEffect(() => {
    const onError = (event) => {
      reportFrontendError("window_error", event.error || event.message, {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    const onUnhandledRejection = (event) => {
      reportFrontendError("unhandled_rejection", event.reason, {});
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  const onMainTouchStart = useCallback((event) => {
    const main = mainRef.current;
    if (!main || isRefreshing) return;
    if (main.scrollTop > 0) {
      pullStartY.current = null;
      return;
    }
    pullStartY.current = event.touches[0].clientY;
    pullArmed.current = false;
  }, [isRefreshing]);

  const onMainTouchMove = useCallback((event) => {
    const main = mainRef.current;
    if (!main || pullStartY.current == null || main.scrollTop > 0 || isRefreshing) return;
    const delta = event.touches[0].clientY - pullStartY.current;
    if (delta <= 0) {
      setPullDistance(0);
      return;
    }
    const limited = Math.min(delta * 0.55, 88);
    setPullDistance(limited);
    pullArmed.current = limited > 56;
    if (limited > 6) event.preventDefault();
  }, [isRefreshing]);

  const onMainTouchEnd = useCallback(() => {
    if (isRefreshing) return;
    if (pullArmed.current) {
      checkBackendHealth({ fromPull: true });
    } else {
      setPullDistance(0);
    }
    pullStartY.current = null;
    pullArmed.current = false;
  }, [checkBackendHealth, isRefreshing]);

  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));
  const showShellOfflineState = healthReady && offline && !hasHealthyBackend;
  const handleInstallApp = useCallback(async () => {
    const promptEvent = installPromptRef.current;
    if (!promptEvent) return;

    promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
    installPromptRef.current = null;
    setCanInstallApp(false);
  }, []);
  const backendLabel = offline ? "Unavailable" : healthReady ? "Available" : "Checking";
  const themeLabel = theme === "dark" ? "Dark" : "Light";
  const appLabel = canInstallApp ? "Install ready" : "Web";

  if (adminMode) {
    return (
      <ToastProvider>
        <AdminTelemetryDashboard
          onBack={() => {
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
            setAdminMode(false);
          }}
        />
      </ToastProvider>
    );
  }

  if (showIntro) {
    return (
      <ToastProvider>
        <div className="app intro-app">
          <div className="grain" />

          {offline && (
            <div className="offline-banner">
              <span>Connection to the backend is unavailable.</span>
              <button onClick={() => checkBackendHealth()}>Retry</button>
            </div>
          )}

          <main className="intro-main">
            <section className="intro-hero">
              <div className="intro-kicker-row">
                <div className="intro-brand">
                  <div className="brand-mark">PK</div>
                  <div>
                    <div className="brand-name">PDFKit</div>
                    <div className="brand-tagline">Document toolkit</div>
                  </div>
                </div>
                <div className={`intro-status-badge ${offline ? "warn" : healthReady ? "good" : "pending"}`}>
                  {offline ? "Backend unavailable" : healthReady ? "Backend ready" : "Checking backend"}
                </div>
              </div>

              <div className="intro-copy">
                <p className="intro-eyebrow">Local-first PDF toolkit</p>
                <h1>Shape PDFs with a steadier workspace.</h1>
                <p className="intro-summary">
                  Merge, split, convert, sign, and compress without handing your documents to a third-party service.
                  PDFKit keeps the work local, the layout calm, and the controls close at hand.
                </p>
              </div>

              <div className="intro-actions">
                <button className="intro-primary" onClick={enterWorkspace}>
                  Open workspace
                </button>
                <button className="intro-secondary" onClick={enterWorkspace}>
                  Skip intro
                </button>
              </div>

              <label className="intro-remember">
                <input
                  type="checkbox"
                  checked={rememberIntro}
                  onChange={(event) => setRememberIntro(event.target.checked)}
                />
                <span>Don't show this intro again</span>
              </label>

              <div className="intro-author">
                <span>Created by</span>
                <a href={creatorPortfolio} target="_blank" rel="noreferrer">
                  Samuel Olu
                </a>
                <span className="intro-author-separator">-</span>
                <span className="intro-author-note">teeooh.pythonanywhere.com</span>
              </div>

              <div className="intro-ribbon" aria-label="PDFKit tool ribbon">
                <div className="intro-ribbon-track">
                  {[...tools, ...tools].map((tool, index) => (
                    <span key={`${tool.id}-${index}`} className="intro-ribbon-chip">
                      {tool.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="intro-highlights">
                {introHighlights.map((item) => (
                  <article key={item.label} className="intro-highlight-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </article>
                ))}
              </div>

              <div className="intro-footer-links">
                {footerLinks.map((link) => (
                  <a key={link.label} href={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            </section>

            <section className="intro-panel">
              <div className="intro-panel-mark" />
              <div className="intro-panel-line intro-panel-line-a" />
              <div className="intro-panel-line intro-panel-line-b" />

              <div className="intro-panel-shell">
                <div className="intro-panel-head">
                  <span>Workbench preview</span>
                  <span className="intro-panel-chip">Live motion</span>
                </div>

                <div className="intro-stage">
                  <div className="intro-stage-stack intro-stage-stack-top">
                    <span className="intro-stage-label">Document</span>
                    <strong>PDF source</strong>
                    <p>Clean inputs, controlled edits, and a visible path from start to export.</p>
                  </div>
                  <div className="intro-stage-stack intro-stage-stack-middle">
                    <span className="intro-stage-label">Action</span>
                    <strong>Tool moves</strong>
                    <p>Each tool acts like a deliberate desk gesture, not a generic dashboard widget.</p>
                  </div>
                  <div className="intro-stage-stack intro-stage-stack-bottom">
                    <span className="intro-stage-label">Output</span>
                    <strong>Ready file</strong>
                    <p>Signed, compressed, split, or merged with the paper trail still visible.</p>
                  </div>
                  <div className="intro-stage-scan" />
                </div>

                <div className="intro-step-rail">
                  {introSteps.map((step, index) => (
                    <article key={step.title} className="intro-step-card">
                      <span className="intro-step-index">0{index + 1}</span>
                      <h2>{step.title}</h2>
                      <p>{step.text}</p>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </main>
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="app">
        <div className="grain" />

        {offline && (
          <div className="offline-banner">
            <span>Connection to the backend is unavailable.</span>
            <button onClick={() => checkBackendHealth()}>Retry</button>
          </div>
        )}

        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="brand-mark">PK</div>
            <div>
              <div className="brand-name">PDFKit</div>
              <div className="brand-tagline">Document toolkit</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-label">Tools</div>
            {tools.map((tool) => (
              <button
                key={tool.id}
                className={`nav-item ${activeTool === tool.id ? "active" : ""} ${tool.disabled ? "disabled" : ""}`}
                onClick={() => !tool.disabled && handleSetTool(tool.id)}
              >
                <span className="nav-badge-mark">{tool.short}</span>
                <div className="nav-text">
                  <span className="nav-title">{tool.label}</span>
                  <span className="nav-desc">{tool.description}</span>
                </div>
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
              <div className={`toggle-track ${theme === "light" ? "light" : ""}`}>
                <div className="toggle-thumb" />
                <span className="toggle-label left">Dark</span>
                <span className="toggle-label right">Light</span>
              </div>
            </button>
            <p className="footer-note">Local-first PDF tools with installable web app support.</p>
            <div className="sidebar-links">
              {footerLinks.map((link) => (
                <a key={link.label} href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </aside>

        <main
          ref={mainRef}
          className="main"
          onTouchStart={onMainTouchStart}
          onTouchMove={onMainTouchMove}
          onTouchEnd={onMainTouchEnd}
          onTouchCancel={onMainTouchEnd}
        >
          <div className={`pull-indicator ${pullDistance > 0 || isRefreshing ? "visible" : ""}`}>
            <div className={`pull-indicator-chip ${pullDistance > 56 || isRefreshing ? "armed" : ""}`}>
              <span>{isRefreshing ? "Refreshing..." : pullDistance > 56 ? "Release to refresh" : "Pull to refresh"}</span>
            </div>
          </div>

          <header className="topbar">
            <div className="topbar-copy">
              <span className="eyebrow">Workspace</span>
              <h1 className="page-title">{activeToolMeta.label}</h1>
              <p className="page-subtitle">{toolSummaries[activeTool]}</p>
            </div>

            <div className="topbar-status">
              <StatusItem label="Backend" value={backendLabel} tone={offline ? "warn" : "good"} />
              <StatusItem label="Theme" value={themeLabel} />
              {canInstallApp ? (
                <button type="button" className="status-item status-item-action tone-neutral" onClick={handleInstallApp}>
                  <span className="status-item-label">App</span>
                  <strong className="status-item-value">{appLabel}</strong>
                </button>
              ) : (
                <StatusItem label="App" value={appLabel} tone="default" />
              )}
            </div>

            <div className="mobile-theme-toggle">
              <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
                <div className={`toggle-track ${theme === "light" ? "light" : ""}`}>
                  <div className="toggle-thumb" />
                  <span className="toggle-label left">Dark</span>
                  <span className="toggle-label right">Light</span>
                </div>
              </button>
            </div>
          </header>

          <section className="tool-shell">
            <div className="tool-shell-head">
              <div>
                <span className="tool-shell-label">Selected tool</span>
                <h2>{activeToolMeta.label}</h2>
              </div>
              <div className="tool-shell-meta">
                <span>{activeToolMeta.description}</span>
              </div>
            </div>

            <div className="tool-area">
              {showShellOfflineState ? (
                <section className="offline-shell-card">
                  <div className="offline-shell-mark">PK</div>
                  <h2>PDFKit is open, but it cannot connect right now.</h2>
                  <p>
                    The interface is available, but document actions will resume only when the backend is reachable
                    again.
                  </p>
                  <div className="offline-shell-actions">
                    <button className="offline-shell-btn" onClick={() => checkBackendHealth()}>
                      Retry connection
                    </button>
                  </div>
                </section>
              ) : (
                <ErrorBoundary key={activeTool}>
                  {activeTool === "merge" && <MergeTool />}
                  {activeTool === "split" && <SplitTool />}
                  {activeTool === "convert" && <ConvertTool libOk={libOk} />}
                  {activeTool === "sign" && <SignTool />}
                  {activeTool === "compress" && <CompressTool />}
                </ErrorBoundary>
              )}
            </div>
          </section>
        </main>
      </div>
    </ToastProvider>
  );
}
