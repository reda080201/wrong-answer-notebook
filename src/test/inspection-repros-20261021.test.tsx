import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import EntryForm from '../features/entries/components/EntryForm';
import OriginalPageExamReader from '../features/exam/components/OriginalPageExamReader';
import { getEntryQuestions } from '../utils/entryQuestions';
import type { WrongAnswerEntry } from '../types';
vi.mock('../api',()=>({getImageUrl:vi.fn(async()=>''),pickImages:vi.fn(),saveImageFiles:vi.fn()}));
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
Object.defineProperty(HTMLElement.prototype,'scrollTo',{configurable:true,value:vi.fn()});
it('a missing browser image must finish with an error instead of indefinite loading',async()=>{
  render(<OriginalPageExamReader filenames={['img_missing.png']} onChangePage={vi.fn()} onSelectPages={vi.fn()}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('불러오지 못했습니다');
});
it('editing a structured wrong answer must change the canonical question used by normal study',async()=>{
  const entry={id:'edit-source',title:'정밀 점검',entryKind:'wrong_answer',subject:'수학',question:'1. 이전 본문',questionImages:[],annotations:[],figures:[],tags:[],explanationParts:[],learningBlocks:[],checklist:[],myAnswer:'',correctAnswer:'2',memo:'',difficult:false,mastered:false,difficulty:'none',createdAt:'2026-10-21',updatedAt:'2026-10-21',structuredQuestions:[{questionNumber:'1',questionText:'이전 본문',conditions:[],equations:[],choices:[],figureIds:[],contentSegments:[{id:'body',type:'text',text:'이전 본문'}]}],questionContentSegments:{'1':[{id:'body',type:'text',text:'이전 본문'}]}} as WrongAnswerEntry;
  const save=vi.fn().mockResolvedValue(undefined);
  render(<EntryForm entry={entry} onSave={save} onClose={vi.fn()}/>);
  expect(screen.getByRole('textbox',{name:'문제 · 지문 (텍스트)'})).toHaveAttribute('readonly');
  fireEvent.change(screen.getByRole('textbox',{name:'1번 본문'}),{target:{value:'수정한 본문'}});
  fireEvent.click(screen.getByRole('button',{name:'저장'}));
  await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
  const saved=save.mock.calls[0][0];
  expect(saved.question).toContain('수정한 본문');
  expect(getEntryQuestions({...entry,...saved})[0].questionText).toContain('수정한 본문');
});
