// Exercises packaged IPC/UI with an older-version simulation against real GitHub.
// Uses an isolated profile and download folder; no user windows are touched.
const { _electron: electron, chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
async function main() {
  const root = path.resolve(__dirname, '..');
  const directory = await fs.mkdtemp(path.join(root, '.test-data/update-ui-'));
  let application, restarted;
  try {
    const env = { ...process.env, SADE_SQL_DATA_DIR: path.join(directory, 'profile') }; delete env.ELECTRON_RUN_AS_NODE;
    application = await electron.launch({ executablePath: process.env.SADE_SQL_EXE, env });
    const page = await application.firstWindow(); await page.locator('#check-update').waitFor();
    // Electron's native will-prevent-unload handler answers this confirmation.
    // Prevent Playwright from racing it with its automatic dialog dismissal.
    page.on('dialog', () => {});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await application.evaluate(({ app }, directory) => {
      const { Updater } = process.mainModule.require(process.mainModule.require('node:path').join(app.getAppPath(), 'src/updater.js'));
      const check = Updater.prototype.check;
      Updater.prototype.check = function () {
        this.current = '1.0.3'; this.directory = directory;
        // Pin this real public fixture release so the test remains repeatable
        // after future versions are published. Production always uses /latest.
        this.fetcher = (url, options) => fetch(url.endsWith('/latest') ? url.replace('/latest', '/tags/v1.0.4') : url, options);
        return check.call(this);
      };
    }, path.join(directory, 'downloads'));
    await page.locator('#check-update').click();
    await page.locator('#update-message').filter({ hasText: 'Yeni sürüm hazır: 1.0.4' }).waitFor({ timeout: 30000 });
    await page.locator('#update-action').click();
    await page.locator('#update-message').filter({ hasText: 'indirildi ve doğrulandı' }).waitFor({ timeout: 180000 });
    const file = path.join(directory, 'downloads/Sade-SQL-1.0.4-Windows.exe');
    assert.ok((await fs.stat(file)).size > 100_000_000);
    await page.locator('#update-dialog .close-dialog').click();
    await page.locator('#sql').fill('SELECT 42;');
    await page.keyboard.press('Control+s'); await page.locator('#query-name').fill('Update persistence test');
    await page.locator('#save-form button[type=submit]').click();
    await page.locator('#save-dialog').waitFor({ state: 'hidden' });
    await page.locator('#query-list').filter({ hasText: 'Update persistence test' }).waitFor();
    await page.locator('#sql').fill('SELECT 42; -- unsaved update test');
    const marker = path.join(directory, 'relaunch.json');
    await application.evaluate(({ app, dialog }, marker) => {
      dialog.showMessageBoxSync = () => 0;
      process.__sadeTestRelaunch = app.relaunch.bind(app);
      app.relaunch = options => process.mainModule.require('node:fs').writeFileSync(marker, JSON.stringify(options));
    }, marker);
    await page.locator('#check-update').click(); await page.locator('#update-action').click();
    assert.equal(await page.locator('#sql').inputValue(), 'SELECT 42; -- unsaved update test');
    await assert.rejects(() => fs.access(marker));
    const port = await new Promise(resolve => { const server = require('node:net').createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
    await application.evaluate(({ app, dialog }, { port, marker }) => {
      dialog.showMessageBoxSync = () => 1;
      const relaunch = process.__sadeTestRelaunch;
      app.relaunch = options => {
        process.mainModule.require('node:fs').writeFileSync(marker, JSON.stringify(options));
        relaunch({ ...options, args: ['--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1'] });
      };
    }, { port, marker });
    await page.locator('#update-action').click().catch(() => {});
    const deadline = Date.now() + 10000;
    let scheduled;
    while (Date.now() < deadline) {
      try { scheduled = JSON.parse(await fs.readFile(marker, 'utf8')); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.equal(scheduled?.execPath, file); assert.deepEqual(scheduled.args, []);
    assert.deepEqual(errors, []);
    const restartDeadline = Date.now() + 60000;
    while (Date.now() < restartDeadline) {
      try { restarted = await chromium.connectOverCDP('http://127.0.0.1:' + port, { timeout: 1000 }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    assert.ok(restarted, 'Downloaded portable EXE must actually restart');
    const newPage = restarted.contexts()[0].pages()[0];
    await newPage.locator('.version').filter({ hasText: 'v1.0.4' }).waitFor();
    await newPage.locator('#query-list').filter({ hasText: 'Update persistence test' }).waitFor();
    await newPage.evaluate(() => window.close()); await restarted.close(); restarted = null;
    // Preserve the verified real release download for a separate normal EXE launch.
    const output = path.join(root, '.test-data/verified-update-1.0.4.exe');
    await fs.copyFile(file, output);
    console.log('PASS: real GitHub v1.0.4 detection/download/hash through packaged UI/IPC, unsaved-close cancellation, actual portable relaunch and saved-query persistence. Verified EXE: ' + output);
  } finally {
    if (application) {
      await application.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
      await application.close().catch(() => {});
    }
    if (restarted) await restarted.close().catch(() => {});
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
