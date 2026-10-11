import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(
  await readFile(resolve(root, 'aleph.config.json'), 'utf8'),
);

if (!Number.isInteger(config.step) || config.step < 2) {
  throw new Error('이 빌드는 2단계 이상에서만 실행할 수 있습니다.');
}

await mkdir(resolve(root, 'public'), { recursive: true });

if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);

  await writeFile(
    resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`,
    'utf8',
  );

  console.log('배포 식별 정보를 public/aleph.json에 기록했습니다.');
}