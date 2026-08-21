import { Component, type ErrorInfo, type ReactNode } from "react";

type FeatureErrorBoundaryProps = {
  children: ReactNode;
  featureName: string;
};

type FeatureErrorBoundaryState = {
  error: Error | null;
};

/** Keeps a recoverable workspace failure from replacing the whole application. */
export default class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  state: FeatureErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`FeatureErrorBoundary (${this.props.featureName}):`, error, errorInfo.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <section className="feature-error-boundary" role="alert" aria-live="polite">
        <strong>{this.props.featureName} 영역을 표시하지 못했습니다.</strong>
        <p>이 영역만 다시 불러올 수 있습니다.</p>
        <button type="button" className="btn-secondary" onClick={this.handleRetry}>
          다시 시도
        </button>
      </section>
    );
  }
}
