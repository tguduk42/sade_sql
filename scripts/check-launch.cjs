const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
async function main() {
  const data = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'sade-sql-launch-'));
  let browser, page, child;
  try {
    const env = { ...process.env, SADE_SQL_DATA_DIR: data }; delete env.ELECTRON_RUN_AS_NODE;
    const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
    const version = require('../package.json').version;
    const executable = process.env.SADE_SQL_EXE || path.resolve(__dirname, '../dist/Sade-SQL-' + version + '-Windows.exe');
    child = spawn(executable, ['--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1'], { env, windowsHide: true, stdio: 'ignore' });
    let launchError; child.on('error', error => { launchError = error; });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      try { browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    if (!browser) throw new Error('Portable executable did not expose its application window within 60 seconds.');
    page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].waitForEvent('page');
    await page.locator('#query-title').waitFor();
    if ((await page.title()) !== 'Sade SQL') throw new Error('Unexpected window title.');
    console.log('PASS: portable EXE extracted, started and displayed the SQL workspace.');
  } finally {
    if (page) await page.evaluate(() => window.close()).catch(() => {});
    if (browser) await browser.close();
    if (child && child.exitCode === null) {
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
    }
    await fs.rm(data, { recursive: true, force: true, maxRetries: 3 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
