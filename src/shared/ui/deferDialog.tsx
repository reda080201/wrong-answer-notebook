import { Component, Suspense, createElement, lazy, type ComponentProps, type ComponentType } from "react";
import Dialog from "./Dialog";

class DialogModuleLoadError extends Error {
  constructor(cause: unknown) {
    super("화면 파일을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.", { cause });
  }
}

/** Define once at module scope; parent controllers and loaded form state stay mounted. */
export function deferDialog<Props extends { onClose: () => void }>(
  load: () => Promise<{ default: ComponentType<Props> }>,
  label: string,
) {
  const createView = () => lazy(() => load().catch(cause => { throw new DialogModuleLoadError(cause); }));
  let sharedView = createView();

  return class DeferredDialog extends Component<Props, { error: Error | null }> {
    state: { error: Error | null } = { error: null };
    private view = sharedView;

    static getDerivedStateFromError(error: Error) { return { error }; }

    private retry = () => {
      // A rejected React.lazy promise is cached. Replace it only after a load failure;
      // successful, already mounted views keep their original component identity.
      sharedView = createView();
      this.view = sharedView;
      this.setState({ error: null });
    };

    private placeholder(failed = false) {
      return <Dialog open size="sm" title={label} ariaLabel={`${label} 불러오기`} onClose={this.props.onClose}>
        <p role={failed ? "alert" : "status"}>{failed ? this.state.error?.message : `${label} 화면을 불러오는 중입니다…`}</p>
        {failed && <button type="button" onClick={this.retry}>다시 불러오기</button>}
        <button type="button" onClick={this.props.onClose}>닫기</button>
      </Dialog>;
    }

    render() {
      if (this.state.error) {
        if (!(this.state.error instanceof DialogModuleLoadError)) throw this.state.error;
        return this.placeholder(true);
      }
      const View = this.view;
      return <Suspense fallback={this.placeholder()}>{createElement(View, this.props as ComponentProps<typeof View>)}</Suspense>;
    }
  };
}
