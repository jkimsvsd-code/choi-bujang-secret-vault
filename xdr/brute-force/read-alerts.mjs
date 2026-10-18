import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('../fixtures/brute-force.json', import.meta.url);
const REDACTED = '[가림]';

// 확인용 출력만 담당합니다. 판정 모듈에서는 이 파일을 불러오지 않습니다.
// 설명에 자격 증명 표기나 토큰 같은 문자열이 있으면 설명 전체를 가립니다.
function safeDescription(value) {
  if (typeof value !== 'string') return null;
  const suspicious = /(?:password|passwd|pwd|secret|token|api[_ -]?key|authorization|cookie|private[_ -]?key|bearer|비밀번호\s*[:=]|암호\s*[:=]|토큰\s*[:=])|[A-Za-z0-9_+/=-]{20,}|https?:\/\/|-----BEGIN/i;
  // 이 가상 경보의 설명은 한글 문장과 숫자입니다. 영문이 섞인 미확인 값도 숨깁니다.
  if (suspicious.test(value) || /[A-Za-z]/.test(value)) return REDACTED;
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ');
}

export function extractAlert(alert) {
  const timestamp = alert?.timestamp;
  const sourceAddress = alert?.data?.srcip;
  const account = alert?.data?.srcuser;
  const level = alert?.rule?.level;
  return {
    timestamp: typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(timestamp)
      && Number.isFinite(Date.parse(timestamp)) ? timestamp : REDACTED,
    sourceAddress: typeof sourceAddress === 'string' && isIP(sourceAddress) ? sourceAddress : REDACTED,
    // 수업용 가상 계정만 출력합니다. 실계정이나 임의 문자열은 출력하지 않습니다.
    account: typeof account === 'string' && /^user\d{2}$/.test(account) ? account : REDACTED,
    level: Number.isInteger(level) && level >= 0 && level <= 16 ? level : null,
    description: safeDescription(alert?.rule?.description),
  };
}

export async function readAlerts() {
  const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== 'brute-force'
    || !Array.isArray(fixture.alerts)) throw new Error('invalid_fixture');
  return fixture.alerts.map(extractAlert);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const row of await readAlerts()) console.log(JSON.stringify(row));
  } catch {
    // 파싱 오류에는 원본 일부가 포함될 수 있으므로 오류 객체를 출력하지 않습니다.
    console.error('경보를 읽지 못했습니다. 입력 파일과 형식을 확인하세요.');
    process.exitCode = 1;
  }
}
