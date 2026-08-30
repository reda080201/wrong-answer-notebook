import type { SettingsTab } from "./SettingsModal";

interface SettingsTabListProps {
  activeTab: SettingsTab;
  tabs: ReadonlyArray<readonly [SettingsTab, string]>;
  onSelect: (tab: SettingsTab) => void;
}

export default function SettingsTabList({ activeTab, tabs, onSelect }: SettingsTabListProps) {
  return (
    <nav aria-label="설정 섹션">
      <ul className="settings-navigation-list">
        {tabs.map(([id, label]) => (
          <li key={id}>
            <button
              type="button"
              aria-current={activeTab === id ? "page" : undefined}
              className={activeTab === id ? "active" : ""}
              onClick={() => onSelect(id)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
