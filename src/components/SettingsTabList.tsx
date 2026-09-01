interface SettingsTabListProps<T extends string> {
  activeTab: T;
  tabs: ReadonlyArray<readonly [T, string]>;
  onSelect: (tab: T) => void;
}

export default function SettingsTabList<T extends string>({ activeTab, tabs, onSelect }: SettingsTabListProps<T>) {
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
