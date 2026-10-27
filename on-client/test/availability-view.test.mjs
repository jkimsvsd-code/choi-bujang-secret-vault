import test from 'node:test';
import assert from 'node:assert/strict';
import {describeAvailability,renderAvailability} from '../public/availability-view.mjs';
test('response status takes priority over reported mode',()=>{
  for(const mode of ['demo','connected','disconnected','unknown']){
    assert.match(describeAvailability({status:'error',meta:{mode}}),/확인 불가/);
    assert.match(describeAvailability({status:'loading',meta:{mode}}),/응답 대기/);
  }
  assert.match(describeAvailability({status:'ok',meta:{mode:'demo'}}),/^예제 자료/);
  assert.match(describeAvailability({status:'ok',meta:{mode:'connected'}}),/^연결된 자료/);
  assert.match(describeAvailability({status:'ok',meta:{mode:'disconnected'}}),/연결 없음/);
  assert.match(describeAvailability({status:'ok',meta:{mode:'unexpected'}}),/확인 불가/);
  assert.match(describeAvailability(),/조회 전/);
});
test('mixed sources stay separate and never imply PC or SDP success',()=>{
  class Node{constructor(){this.children=[];this.textContent='';}appendChild(n){this.children.push(n);}replaceChildren(){this.children=[];}}
  const prior=globalThis.document;globalThis.document={createElement:()=>new Node()};
  try{
    const root=new Node();renderAvailability(root,{me:{status:'ok',meta:{mode:'demo',checkedAt:'2026-10-27T00:00:00Z'}},apps:{status:'ok',meta:{mode:'connected'}},events:{status:'error',meta:{mode:'connected'}}});
    const text=n=>n.textContent+n.children.map(text).join(' ');const result=text(root);
    assert.match(result,/로그인: 예제 자료/);assert.match(result,/업무 앱 목록: 연결된 자료/);assert.match(result,/보안 기록: 확인 불가/);
    assert.match(result,/업무 앱 접속 판정: 조회 전/);assert.match(result,/KST/);
    assert.match(result,/PC 조회 성공과 별개/);assert.match(result,/학생 카드에서 따로/);
    renderAvailability(root,{});assert.doesNotMatch(text(root),/로그인: 예제 자료/);
  }finally{globalThis.document=prior;}
});
