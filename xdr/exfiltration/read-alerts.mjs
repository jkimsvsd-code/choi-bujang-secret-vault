import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('../fixtures/exfiltration.json', import.meta.url);
const REDACTED = '[가림]';

// 확인용 모듈입니다. decide.mjs와 연결하지 않으며 원본을 쓰지 않습니다.
function safeDescription(value) {
  if (typeof value !== 'string') return null;
  // 의심되는 설명은 일부만 지우지 않고 전체를 숨깁니다.
  const suspicious = /password|passwd|pwd|secret|token|api[_ -]?key|authorization|cookie|private[_ -]?key|bearer|비밀번호|암호|토큰|비밀|인증키|-----BEGIN|https?:\/\/|[A-Za-z0-9_+/=-]{20,}/i;
  if (suspicious.test(value)) return REDACTED;
  // 현재 수업 경보의 공개 용어만 허용하고 미확인 영문 값은 숨깁니다.
  const remaining = value.replace(/\b(?:user\d{2})\b/g, '');
  if (/[A-Za-z@=:\/\\]|\d{8,}/.test(remaining)) return REDACTED;
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ');
}

export function extractAlert(alert) {
  const timestamp = alert?.timestamp;
  const sourceAddress = alert?.data?.srcip;
  const account = alert?.data?.srcuser;
  const level = alert?.rule?.level;
  return {
    timestamp: typeof timestamp === 'string'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
      && Number.isFinite(Date.parse(timestamp)) ? timestamp : REDACTED,
    sourceAddress: typeof sourceAddress === 'string' && isIP(sourceAddress) ? sourceAddress : REDACTED,
    // 계정 누락은 추정하지 않고 null, 가상 계정 이외의 값은 가립니다.
    account: account == null ? null
      : typeof account === 'string' && /^user\d{2}$/.test(account) ? account : REDACTED,
    level: Number.isInteger(level) && level >= 0 && level <= 16 ? level : null,
    description: safeDescription(alert?.rule?.description),
  };
}

export async function readAlerts() {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'exfiltration'
    || !Array.isArray(fixture.alerts)) throw new Error('invalid_fixture');
  return fixture.alerts.map(extractAlert);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const row of await readAlerts()) console.log(JSON.stringify(row));
  } catch {
    // 원본을 포함할 수 있는 파싱 오류 객체는 출력하지 않습니다.
    console.error('경보를 읽지 못했습니다. 입력 파일과 형식을 확인하세요.');
    process.exitCode = 1;
  }
}
