import test from 'node:test';
import assert from 'node:assert/strict';
import {describeAvailability,renderAvailability} from '../public/availability-view.mjs';
test('response status takes priority over reported mode',()=>{
  for(const mode of ['demo','connected','disconnected','unknown']){
    assert.match(describeAvailability({status:'error',meta:{mode}}),/확인 불가/);
    assert.match(describeAvailability({status:'loading',meta:{mode}}),/응답 대기/);
  }
  assert.match(describeAvailability({status:'ok',meta:{mode:'demo'}}),/^예제 자료/);
  assert.match(describeAvailability({status:'ok',meta:{mode:'connected'}}),/^서버 자료/);
  assert.match(describeAvailability({status:'ok',meta:{mode:'disconnected'}}),/연결 없음/);
  assert.match(describeAvailability({status:'ok',meta:{mode:'unexpected'}}),/확인 불가/);
  assert.match(describeAvailability(),/조회 전/);
});
test('mixed sources stay separate and never imply PC or SDP success',()=>{
  class Node{constructor(tag){this.tagName=tag;this.children=[];this.textContent='';}setAttribute(k,v){this[k]=v;}appendChild(n){this.children.push(n);}replaceChildren(){this.children=[];}}
  const prior=globalThis.document;globalThis.document={createElement:tag=>new Node(tag)};
  try{
    const root=new Node();renderAvailability(root,{me:{status:'ok',meta:{mode:'demo',checkedAt:'2026-10-27T00:00:00Z'}},apps:{status:'ok',meta:{mode:'connected'}},events:{status:'error',meta:{mode:'connected'}}});
    const text=n=>n.textContent+n.children.map(text).join(' ');const result=text(root);
    const walk=n=>[n,...n.children.flatMap(walk)];
    const rows=walk(root).filter(n=>n.tagName==='tr');
    assert.deepEqual(rows[0].children.map(n=>n.textContent),['항목','자료 구분','확인 시각']);
    assert.equal(rows.length,7);
    assert.ok(rows[0].children.every(n=>n.scope==='col'));
    assert.ok(rows.slice(1).every(n=>n.children[0].scope==='row'));
    assert.equal(rows[1].children[1].textContent,'예제 자료');
    assert.equal(rows[4].children[1].textContent,'서버 자료(실제 응답)');
    assert.match(rows[6].children[1].textContent,/확인 불가/);
    assert.equal(rows[4].children[2].textContent,'제공되지 않음');
    assert.match(result,/업무 앱 접속 판정 조회 전/);assert.match(result,/KST/);
    assert.match(result,/PC 조회 성공과 별개/);assert.match(result,/개별 카드에서 다시/);
    renderAvailability(root,{});assert.doesNotMatch(text(root),/로그인 예제 자료/);
  }finally{globalThis.document=prior;}
});
