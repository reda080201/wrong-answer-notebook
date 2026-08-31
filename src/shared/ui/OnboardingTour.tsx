import { useState } from "react";
import Dialog from "./Dialog";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
}

interface OnboardingTourProps {
  open: boolean;
  onClose(): void;
  onComplete(): void;
}

const steps: OnboardingStep[] = [
  { id: "add", title: "자료를 추가하세요", description: "오답, 시험지, 특강 중 지금 정리할 자료부터 시작합니다." },
  { id: "study", title: "문항에 집중하세요", description: "문항별 보기에서 답과 해설을 필요한 순간에만 엽니다." },
  { id: "review", title: "복습을 기록하세요", description: "다시, 어려움, 맞음 기록으로 다음 복습을 정리합니다." },
  { id: "search", title: "같은 검색을 어디서나", description: "제목, 과목, 단원과 문항 내용을 한 검색어로 찾을 수 있습니다." },
  { id: "inspect", title: "근거는 보존됩니다", description: "원본 페이지와 가져온 자료는 검수용으로 보존됩니다." },
];

export default function OnboardingTour({ open, onClose, onComplete }: OnboardingTourProps) {
  const [index, setIndex] = useState(0);
  const step = steps[index] ?? steps[0];
  const finish = () => {
    setIndex(0);
    onComplete();
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="오답노트 시작하기"
      ariaLabel="오답노트 시작 안내"
      size="sm"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={finish}>다시 보지 않기</button>
          {index > 0 && <button type="button" className="btn-ghost" onClick={() => setIndex((current) => current - 1)}>이전</button>}
          {index < steps.length - 1
            ? <button type="button" className="btn-primary" onClick={() => setIndex((current) => current + 1)}>다음</button>
            : <button type="button" className="btn-primary" onClick={finish}>시작하기</button>}
        </>
      )}
    >
      <p className="onboarding-tour__progress">{index + 1} / {steps.length}</p>
      <h3>{step.title}</h3>
      <p>{step.description}</p>
      <button type="button" className="btn-ghost onboarding-tour__skip" onClick={onClose}>건너뛰기</button>
    </Dialog>
  );
}
