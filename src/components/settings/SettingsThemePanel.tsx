import type { ThemeMode } from "../../types";

interface SettingsThemePanelProps {
  theme: ThemeMode;
  onThemeChange(theme: ThemeMode): void;
}

export default function SettingsThemePanel({
  theme,
  onThemeChange,
}: SettingsThemePanelProps) {
  return (
    <>
      <p className="settings-label">테마</p>
      <div className="theme-options">
        {(
          [
            ["light", "라이트"],
            ["dark", "다크"],
            ["system", "시스템"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`theme-btn ${theme === value ? "active" : ""}`}
            onClick={() => onThemeChange(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}
