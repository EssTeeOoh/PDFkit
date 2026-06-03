import { useEffect, useMemo, useState } from "react";
import { apiUrl } from "../config/api";
import "./AdminTelemetryDashboard.css";

const ADMIN_TOKEN_KEY = "pdfkit-admin-token";

function formatTime(value) {
  if (!value) return "n/a";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function maskClientId(value) {
  if (!value) return "n/a";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function sortEntries(map = {}) {
  return Object.entries(map).sort((a, b) => Number(b[1]) - Number(a[1]));
}

export default function AdminTelemetryDashboard({ onBack }) {
  const [token, setToken] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
    } catch {
      return "";
    }
  });
  const [draftToken, setDraftToken] = useState(token);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState(null);

  useEffect(() => {
    setDraftToken(token);
  }, [token]);

  const topTools = useMemo(() => sortEntries(summary?.by_tool || {}).slice(0, 8), [summary]);
  const topActions = useMemo(() => sortEntries(summary?.tool_actions || {}).slice(0, 10), [summary]);
  const recentEvents = summary?.recent || [];
  const clientRows = useMemo(() => {
    const clients = summary?.clients || {};
    return Object.entries(clients)
      .map(([clientId, stats]) => ({ clientId, ...stats }))
      .sort((a, b) => Number(b.events || 0) - Number(a.events || 0))
      .slice(0, 10);
  }, [summary]);

  const loadSummary = async (tokenValue = token) => {
    const trimmed = tokenValue.trim();
    if (!trimmed) {
      setError("Enter your admin token first.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/admin/telemetry/summary"), {
        headers: {
          "X-Admin-Token": trimmed,
        },
      });

      if (!response.ok) {
        let detail = "Could not load analytics.";
        try {
          const data = await response.json();
          detail = data?.detail || detail;
        } catch {
          // ignore
        }
        throw new Error(detail);
      }

      const data = await response.json();
      setSummary(data);
      setToken(trimmed);
      setLastLoadedAt(new Date().toISOString());
      try {
        localStorage.setItem(ADMIN_TOKEN_KEY, trimmed);
      } catch {
        // ignore
      }
    } catch (err) {
      setError(err?.message || "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  };

  const clearToken = () => {
    setToken("");
    setDraftToken("");
    setSummary(null);
    setLastLoadedAt(null);
    try {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (token) {
      loadSummary(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-telemetry-page">
      <div className="grain" />

      <header className="admin-topbar">
        <div>
          <div className="admin-kicker">Private console</div>
          <h1>Telemetry dashboard</h1>
          <p>Anonymous usage only, protected behind your admin token.</p>
        </div>
        <div className="admin-topbar-actions">
          <button className="btn-ghost" onClick={onBack}>Back to app</button>
          <button className="btn-ghost" onClick={() => loadSummary(token)} disabled={loading || !token}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      <section className="admin-card admin-auth-card">
        <div className="admin-card-header">
          <div>
            <h2>Admin token</h2>
            <p>Stored locally in your browser and sent only to the protected admin endpoint.</p>
          </div>
          {token && <span className="admin-pill good">Token saved</span>}
        </div>
        <div className="admin-auth-row">
          <input
            className="admin-token-input"
            type="password"
            autoComplete="current-password"
            placeholder="Paste your PDFKIT_ADMIN_TOKEN"
            value={draftToken}
            onChange={(event) => setDraftToken(event.target.value)}
          />
          <button className="btn-primary" onClick={() => loadSummary(draftToken)} disabled={loading}>
            {loading ? "Loading…" : "Open dashboard"}
          </button>
          <button className="btn-ghost" onClick={clearToken} disabled={loading && !token}>
            Forget
          </button>
        </div>
        {error && <div className="admin-error">{error}</div>}
        {lastLoadedAt && <div className="admin-meta">Last loaded {formatTime(lastLoadedAt)}</div>}
      </section>

      {summary ? (
        <>
          <section className="admin-grid">
            <article className="admin-card metric-card">
              <span>Events</span>
              <strong>{summary?.totals?.events ?? 0}</strong>
            </article>
            <article className="admin-card metric-card">
              <span>Errors</span>
              <strong>{summary?.totals?.errors ?? 0}</strong>
            </article>
            <article className="admin-card metric-card">
              <span>External</span>
              <strong>{summary?.totals?.external_errors ?? 0}</strong>
            </article>
            <article className="admin-card metric-card">
              <span>Unique clients</span>
              <strong>{summary?.totals?.unique_clients ?? 0}</strong>
            </article>
          </section>

          <section className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2>Last update</h2>
                <p>{formatTime(summary?.updated_at)}</p>
              </div>
            </div>
          </section>

          <section className="admin-two-col">
            <article className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h2>Top tools</h2>
                  <p>Which tools are getting the most anonymous usage.</p>
                </div>
              </div>
              <div className="admin-list">
                {topTools.length ? topTools.map(([tool, count]) => (
                  <div className="admin-list-row" key={tool}>
                    <span>{tool}</span>
                    <strong>{count}</strong>
                  </div>
                )) : <div className="admin-empty">No tool usage yet.</div>}
              </div>
            </article>

            <article className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h2>Top actions</h2>
                  <p>Successful actions, failures, and tool views.</p>
                </div>
              </div>
              <div className="admin-list">
                {topActions.length ? topActions.map(([action, count]) => (
                  <div className="admin-list-row" key={action}>
                    <span>{action}</span>
                    <strong>{count}</strong>
                  </div>
                )) : <div className="admin-empty">No actions yet.</div>}
              </div>
            </article>
          </section>

          <section className="admin-two-col">
            <article className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h2>Recent events</h2>
                  <p>Latest anonymous events recorded by the app.</p>
                </div>
              </div>
              <div className="admin-table">
                <div className="admin-table-head">
                  <span>Time</span>
                  <span>Tool</span>
                  <span>Name</span>
                  <span>Status</span>
                </div>
                {recentEvents.length ? recentEvents.map((event, index) => (
                  <div className="admin-table-row" key={`${event.at}-${index}`}>
                    <span>{formatTime(event.at)}</span>
                    <span>{event.tool || "—"}</span>
                    <span>{event.name || "—"}</span>
                    <span>{event.status || "—"}</span>
                  </div>
                )) : <div className="admin-empty">No recent events.</div>}
              </div>
            </article>

            <article className="admin-card">
              <div className="admin-card-header">
                <div>
                  <h2>Anonymous clients</h2>
                  <p>Each browser gets a local anonymous client ID.</p>
                </div>
              </div>
              <div className="admin-table">
                <div className="admin-table-head">
                  <span>Client</span>
                  <span>Events</span>
                  <span>First seen</span>
                  <span>Last seen</span>
                </div>
                {clientRows.length ? clientRows.map((client) => (
                  <div className="admin-table-row" key={client.clientId}>
                    <span>{maskClientId(client.clientId)}</span>
                    <span>{client.events || 0}</span>
                    <span>{formatTime(client.first_seen)}</span>
                    <span>{formatTime(client.last_seen)}</span>
                  </div>
                )) : <div className="admin-empty">No client data yet.</div>}
              </div>
            </article>
          </section>

          <section className="admin-card">
            <div className="admin-card-header">
              <div>
                <h2>Recent payloads</h2>
                <p>Helpful when you are debugging tool behavior locally or in production.</p>
              </div>
            </div>
            <div className="admin-recent-list">
              {recentEvents.length ? recentEvents.map((event, index) => (
                <article className="admin-recent-item" key={`recent-${event.at}-${index}`}>
                  <div className="admin-recent-item-head">
                    <strong>{event.category}</strong>
                    <span>{formatTime(event.at)}</span>
                  </div>
                  <div className="admin-recent-item-body">
                    <span><b>Tool:</b> {event.tool || "—"}</span>
                    <span><b>Name:</b> {event.name || "—"}</span>
                    <span><b>Status:</b> {event.status || "—"}</span>
                    <span><b>Source:</b> {event.source || "—"}</span>
                    {event.message && <span><b>Message:</b> {event.message}</span>}
                  </div>
                </article>
              )) : <div className="admin-empty">No recent payloads to show.</div>}
            </div>
          </section>
        </>
      ) : (
        <section className="admin-card admin-empty-state">
          <h2>No data loaded yet</h2>
          <p>Paste your admin token above to load the private analytics dashboard.</p>
        </section>
      )}
    </div>
  );
}
