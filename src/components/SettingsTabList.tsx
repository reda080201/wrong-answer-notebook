import type { SettingsTab } from "./SettingsModal";

interface SettingsTabListProps {
  activeTab: SettingsTab;
  tabs: ReadonlyArray<readonly [SettingsTab, string]>;
  onSelect: (tab: SettingsTab) => void;
}

export default function SettingsTabList({ activeTab, tabs, onSelect }: SettingsTabListProps) {
  return (
    <div aria-label="설정 섹션">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={activeTab === id}
          className={activeTab === id ? "active" : ""}
          onClick={() => onSelect(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
