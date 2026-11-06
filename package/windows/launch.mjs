import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../app/', import.meta.url));
const data = join(process.env.LOCALAPPDATA, 'Kesev', 'Data');
mkdirSync(data, { recursive: true });
const services = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  const pending = services.filter(child => child.pid && child.exitCode === null && child.signalCode === null);
  const closed = pending.map(child => new Promise(resolve => {
    child.once('exit', resolve);
    child.kill();
  }));
  const deadline = setTimeout(() => process.exit(code), 3000);
  Promise.all(closed).then(() => {
    clearTimeout(deadline);
    process.exit(code);
  });
}

function start(path, address, options) {
  const child = spawn(process.execPath, [join(app, path)], {
    cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true
  });
  services.push(child);
  return new Promise((resolve, reject) => {
    let output = '';
    child.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      output = (output + chunk).slice(-4096);
      if (output.includes(address)) resolve();
    });
    child.once('error', reject);
    child.once('exit', () => {
      reject(new Error('Service stopped: ' + path));
      if (!stopping) {
        console.error('Service stopped: ' + path);
        stop(1);
      }
    });
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
process.on('SIGHUP', () => stop());
try {
  const address = 'http://127.0.0.1:5189/';
  const deadline = setTimeout(() => {
    console.error('Kesev startup timed out.');
    stop(1);
  }, 15000);
  try {
    await Promise.all([
      start('xdr/cloudxdr/server.mjs', 'http://127.0.0.1:8787', {
        cwd: data, env: { ...process.env, CLOUDXDR_PORT:'8787', CLOUDXDR_DB:join(data,'cloudxdr.sqlite') }
      }),
      start('on-client/src/server.mjs', address.slice(0,-1), {
        cwd: join(app,'on-client'), env: { ...process.env, ON_PORT:'5189' }
      })
    ]);
  } finally {
    clearTimeout(deadline);
  }
  if (!stopping) {
    const browser = spawn('explorer.exe', [address], { stdio:'ignore', windowsHide:true });
    browser.on('error', () => console.log('Open ' + address));
    browser.unref();
    console.log('Press Enter to stop Kesev.');
    process.stdin.resume();
    process.stdin.once('data', () => stop());
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
