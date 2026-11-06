import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionSummary, connectMessage, nativeLoginView} from '../public/ai-connect.mjs';

// Synthetic states only: these tests do not contact an account or AI service.
const checkedAt='2026-11-02T00:00:00.000Z';
const now=Date.parse(checkedAt);
const nativeState={phase:'connected',expiresAtMs:now+60000,checkedAt};
const approvalState={phase:'connected',checkedAt};
const aiCheck={status:'ok',data:{transportChecked:true,audienceAuthorization:'verified',modelCount:1},meta:{mode:'disconnected',checkedAt}};
const service={status:'error',error:{code:'ENGINE_NOT_CONNECTED'},meta:{mode:'disconnected',checkedAt}};

test('account and AI remain verified when the business service is disconnected',()=>{
  const result=connectionSummary({nativeState,approvalState,aiCheck,service,now});
  assert.deepEqual(result.map(x=>x.tone),['ok','ok','empty']);
  assert.equal(result[2].text,'미연결');
  assert.match(result[1].detail,/모델 1개/);
  assert.ok(result.every(x=>x.checkedAt===checkedAt));
  assert.doesNotMatch(result.map(x=>x.detail).join(' '),/「계정 연결 시작」|「AI 연결 시작」/);
});

test('approval completion alone is not proof of model availability',()=>{
  const result=connectionSummary({approvalState,now});
  assert.equal(result[0].text,'미확인');
  assert.equal(result[1].text,'승인 완료 · 점검 전');
  assert.notEqual(result[1].tone,'ok');
  assert.match(result[1].detail,/반복할 필요는 없습니다/);
  assert.equal(result[2].text,'미확인');
});

test('existing AI permission can be checked after page reload without restarting approval',()=>{
  const result=connectionSummary({aiCheck,now});
  assert.equal(result[1].tone,'ok');
  assert.equal(result[0].text,'미확인'); // Never infer a separate login check.
  assert.equal(result[0].checkedAt,null);
  assert.doesNotMatch(connectMessage({phase:'connected'}),/「AI 연결 시작」/);
  assert.doesNotMatch(nativeLoginView(nativeState,now).message,/「AI 연결 시작」/);
});

test('failed AI checks preserve the distinction between approval and availability',()=>{
  const result=connectionSummary({approvalState,aiCheck:{status:'error',meta:{checkedAt}},now});
  assert.equal(result[1].tone,'error');
  assert.match(result[1].detail,/사용 승인 완료/);
  assert.match(result[1].detail,/취소됐다고 판단하지 않습니다/);
});

test('expired login, pending checks and invalid model results never retain success',()=>{
  assert.equal(connectionSummary({nativeState,now:now+60001})[0].text,'확인 기한 지남');
  assert.equal(connectionSummary({nativeState,now:now+60001})[0].checkedAt,null);
  assert.equal(connectionSummary({aiCheck:{...aiCheck,status:'loading'},now})[1].tone,'loading');
  assert.equal(connectionSummary({aiCheck,approvalState:{phase:'starting'},now})[1].tone,'loading');
  for(const override of [{audienceAuthorization:'test'},{modelCount:0},{transportChecked:false}]) {
    assert.notEqual(connectionSummary({aiCheck:{...aiCheck,data:{...aiCheck.data,...override}},now})[1].tone,'ok');
  }
  assert.notEqual(connectionSummary({aiCheck:{...aiCheck,meta:{mode:'demo',checkedAt}},now})[1].tone,'ok');
});

test('business data needs its own successful active response',()=>{
  assert.notEqual(connectionSummary({service:{...service,meta:{mode:'connected',checkedAt}},now})[2].tone,'ok');
  const active={status:'ok',data:{session:{status:'active'}},meta:{mode:'connected',checkedAt}};
  const result=connectionSummary({service:active,now});
  assert.equal(result[2].tone,'ok');
  assert.match(result[2].detail,/터널 연결 성공은 별도로/);
  assert.equal(result[0].text,'미확인');
  assert.equal(result[1].text,'미확인');
});

test('demo projections never display actual success or actual timestamps',()=>{
  const result=connectionSummary({nativeState,approvalState,aiCheck,service,demo:true,now});
  assert.ok(result.every(x=>x.tone==='demo'&&x.text==='예제'&&x.checkedAt===null));
});

test('local view reset means unchecked, not a rejected or cancelled login',()=>{
  const reset={phase:'unknown',reason:'NATIVE_LOGIN_LOCAL_RESET',cancelUnconfirmed:false,checkedAt};
  const item=connectionSummary({nativeState:reset,now})[0];
  assert.equal(item.text,'미확인');
  assert.equal(item.tone,'empty');
  assert.equal(item.checkedAt,null);
  assert.equal(nativeLoginView(reset,now).kind,'empty');
  assert.match(nativeLoginView(reset,now).message,/취소한 것은 아닙니다/);
  assert.equal(connectionSummary({nativeState:{...reset,cancelUnconfirmed:true},now})[0].tone,'error');
});
