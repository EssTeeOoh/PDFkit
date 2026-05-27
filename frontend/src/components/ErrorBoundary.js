import React from "react";
import "./ErrorBoundary.css";
import { reportFrontendError } from "../utils/telemetry";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info);
    reportFrontendError("error_boundary", error, { componentStack: info?.componentStack });
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="eb-wrap">
        <div className="eb-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
              strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h3 className="eb-title">Something went wrong</h3>
        <p className="eb-desc">
          This tool ran into an unexpected error. Your other tools are unaffected.
        </p>
        {this.state.error?.message && (
          <code className="eb-code">{this.state.error.message}</code>
        )}
        <button className="eb-btn" onClick={() => this.reset()}>
          Try again
        </button>
      </div>
    );
  }
}
