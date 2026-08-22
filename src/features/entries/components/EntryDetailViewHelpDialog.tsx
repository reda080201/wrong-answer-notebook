import Dialog from "../../../shared/ui/Dialog";

export default function EntryDetailViewHelpDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  return <Dialog open={open} onClose={onClose} className="exam-dialog" ariaLabel="보기 도움말">
    <header>
      <h3>보기 도움말</h3>
      <button type="button" className="btn-icon" onClick={onClose}>닫기</button>
    </header>
    <ul>
      <li>빠른 보기 설정은 현재 화면의 배치, 글자 크기, 정답 가리기를 바로 바꿉니다.</li>
      <li>전체 설정에서는 보기, 시험, 이미지, GPT·MCP 기본값을 함께 관리합니다.</li>
      <li>개념노트와 특강자료에는 정답 가리기가 표시되지 않습니다.</li>
    </ul>
  </Dialog>;
}
