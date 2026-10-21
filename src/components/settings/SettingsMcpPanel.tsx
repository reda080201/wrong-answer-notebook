import type { ReactNode } from "react";
import type { GptMcpPreferences } from "../../types";

interface SettingsMcpPanelProps {
  preferences: GptMcpPreferences;
  onPatch(patch: Partial<GptMcpPreferences>): Promise<void>;
  bridgePanel: ReactNode;
}

export default function SettingsMcpPanel({ preferences, onPatch, bridgePanel }: SettingsMcpPanelProps) {
  return <div className="settings-pref-panel">
    <p className="settings-label">가져오기 화면</p><p className="form-hint">아래 두 설정은 가져오기 검토 화면의 처음 펼침 상태만 바꿉니다. API 연결이나 자료 전송 권한을 바꾸지 않습니다.</p>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.importReviewExpanded} onChange={(event) => void onPatch({ importReviewExpanded: event.target.checked })} /> 가져오기 검토 기본 펼침</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.importDetailCollapsedByDefault} onChange={(event) => void onPatch({ importDetailCollapsedByDefault: event.target.checked })} /> 문항 상세 기본 접기</label>
    <p className="settings-label">외부 AI 도구와 연결 (MCP)</p><p className="form-hint">앱 안의 AI 대화 API와 별개입니다. 외부 MCP 도구를 연결할 때만 아래 브릿지가 필요합니다.</p><p className="settings-label">MCP 문맥 범위 기본값</p>
    <div className="theme-options">{([['current-question', '현재 문항'], ['session-summary', '세션 요약'], ['submitted-result', '제출 결과']] as const).map(([value, label]) => <button key={value} type="button" className={`theme-btn ${preferences.mcpShareScope === value ? 'active' : ''}`} onClick={() => void onPatch({ mcpShareScope: value })}>{label}</button>)}</div>
    <p className="form-hint">현재 문항은 선택한 문제의 문맥, 세션 요약은 풀이 진행 요약, 제출 결과는 제출한 시험의 결과를 대상으로 합니다. 정답·해설 등 개별 공유 허용과 실전 시험 보호는 따로 적용됩니다. 이 설정만으로 외부 AI 연결이 켜지지는 않습니다.</p>
    {bridgePanel}
  </div>;
}
