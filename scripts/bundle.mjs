import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', timeout: 5000, maxBuffer: 512 * 1024, windowsHide: true,
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
}).trim();
const fromCommit = (path) => JSON.parse(git('show', `HEAD:${path}`));
const fail = (message) => { throw new Error(message); };
const secretPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~+/-]{16,}|\bsb_secret_[A-Za-z0-9_-]{12,}|\bsk-[A-Za-z0-9_-]{20,}|\beyJ[A-Za-z0-9_-]{12,}\.eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const repository = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9._-]{1,100})\/?$/iu;
const normalizedRepo = value => {
  const match = typeof value === 'string' && value.length <= 250 && repository.exec(value);
  if (!match) fail('GitHub HTTPS ??μ냼 二쇱냼瑜?origin?쇰줈 ?깅줉??二쇱꽭??');
  const repo = match[2].toLowerCase().replace(/\.git$/u, '');
  if (repo === '.' || repo === '..' || repo === '.git' || repo.endsWith('.git')) {
    fail('GitHub HTTPS ??μ냼 二쇱냼瑜?origin?쇰줈 ?깅줉??二쇱꽭??');
  }
  return `https://github.com/${match[1].toLowerCase()}/${repo}`;
};

try {
  const dirty = git('status', '--porcelain', '--untracked-files=all');
  if (dirty) fail(`而ㅻ컠?섏? ?딆? ?뚯씪???덉뒿?덈떎. 癒쇱? ?뺤씤??二쇱꽭??\n${dirty}`);
  const commit = git('rev-parse', '--verify', 'HEAD');
  let repoUrl;
  try {
    const raw = git('config', '--local', '--no-includes', '--get', 'remote.origin.url');
    const effective = git('remote', 'get-url', 'origin');
    repoUrl = normalizedRepo(raw);
    if (normalizedRepo(effective) !== repoUrl) fail('origin 二쇱냼媛 Git ?ㅼ젙?먯꽌 諛붾뚯뿀?듬땲?? ??μ냼 ?ㅼ젙???뺤씤??二쇱꽭??');
  } catch (error) {
    if (error.message?.startsWith('origin 二쇱냼媛') || error.message?.startsWith('GitHub HTTPS')) throw error;
    fail('GitHub HTTPS ??μ냼 二쇱냼瑜?origin?쇰줈 ?깅줉??二쇱꽭??');
  }
  const changedFiles = git('diff-tree', '--root', '--no-commit-id', '--name-only', '--no-renames', '-r', commit)
    .split(/\r?\n/u).filter(Boolean).sort();
  if (!changedFiles.length) fail('留덉?留?而ㅻ컠??諛붾??뚯씪???놁뒿?덈떎.');
  const config = fromCommit('aleph.config.json');
  if (normalizedRepo(config.repoUrl) !== repoUrl) {
    fail('aleph.config.json??repoUrl??Git origin 二쇱냼? ?ㅻ쫭?덈떎. 媛숈? ??μ냼 二쇱냼濡?留욎떠 二쇱꽭??');
  }
  const notes = JSON.parse(readFileSync(join(root, 'bundle-notes.json'), 'utf8'));
  if (!Number.isInteger(config.step) || config.step < 1 || config.step > 12) fail('aleph.config.json??step???뺤씤??二쇱꽭??');
  if (config.step >= 3 && (!config.identityProvider || typeof config.identityProvider !== 'object'
      || ['issuer', 'audience', 'jwksUrl'].some((key) => typeof config.identityProvider[key] !== 'string'
        || !config.identityProvider[key].trim()))) {
    fail('3?④퀎遺??aleph.config.json??identityProvider??諛쒓툒?먃룸??겶룰났媛쒗궎 二쇱냼媛 ?꾩슂?⑸땲?? 3?④퀎 ?쒖옉 2瑜??ㅼ떆 ?뺤씤??二쇱꽭??');
  }
  if (config.step >= 5 && (typeof config.originalApiUrl !== 'string'
      || !config.originalApiUrl.startsWith('https://'))) {
    fail('5?④퀎遺??aleph.config.json??originalApiUrl???먮낯 ?먮즺 API??HTTPS 二쇱냼媛 ?꾩슂?⑸땲?? 5?④퀎 ?쒖옉 2瑜??ㅼ떆 ?뺤씤??二쇱꽭??');
  }
  if (config.step >= 3 && (!Array.isArray(config.allowedRoutes) || !config.allowedRoutes.length)) {
    fail('3?④퀎遺??aleph.config.json??allowedRoutes???먮즺 API 寃쎈줈媛 ?꾩슂?⑸땲?? 3?④퀎 ?쒖옉 3???ㅼ떆 ?뺤씤??二쇱꽭??');
  }
  const deciderUrl = pathToFileURL(join(root, 'src', 'decider.mjs'));
  const { RULE_IDS } = await import(deciderUrl.href);
  if (!Array.isArray(RULE_IDS)) fail('src/decider.mjs??RULE_IDS??洹쒖튃 ?대쫫 諛곗뿴?댁뼱???⑸땲??');
  const policyRules = [...RULE_IDS];
  if (policyRules.length > 80 || policyRules.some(item => typeof item !== 'string'
      || !/^[a-z][a-z0-9_.-]{0,79}$/iu.test(item)) || new Set(policyRules).size !== policyRules.length) {
    fail('src/decider.mjs??RULE_IDS ?대쫫怨?以묐났???뺤씤??二쇱꽭??');
  }
  if (typeof notes.explanation !== 'string' || notes.explanation.trim().length < 10) {
    fail('bundle-notes.json??explanation???대쾲 ?④퀎?먯꽌 ???쇱쓣 ??以꾨줈 ?곸뼱 二쇱꽭??');
  }
  const checkerUrl = pathToFileURL(join(root, 'src', 'attack-check.mjs'));
  const { runAttackChecks } = await import(checkerUrl.href);
  if (typeof runAttackChecks !== 'function') fail('src/attack-check.mjs媛 runAttackChecks瑜??대낫?댁빞 ?⑸땲??');
  const attackAttempts = await runAttackChecks(config);
  if (!Array.isArray(attackAttempts) || !attackAttempts.length || attackAttempts.length > 20) {
    fail('吏곸젒 ?ㅽ뻾??怨듦꺽 ?먭? 寃곌낵 1~20媛쒓? ?꾩슂?⑸땲??');
  }
  for (const attempt of attackAttempts) {
    if (!attempt || typeof attempt !== 'object' || Array.isArray(attempt)
        || Object.keys(attempt).sort().join(',') !== 'attackId,expected,observed'
        || typeof attempt.attackId !== 'string' || !/^[a-z0-9][a-z0-9_.-]{0,79}$/iu.test(attempt.attackId)
        || typeof attempt.expected !== 'string' || !attempt.expected.trim() || attempt.expected.length > 300
        || typeof attempt.observed !== 'string' || !attempt.observed.trim() || attempt.observed.length > 300) {
      fail('怨듦꺽 ?먭? 寃곌낵?먮뒗 attackId쨌expected쨌observed留??ｌ뼱 二쇱꽭??');
    }
  }
  if (new Set(attackAttempts.map(item => item.attackId)).size !== attackAttempts.length) {
    fail('怨듦꺽 ?먭? ID媛 以묐났?섏뿀?듬땲??');
  }
  const bundle = {
    schema: 'aleph.defense.submission.v2', step: config.step, commit, repoUrl,
    changedFiles, policyRules,
    attackAttempts, explanation: notes.explanation.trim(), blockedAt: notes.blockedAt ?? null,
    identityProvider: config.identityProvider ?? null, allowedRoutes: config.allowedRoutes ?? [],
    originalApiUrl: config.originalApiUrl ?? null, restoreRoute: config.restoreRoute ?? null,
  };
  if (secretPattern.test(JSON.stringify(bundle))) fail('?쒖텧 臾띠쓬??鍮꾨?媛??먮뒗 ?곕씫泥섎줈 蹂댁씠???댁슜???덉뒿?덈떎.');
  mkdirSync(join(root, 'artifacts'), { recursive: true });
  const output = join(root, 'artifacts', 'submission.json');
  writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: 'utf8', flag: 'w' });
  process.stdout.write(`?쒖텧 臾띠쓬 JSON ?앹꽦: ${output}\n?④퀎 ${bundle.step} 쨌 而ㅻ컠 ${commit.slice(0, 12)} 쨌 諛붾??뚯씪 ${changedFiles.length}媛?쨌 洹쒖튃 ${policyRules.length}媛?쨌 吏곸젒 ?먭? ${attackAttempts.length}媛?n`);
} catch (error) {
  process.stderr.write(`?쒖텧 臾띠쓬 ?앹꽦 以?泥??ㅻ쪟: ${error.message}\n`);
  process.exitCode = 1;
}
