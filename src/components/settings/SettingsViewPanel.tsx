import type { ViewPreferences } from "../../types";

interface SettingsViewPanelProps {
  preferences: ViewPreferences;
  onPatch(patch: Partial<ViewPreferences>): void | Promise<void>;
}

export default function SettingsViewPanel({
  preferences,
  onPatch,
}: SettingsViewPanelProps) {
  const patch = (next: Partial<ViewPreferences>) => void onPatch(next);

  return (
    <div className="settings-pref-panel">
      <p className="settings-label">보기</p>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.hideAnswers} onChange={(event) => patch({ hideAnswers: event.target.checked })} /> 정답 가리기</label>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.showDifficulty} onChange={(event) => patch({ showDifficulty: event.target.checked })} /> 난이도 표시</label>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.showOriginalPages} onChange={(event) => patch({ showOriginalPages: event.target.checked })} /> 원본 페이지 표시</label>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.showLearningVisuals} onChange={(event) => patch({ showLearningVisuals: event.target.checked })} /> 학습 시각화 표시</label>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.compactToolbar} onChange={(event) => patch({ compactToolbar: event.target.checked })} /> 컴팩트 도구바</label>
      <label className="settings-checkbox"><input type="checkbox" checked={preferences.conceptLinksEnabled !== false} onChange={(event) => patch({ conceptLinksEnabled: event.target.checked })} /> 해설의 개념 링크 사용</label>
      <label className="settings-checkbox"><input type="checkbox" checked={Boolean(preferences.automaticConceptLinksEnabled)} disabled={preferences.conceptLinksEnabled === false} onChange={(event) => patch({ automaticConceptLinksEnabled: event.target.checked })} /> 정확히 일치하는 개념 자동 연결</label>
      <p className="settings-label">문제지 배치</p>
      <div className="theme-options">
        {([['single', '한 단'], ['columns', '2단']] as const).map(([value, label]) => (
          <button key={value} type="button" className={`theme-btn ${preferences.sheetLayout === value ? "active" : ""}`} onClick={() => patch({ sheetLayout: value })}>{label}</button>
        ))}
      </div>
      <p className="settings-label">글자 크기</p>
      <div className="theme-options">
        {([['normal', '기본'], ['large', '크게'], ['xlarge', '아주 크게']] as const).map(([value, label]) => (
          <button key={value} type="button" className={`theme-btn ${preferences.fontSize === value ? "active" : ""}`} onClick={() => patch({ fontSize: value })}>{label}</button>
        ))}
      </div>
      <p className="settings-label">문제 크게 보기 해설</p>
      <div className="theme-options" role="group" aria-label="문제 크게 보기 해설 방식">
        {([['split', '나란히'], ['dialog', '별도 창']] as const).map(([value, label]) => (
          <button key={value} type="button" className={`theme-btn ${preferences.questionSolutionPresentation === value ? "active" : ""}`} aria-pressed={preferences.questionSolutionPresentation === value} onClick={() => patch({ questionSolutionPresentation: value })}>{label}</button>
        ))}
      </div>
      <p className="settings-label">특강 항목 기본 상태</p>
      <div className="theme-options" role="group" aria-label="특강 항목 기본 상태">
        {([['first', '첫 항목만 펼침'], ['all', '모두 펼침'], ['none', '모두 접힘']] as const).map(([value, label]) => (
          <button key={value} type="button" className={`theme-btn ${preferences.lectureBlockDefaultState === value ? "active" : ""}`} aria-pressed={preferences.lectureBlockDefaultState === value} onClick={() => patch({ lectureBlockDefaultState: value })}>{label}</button>
        ))}
      </div>
    </div>
  );
}
