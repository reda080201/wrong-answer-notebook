import { useEffect, useRef, useState } from "react";

export type QuickViewSheetLayout = "auto" | "single" | "columns";
export type QuickViewFontSize = "normal" | "large" | "xlarge";

interface QuickViewSettingsMenuProps {
  layout?: QuickViewSheetLayout;
  onLayoutChange?: (layout: QuickViewSheetLayout) => void;
  fontSize?: QuickViewFontSize;
  onFontSizeChange?: (size: QuickViewFontSize) => void;
  hideAnswers?: boolean;
  onHideAnswersChange?: (hidden: boolean) => void;
  onOpenHelp?: () => void;
  onOpenAllSettings?: () => void;
}

/** Small, local display controls. It deliberately does not contain destructive actions. */
export default function QuickViewSettingsMenu({
  layout,
  onLayoutChange,
  fontSize,
  onFontSizeChange,
  hideAnswers,
  onHideAnswersChange,
  onOpenHelp,
  onOpenAllSettings,
}: QuickViewSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="quick-view-settings" ref={menuRef}>
      <button
        type="button"
        className="btn-icon quick-view-settings__trigger"
        aria-label="보기 설정"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        보기 설정
      </button>
      {open && (
        <section className="quick-view-settings__menu" role="dialog" aria-label="보기 설정">
          <div className="quick-view-settings__section">
            <strong>화면 보기</strong>
            {layout && onLayoutChange && (
              <div className="quick-view-settings__choices" aria-label="문제지 배치">
                <button type="button" className={layout === "auto" ? "active" : ""} onClick={() => onLayoutChange("auto")}>자동</button>
                <button type="button" className={layout === "single" ? "active" : ""} onClick={() => onLayoutChange("single")}>한 단</button>
                <button type="button" className={layout === "columns" ? "active" : ""} onClick={() => onLayoutChange("columns")}>2단</button>
              </div>
            )}
            {fontSize && onFontSizeChange && (
              <div className="quick-view-settings__choices" aria-label="글자 크기">
                {(["normal", "large", "xlarge"] as const).map((size) => (
                  <button key={size} type="button" className={fontSize === size ? "active" : ""} onClick={() => onFontSizeChange(size)}>
                    {size === "normal" ? "기본" : size === "large" ? "크게" : "아주 크게"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {onHideAnswersChange && (
            <label className="quick-view-settings__toggle">
              <input type="checkbox" checked={Boolean(hideAnswers)} onChange={(event) => onHideAnswersChange(event.target.checked)} />
              정답 가리기
            </label>
          )}
          <button type="button" className="quick-view-settings__advanced" onClick={() => setAdvancedOpen((current) => !current)} aria-expanded={advancedOpen}>
            더 많은 보기 설정
          </button>
          {advancedOpen && (
            <div className="quick-view-settings__advanced-panel">
              {onOpenHelp && <button type="button" onClick={() => { setOpen(false); setAdvancedOpen(false); onOpenHelp(); }}>도움말</button>}
              {onOpenAllSettings && <button type="button" onClick={() => { setOpen(false); setAdvancedOpen(false); onOpenAllSettings(); }}>전체 설정 열기</button>}
              {!onOpenHelp && !onOpenAllSettings && <span>추가 설정은 앱 설정에서 관리합니다.</span>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
