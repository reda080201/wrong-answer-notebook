import type { ReactNode } from "react";
import type { GptMcpPreferences } from "../../types";

interface SettingsMcpPanelProps {
  preferences: GptMcpPreferences;
  onPatch(patch: Partial<GptMcpPreferences>): Promise<void>;
  bridgePanel: ReactNode;
}

export default function SettingsMcpPanel({ preferences, onPatch, bridgePanel }: SettingsMcpPanelProps) {
  return <div className="settings-pref-panel">
    <p className="settings-label">GPT·MCP</p>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.importReviewExpanded} onChange={(event) => void onPatch({ importReviewExpanded: event.target.checked })} /> 가져오기 검토 기본 펼침</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.importDetailCollapsedByDefault} onChange={(event) => void onPatch({ importDetailCollapsedByDefault: event.target.checked })} /> 문항 상세 기본 접기</label>
    <p className="settings-label">MCP 공유 범위</p>
    <div className="theme-options">{([['current-question', '현재 문항'], ['session-summary', '세션 요약'], ['submitted-result', '제출 결과']] as const).map(([value, label]) => <button key={value} type="button" className={`theme-btn ${preferences.mcpShareScope === value ? 'active' : ''}`} onClick={() => void onPatch({ mcpShareScope: value })}>{label}</button>)}</div>
    {bridgePanel}
  </div>;
}
