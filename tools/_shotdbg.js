'use strict';
/* 调试：找出本机 Chrome/Edge 可用的无头截图参数组合 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = 'C:\\Users\\Public\\cslearn-shots\\';
fs.mkdirSync(OUT, { recursive: true });

function run(name, bin, args, checkFile) {
  console.log('\n--- ' + name + ' ---');
  if (!fs.existsSync(bin)) { console.log('binary missing: ' + bin); return; }
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 60000 });
  console.log('status=' + r.status + ' signal=' + r.signal + (r.error ? ' error=' + r.error.message : ''));
  console.log('stdout: ' + (r.stdout || '').slice(0, 260).replace(/\n/g, ' | '));
  console.log('stderr: ' + (r.stderr || '').slice(0, 260).replace(/\n/g, ' | '));
  if (checkFile) {
    console.log(checkFile + ' => ' + (fs.existsSync(checkFile) ? fs.statSync(checkFile).size + ' bytes' : 'MISSING'));
  }
}

run('chrome --version', CHROME, ['--version']);
run('chrome dump-dom', CHROME, ['--headless=new', '--disable-gpu', '--dump-dom', 'http://127.0.0.1:8642/']);
run('chrome shot new', CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--user-data-dir=' + OUT + 'p1', '--window-size=1280,900', '--screenshot=' + OUT + 't3.png', 'http://127.0.0.1:8642/#/'], OUT + 't3.png');
run('chrome shot headless-plain', CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--user-data-dir=' + OUT + 'p2', '--window-size=1280,900', '--screenshot=' + OUT + 't4.png', 'http://127.0.0.1:8642/#/'], OUT + 't4.png');
run('edge shot', EDGE, ['--headless=new', '--disable-gpu', '--no-sandbox', '--user-data-dir=' + OUT + 'p3', '--window-size=1280,900', '--screenshot=' + OUT + 't5.png', 'http://127.0.0.1:8642/#/'], OUT + 't5.png');
console.log('\nDONE');
