import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import Dialog from "./Dialog";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

interface PromptOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type Request =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void };

interface AppDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const AppDialogContext = createContext<AppDialogContextValue>({
  confirm: async () => false,
  prompt: async () => null,
});

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const promptInputRef = useRef<HTMLInputElement>(null);

  const close = useCallback((value: boolean | string | null) => {
    const current = request;
    setRequest(null);
    if (!current) return;
    if (current.kind === "confirm" && typeof value === "boolean") current.resolve(value);
    if (current.kind === "prompt" && (typeof value === "string" || value === null)) current.resolve(value);
  }, [request]);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setRequest({ kind: "confirm", options, resolve });
  }), []);

  const prompt = useCallback((options: PromptOptions) => new Promise<string | null>((resolve) => {
    setPromptValue(options.defaultValue ?? "");
    setRequest({ kind: "prompt", options, resolve });
  }), []);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);
  const title = request?.options.title ?? (request?.kind === "prompt" ? "입력" : "확인");

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      {request && (
        <Dialog
          open
          onClose={() => close(request.kind === "confirm" ? false : null)}
          title={title}
          className="app-dialog-card"
          size="sm"
          initialFocusRef={request.kind === "prompt" ? promptInputRef : undefined}
          footer={(
            <>
              <button type="button" className="btn-secondary" data-dialog-initial-focus={request.kind === "confirm" || undefined} onClick={() => close(request.kind === "confirm" ? false : null)}>
                {request.options.cancelLabel ?? "취소"}
              </button>
              <button type="button" className={request.kind === "confirm" && request.options.variant === "destructive" ? "btn-danger" : undefined} onClick={() => close(request.kind === "confirm" ? true : promptValue)}>
                {request.options.confirmLabel ?? "확인"}
              </button>
            </>
          )}
        >
          <p>{request.options.message}</p>
          {request.kind === "prompt" && (
            <input
              ref={promptInputRef}
              autoFocus
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") close(promptValue);
              }}
            />
          )}
        </Dialog>
      )}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  return useContext(AppDialogContext);
}
