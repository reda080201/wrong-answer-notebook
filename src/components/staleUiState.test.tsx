
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import StudyZoomViewport from './StudyZoomViewport';
import QuestionBankDetail from '../features/question-bank/components/QuestionBankDetail';
import type {QuestionBankItem} from '../features/question-bank/model/questionBankTypes';
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.clear();});
it('never writes the previous viewport values under the next key',()=>{
 localStorage.setItem('probe-A','150');localStorage.setItem('probe-A:hidden','true');
 localStorage.setItem('probe-B','100');localStorage.setItem('probe-B:hidden','false');
 const spy=vi.spyOn(Storage.prototype,'setItem');
 const view=render(<StudyZoomViewport storageKey="probe-A">A</StudyZoomViewport>);
 spy.mockClear();
 view.rerender(<StudyZoomViewport storageKey="probe-B">B</StudyZoomViewport>);
 const writes=spy.mock.calls.filter(([k])=>k.startsWith('probe-B'));
 
 expect(writes).not.toContainEqual(['probe-B','150']);
 expect(writes).not.toContainEqual(['probe-B:hidden','true']);
 expect(localStorage.getItem('probe-B')).toBe('100');
 expect(localStorage.getItem('probe-B:hidden')).toBe('false');
});
it('preserves same-id draft and failed payload through projection replacement',async()=>{
 const item:QuestionBankItem={id:'synthetic:1',entryId:'synthetic',entryTitle:'Synthetic',entryKind:'problem_sheet',questionNumber:'1',subject:'수학',questionText:'합성 문항',source:{type:'unknown'},classification:{subject:'수학',sourceType:'unknown',answerType:'unknown',isPastExam:false,unit:'원래 단원'},questionImages:[],sourcePageImages:[],hasAnswer:false,hasExplanation:false,hasImages:false,isWrong:false,isMastered:false,reviewDue:false,updatedAt:'2026-01-01T00:00:00Z'};
 const save=vi.fn().mockRejectedValue(new Error('synthetic storage failure'));
 const props={inline:true,onClose:vi.fn(),onOpenQuestion:vi.fn(),onPatchClassification:save};
 const view=render(<QuestionBankDetail item={item} {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:/분류 편집/}));
 fireEvent.change(screen.getByLabelText('단원'),{target:{value:'미저장 편집 단원'}});
 fireEvent.click(screen.getByRole('button',{name:'분류 저장'}));
 await screen.findByText('synthetic storage failure');
 expect(save.mock.calls[0][2].classification.unit).toBe('미저장 편집 단원');
 view.rerender(<QuestionBankDetail item={{...item,entryTitle:'Synthetic renamed'}} {...props}/>);
 const errorGone=!screen.queryByText('synthetic storage failure');
 const collapsed=screen.getByRole('button',{name:/분류 편집/}).getAttribute('aria-expanded');
 const value=(screen.getByLabelText('단원') as HTMLInputElement).value;
 
 expect(errorGone).toBe(false);expect(collapsed).toBe('true');expect(value).toBe('미저장 편집 단원');
 fireEvent.click(screen.getByRole('button',{name:'다시 저장'})); await screen.findByText('synthetic storage failure'); expect(save.mock.calls[1][2]).toEqual(save.mock.calls[0][2]);
});

it('preserves dirty conflicting fields and refreshes untouched fields',async()=>{
 const item:QuestionBankItem={id:'synthetic:1',entryId:'synthetic',entryTitle:'Synthetic',entryKind:'problem_sheet',questionNumber:'1',subject:'수학',questionText:'합성 문항',source:{type:'unknown'},classification:{subject:'수학',sourceType:'unknown',answerType:'unknown',isPastExam:false,unit:'원래 단원'},questionImages:[],sourcePageImages:[],hasAnswer:false,hasExplanation:false,hasImages:false,isWrong:false,isMastered:false,reviewDue:false,updatedAt:'2026-01-01T00:00:00Z'};
 const save=vi.fn().mockResolvedValue(undefined);
 const props={inline:true,onClose:vi.fn(),onOpenQuestion:vi.fn(),onPatchClassification:save};
 const view=render(<QuestionBankDetail item={item} {...props}/>);
 fireEvent.click(screen.getByRole('button',{name:/분류 편집/}));
 fireEvent.change(screen.getByLabelText('단원'),{target:{value:'내 단원'}});
 view.rerender(<QuestionBankDetail item={{...item,classification:{...item.classification,unit:'외부 단원',tags:['외부 태그']}}} {...props}/>);
 expect(screen.getByLabelText('단원')).toHaveValue('내 단원');
 expect(screen.getByLabelText('태그 (쉼표)')).toHaveValue('외부 태그');
 expect(screen.getByRole('alert')).toHaveTextContent('단원');
 expect(save).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'내 편집값으로 저장'}));
 await screen.findByRole('button',{name:'분류 저장'});
 expect(save).toHaveBeenCalledWith(item.entryId,item.questionNumber,expect.objectContaining({classification:expect.objectContaining({unit:'내 단원',tags:['외부 태그']})}));
});
