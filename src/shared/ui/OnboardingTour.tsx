import { useState } from "react";
import Dialog from "./Dialog";

const STEPS = [
  ["오답부터 시작", "첫 오답을 추가하거나 시험지를 가져오면 문항별 학습 화면에서 바로 이어서 볼 수 있습니다."],
  ["문제 은행", "문항을 한곳에서 찾고, 단원·자료·최근 학습 기준으로 정리할 수 있습니다."],
  ["학습 허브", "풀이 중 쌓인 개념과 복습 포인트는 학습 허브에서 다시 연결됩니다."],
  ["가져오기", "GPT ZIP, 파일, 직접 입력은 원본 자료를 보존한 채 검토가 필요한 부분만 표시합니다."],
  ["복습 흐름", "복습을 시작하면 저장된 대상과 순서가 정확히 같을 때만 이어서 하기를 제안합니다."],
] as const;

interface OnboardingTourProps {
  open: boolean;
  onDismiss(dontShowAgain: boolean): void;
  onStartNew?: () => void;
  onImport?: () => void;
  onOpenQuestionBank?: () => void;
}

export default function OnboardingTour({ open, onDismiss, onStartNew, onImport, onOpenQuestionBank }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [title, body] = STEPS[step];
  const last = step === STEPS.length - 1;
  const action = step === 0 ? onStartNew : step === 1 ? onOpenQuestionBank : step === 3 ? onImport : undefined;
  return <Dialog open={open} size="sm" ariaLabel="시작 안내" title="오답노트 시작 안내" onClose={() => onDismiss(dontShowAgain)} footer={<><button type="button" className="btn-secondary" onClick={() => onDismiss(dontShowAgain)}>건너뛰기</button>{step > 0 && <button type="button" className="btn-secondary" onClick={() => setStep((current) => current - 1)}>이전</button>}<button type="button" className="btn-primary" onClick={() => action ? action() : last ? onDismiss(dontShowAgain) : setStep((current) => current + 1)}>{action ? "바로 시작" : last ? "시작하기" : "다음"}</button></>}>
    <section className="onboarding-tour"><p className="form-hint">{step + 1} / {STEPS.length}</p><h3>{step === 0 ? "무엇부터 할까요?" : title}</h3><p>{body}</p>{step === 0 && <div className="onboarding-tour-actions"><button type="button" className="btn-secondary" onClick={onStartNew}>첫 오답 추가</button><button type="button" className="btn-secondary" onClick={onImport}>시험지 가져오기</button><button type="button" className="btn-secondary" onClick={onOpenQuestionBank}>문제 은행 둘러보기</button></div>}<label><input type="checkbox" checked={dontShowAgain} onChange={(event) => setDontShowAgain(event.target.checked)} /> 다시 보지 않기</label></section>
  </Dialog>;
}
