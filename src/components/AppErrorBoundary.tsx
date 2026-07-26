import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("AppErrorBoundary:", error, errorInfo.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;

    if (error) {
      return (
        <div
          role="alert"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.5rem",
            background: "var(--bg, #0f1419)",
            color: "var(--text, #e8edf4)",
          }}
        >
          <div
            style={{
              width: "min(100%, 28rem)",
              padding: "1.5rem",
              borderRadius: "var(--radius, 12px)",
              border: "1px solid var(--border, #2d3a4f)",
              background: "var(--surface, #1a2332)",
              boxShadow: "var(--shadow, 0 4px 24px rgba(0, 0, 0, 0.35))",
            }}
          >
            <h1 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>
              문제가 발생했습니다
            </h1>
            <p
              style={{
                marginBottom: "1rem",
                color: "var(--text-muted, #8b9cb3)",
              }}
            >
              화면을 불러오는 중 오류가 발생했습니다. 아래 내용을 확인한 뒤
              새로고침해 주세요.
            </p>
            <p
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                borderRadius: "8px",
                background: "var(--surface-muted, #182131)",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.875rem",
                wordBreak: "break-word",
              }}
            >
              {error.message || "알 수 없는 오류"}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: "0.625rem 1rem",
                border: "none",
                borderRadius: "8px",
                background: "var(--accent, #4f8cff)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
