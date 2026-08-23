import { isTauri } from "@tauri-apps/api/core";
import type { ExamPreferences, ImagePreferences, IntegrityReport, LibraryPreferences } from "../../types";
import type { AppUpdateState } from "../../features/updater/model/appUpdate";

const defaultLibraryPreferences: LibraryPreferences = { separateMockExams: false, defaultUnitView: "home", listDensity: "standard", showUserFolders: true };

export function SettingsLibraryPanel({ preferences, onPatch }: { preferences?: LibraryPreferences; onPatch(patch: Partial<LibraryPreferences>): void }) {
  const value = preferences ?? defaultLibraryPreferences;
  return <div className="settings-pref-panel">
    <p className="settings-label">보관함</p>
    <label className="settings-checkbox"><input type="checkbox" checked={value.separateMockExams} onChange={(event) => onPatch({ separateMockExams: event.target.checked })} /> 모의고사를 별도 분류</label>
    <p className="settings-help">끄면 공식 모의고사는 기출, 사설 모의고사는 N제로 표시합니다.</p>
    <p className="settings-label">단원 진입 화면</p>
    <div className="theme-options" role="group" aria-label="단원 진입 화면">{([['home', '단원 홈'], ['lectures', '특강'], ['problems', '문제']] as const).map(([valueKey, label]) => <button key={valueKey} type="button" className={`theme-btn ${value.defaultUnitView === valueKey ? "active" : ""}`} aria-pressed={value.defaultUnitView === valueKey} onClick={() => onPatch({ defaultUnitView: valueKey })}>{label}</button>)}</div>
    <p className="settings-label">자료 목록 밀도</p>
    <div className="theme-options" role="group" aria-label="자료 목록 밀도"><button type="button" className={`theme-btn ${value.listDensity !== "compact" ? "active" : ""}`} onClick={() => onPatch({ listDensity: "standard" })}>표준</button><button type="button" className={`theme-btn ${value.listDensity === "compact" ? "active" : ""}`} onClick={() => onPatch({ listDensity: "compact" })}>조밀</button></div>
    <label className="settings-checkbox"><input type="checkbox" checked={value.showUserFolders} onChange={(event) => onPatch({ showUserFolders: event.target.checked })} /> 사용자 폴더 표시</label>
  </div>;
}

export function SettingsExamPanel({ preferences, onPatch }: { preferences: ExamPreferences; onPatch(patch: Partial<ExamPreferences>): void }) {
  return <div className="settings-pref-panel">
    <p className="settings-label">시험</p><p className="settings-label">연습 모드</p>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.showScratchNote} onChange={(event) => onPatch({ showScratchNote: event.target.checked })} /> 풀이 메모 표시</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.showOriginalPages} onChange={(event) => onPatch({ showOriginalPages: event.target.checked })} /> 원본 페이지 표시</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.showNavigator} onChange={(event) => onPatch({ showNavigator: event.target.checked })} /> 문항 navigator 표시</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.autoAdvanceOnAnswer} onChange={(event) => onPatch({ autoAdvanceOnAnswer: event.target.checked })} /> 답 선택 후 자동 이동</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.warnUnansweredOnSubmit} onChange={(event) => onPatch({ warnUnansweredOnSubmit: event.target.checked })} /> 미응답 제출 경고</label>
    <p className="settings-label">실전 모드</p>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.showTimer !== false} onChange={(event) => onPatch({ showTimer: event.target.checked })} /> 타이머 표시</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.realExamAnswerSheetOpen !== false} onChange={(event) => onPatch({ realExamAnswerSheetOpen: event.target.checked })} /> 답안지 처음 열기</label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.warnBeforeEnd !== false} onChange={(event) => onPatch({ warnBeforeEnd: event.target.checked })} /> 종료 전 경고</label>
    <label className="settings-checkbox"><input type="checkbox" checked={Boolean(preferences.autoSubmitOnTimeExpired)} onChange={(event) => onPatch({ autoSubmitOnTimeExpired: event.target.checked })} /> 시간 만료 시 자동 제출</label>
    <label className="settings-field">기본 제한 시간(분)<input type="number" min={1} step={1} value={preferences.defaultRealExamMinutes ?? 50} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) onPatch({ defaultRealExamMinutes: Math.round(value) }); }} /></label>
    <label className="settings-checkbox"><input type="checkbox" checked={preferences.showMcpHelp} onChange={(event) => onPatch({ showMcpHelp: event.target.checked })} /> MCP 도움 표시</label>
  </div>;
}

export function SettingsImagesPanel({ preferences, onPatch }: { preferences: ImagePreferences; onPatch(patch: Partial<ImagePreferences>): void }) {
  return <div className="settings-pref-panel"><p className="settings-label">이미지</p><label className="settings-checkbox"><input type="checkbox" checked={preferences.preserveSourcePages} onChange={(event) => onPatch({ preserveSourcePages: event.target.checked })} /> 원본 페이지 보존</label><label className="settings-checkbox"><input type="checkbox" checked={preferences.showUnlinkedImages} onChange={(event) => onPatch({ showUnlinkedImages: event.target.checked })} /> 미연결 이미지 표시</label><p className="settings-label">썸네일 크기</p><div className="theme-options">{([['small', '작게'], ['medium', '보통'], ['large', '크게']] as const).map(([value, label]) => <button key={value} type="button" className={`theme-btn ${preferences.thumbnailSize === value ? "active" : ""}`} onClick={() => onPatch({ thumbnailSize: value })}>{label}</button>)}</div></div>;
}

export function SettingsDataPanel({ settings, report, onBackup, onRestore, onIntegrity, onCleanup, onAutoBackupChange }: { settings: { autoBackup: { enabled: boolean } }; report: IntegrityReport | null; onBackup(): void; onRestore(): void; onIntegrity(): void; onCleanup(): void; onAutoBackupChange(enabled: boolean): void }) {
  return <><div className="settings-actions"><button type="button" className="theme-btn" onClick={onBackup}>백업 만들기</button><button type="button" className="theme-btn" onClick={onRestore}>백업 복원</button><button type="button" className="theme-btn" onClick={onIntegrity}>무결성 검사</button><button type="button" className="theme-btn" onClick={onCleanup}>미사용 이미지 정리</button></div><label className="settings-checkbox"><input type="checkbox" checked={settings.autoBackup.enabled} disabled={!isTauri()} onChange={(event) => onAutoBackupChange(event.target.checked)} /> 자동 백업 {isTauri() ? "하루 1회" : "(데스크톱 앱에서 사용 가능)"}</label>{report && <div className="integrity-report">{report.issues.length === 0 ? <p>문제가 없습니다.</p> : report.issues.slice(0, 8).map((issue) => <p key={issue.id} className={`integrity-issue integrity-issue--${issue.severity}`}>{issue.message}</p>)}</div>}</>;
}

export function SettingsAdvancedPanel() { return <div className="advanced-settings-panel"><p>고급 설정은 진단 정보와 위험한 옵션을 분리해 두는 공간입니다.</p><p>백업, 복원, 무결성 검사, 이미지 정리는 데이터 관리 탭에서 실행하세요.</p></div>; }

export function SettingsUpdatesPanel({ state, onCheck, onInstall, onRestart, onOpenRelease, preferences, onPatch }: { state: AppUpdateState; onCheck(): void; onInstall(): void; onRestart(): void; onOpenRelease(): void; preferences: { autoCheckEnabled: boolean; notificationsEnabled: boolean; backupBeforeInstall: boolean }; onPatch(patch: Partial<typeof preferences>): void }) {
  return <div className="settings-pref-panel updater-settings-panel"><p className="settings-label">앱 업데이트</p><p>현재 버전: {state.status === "available" || state.status === "up_to_date" ? state.currentVersion : "설치된 데스크톱 앱에서 확인"}</p>{state.status === "available" && <><p>최신 버전: {state.latestVersion}</p><div className="update-notes"><pre>{state.notes || "변경사항이 없습니다."}</pre></div><button type="button" className="theme-btn" onClick={onInstall}>다운로드 및 설치</button></>}{state.status === "downloading" && <p>업데이트 다운로드 중… {state.percent === undefined ? `${Math.round(state.downloadedBytes / 1024 / 1024)}MB` : `${state.percent}%`}</p>}{state.status === "restart_required" && <button type="button" className="theme-btn" onClick={onRestart}>지금 다시 시작</button>}{state.status === "up_to_date" && <p>최신 버전입니다.</p>}{state.status === "offline" && <p>{state.message}</p>}<div className="settings-actions"><button type="button" className="theme-btn" onClick={onCheck}>업데이트 확인</button><button type="button" className="theme-btn" onClick={onOpenRelease}>GitHub Releases 열기</button></div><label className="settings-checkbox"><input type="checkbox" checked={preferences.autoCheckEnabled} onChange={(event) => onPatch({ autoCheckEnabled: event.target.checked })} /> 앱 시작 시 업데이트 확인</label><label className="settings-checkbox"><input type="checkbox" checked={preferences.notificationsEnabled} onChange={(event) => onPatch({ notificationsEnabled: event.target.checked })} /> 업데이트 알림 표시</label><label className="settings-checkbox"><input type="checkbox" checked={preferences.backupBeforeInstall} onChange={(event) => onPatch({ backupBeforeInstall: event.target.checked })} /> 설치 전 자동 백업</label></div>;
}
