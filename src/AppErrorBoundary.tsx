import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

type AppErrorBoundaryProps = PropsWithChildren;

type AppErrorBoundaryState = {
  hasError: boolean;
  error: unknown;
};

export class AppBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Application error boundary caught an error", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>{String(this.state.error)}</pre>
          <button type="button" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      );
    }

    return this.props.children ?? null;
  }
}

export default AppBoundary;
