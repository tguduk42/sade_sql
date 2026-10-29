const { _electron: electron } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { fixture } = require('../test/fixture');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const root = path.resolve(__dirname, '..');
async function smoke() {
  let local;
  if (process.argv.includes('--docker')) {
    const { execFileSync } = require('node:child_process');
    const run = args => execFileSync('wsl.exe', ['-d', 'Ubuntu', '--', 'docker', ...args], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const inspected = JSON.parse(run(['inspect', 'whatsapp-postgres-1']))[0];
    const settings = Object.fromEntries(inspected.Config.Env.map(value => { const index = value.indexOf('='); return [value.slice(0, index), value.slice(index + 1)]; }));
    const directory = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'sade-sql-docker-ui-'));
    local = { directory, connection: { host: '127.0.0.1', port: 15432, database: settings.POSTGRES_DB || settings.POSTGRES_USER || 'postgres', user: settings.POSTGRES_USER || 'postgres', password: settings.POSTGRES_PASSWORD || (settings.POSTGRES_PASSWORD_FILE ? run(['exec', 'whatsapp-postgres-1', 'cat', settings.POSTGRES_PASSWORD_FILE]).trimEnd() : '') },
      close: () => fs.rm(directory, { recursive: true, force: true, maxRetries: 3 }) };
  } else { local = await fixture(); }
  let application;
  const errors = [];
  const output = path.join(root, 'test-output');
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env, SADE_SQL_DATA_DIR: path.join(local.directory, 'desktop') };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = process.env.SADE_SQL_EXE || require('electron');
  const launch = async () => {
    const app = await electron.launch({ executablePath, args: process.env.SADE_SQL_EXE ? [] : [root], env, timeout: 30000 });
    assert.equal(await app.evaluate(({ app }) => app.getVersion()), require('../package.json').version);
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('#query-title').waitFor();
    // Existing regression assertions deliberately inspect the unformatted data.
    // Default money rendering has a dedicated headless renderer test.
    await page.locator('#number-format').selectOption('raw');
    return { app, page };
  };
  try {
    let desktop = await launch(); application = desktop.app; let page = desktop.page;
    await page.click('#add-connection');
    const form = page.locator('#connection-form');
    await form.locator('[name=name]').fill('Yerel PostgreSQL');
    await form.locator('[name=host]').fill(local.connection.host);
    await form.locator('[name=port]').fill(String(local.connection.port));
    await form.locator('[name=database]').fill(local.connection.database);
    await form.locator('[name=user]').fill(local.connection.user);
    await form.locator('[name=rememberPassword]').check();
    await form.locator('[name=password]').fill(local.connection.password || 'fixture-only');
    await form.locator('[name=port]').fill('1');
    await page.click('#test-connection');
    await page.waitForFunction(() => document.querySelector('#connection-message').textContent.includes('bağlantısı reddedildi'));
    await form.locator('[name=port]').fill(String(local.connection.port));
    await page.click('#test-connection');
    await page.getByText('Bağlantı başarılı · ' + local.connection.database, { exact: true }).waitFor();
    await form.locator('button[type=submit]').click();
    await page.locator('#connection-dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !document.querySelector('#table-list').textContent.includes('yükleniyor'));
    if (process.argv.includes('--docker')) {
      assert.ok(await page.locator('.table-item').count() > 0, 'Docker catalog should contain tables');
      const item = page.locator('.table-item').first();
      const schema = await item.getAttribute('data-schema'), table = await item.getAttribute('data-table');
      await page.locator('#table-search').fill(table);
      assert.ok(await page.locator('.table-item').count() > 0);
      await page.locator('#table-search').fill('');
      await item.click();
      const quote = value => '"' + value.replaceAll('"', '""') + '"';
      assert.equal(await page.locator('#sql').inputValue(), 'SELECT * FROM ' + quote(schema) + '.' + quote(table) + ';');
      // Discard only the generated draft; never execute user tables in this test.
      await page.click('#new-query'); await page.click('#confirm-yes');
    }
    const originalSQL = `SELECT i AS "Kayıt No", 'İstanbul'::text AS "Şehir", 'Aktif'::text AS "Durum", (i * 12.50)::numeric(12,2) AS "Tutar"\nFROM generate_series(1,25000) AS i\nORDER BY i;`;
    await page.locator('#sql').fill(originalSQL);
    await page.click('#save-query');
    await page.locator('#query-name').fill('Müşteri raporu');
    await page.locator('#save-form button[type=submit]').click();
    await page.locator('#save-dialog').waitFor({ state: 'hidden' });
    const modifiedSQL = originalSQL + '\n-- Ctrl+S update verified';
    const beforeUpdate = JSON.parse(await fs.readFile(path.join(env.SADE_SQL_DATA_DIR, 'workspace.json'), 'utf8'));
    await page.locator('#sql').fill(modifiedSQL);
    await page.locator('#sql').press('Control+s');
    await page.waitForFunction(() => document.querySelector('#dirty').hidden);
    assert.equal(await page.locator('#save-dialog').isVisible(), false);
    const afterUpdate = JSON.parse(await fs.readFile(path.join(env.SADE_SQL_DATA_DIR, 'workspace.json'), 'utf8'));
    assert.equal(afterUpdate.queries.length, beforeUpdate.queries.length);
    assert.equal(afterUpdate.queries[0].id, beforeUpdate.queries[0].id);
    assert.equal(afterUpdate.queries[0].sql, modifiedSQL);
    await page.click('#run-query');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1000);
    assert.equal(await page.locator('thead th').count(), 5);
    assert.equal(await page.locator('tbody tr:first-child td').nth(2).textContent(), 'İstanbul');
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 660));
    await page.screenshot({ path: path.join(output, 'sade-sql-small.png') });
    const layout = await page.evaluate(() => ({ height: innerHeight, footer: document.querySelector('.sidebar-bottom').getBoundingClientRect().bottom, queries: document.querySelector('#query-list').getBoundingClientRect().height }));
    assert.ok(layout.footer <= layout.height + 1 && layout.queries >= 64, 'Sidebar must fit minimum window size: ' + JSON.stringify(layout));
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1380, 880));
    await page.screenshot({ path: path.join(output, 'sade-sql.png') });
    // Override only the native destination picker; click the real export buttons and execute IPC/DB/writers.
    for (const format of ['csv', 'xlsx']) {
      const destination = path.join(output, 'desktop-result.' + format);
      await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, destination);
      await page.click('#export-' + format);
      await page.waitForFunction(() => document.querySelector('#status-text').textContent.includes('25.000 satır dosyaya kaydedildi'), null, { timeout: 30000 });
      if (format === 'csv') {
        const data = await fs.readFile(destination, 'utf8'); assert.equal(data.split('\r\n').length, 25002);
      } else {
        const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(destination); assert.equal(workbook.worksheets[0].rowCount, 25001);
      }
    }
    // Native Windows safeStorage must encrypt and decrypt the fixture password.
    const crypto = await application.evaluate(({ safeStorage }) => ({ available: safeStorage.isEncryptionAvailable(), roundTrip: safeStorage.decryptString(safeStorage.encryptString('fixture-only')) }));
    assert.equal(crypto.available, true); assert.equal(crypto.roundTrip, 'fixture-only');
    const disk = await fs.readFile(path.join(env.SADE_SQL_DATA_DIR, 'workspace.json'), 'utf8'); assert.equal(disk.includes('fixture-only'), false);
    if (local.connection.password) assert.equal(disk.includes(local.connection.password), false);
    await page.click('#new-query');
    await page.locator('.query-item').filter({ hasText: 'Müşteri raporu' }).dblclick();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1000);
    assert.ok((await page.locator('#sql').inputValue()).includes('generate_series'));
    await application.close(); application = null;
    desktop = await launch(); application = desktop.app; page = desktop.page;
    await page.locator('.query-item').filter({ hasText: 'Müşteri raporu' }).click();
    assert.equal(await page.locator('#sql').inputValue(), modifiedSQL);
    await page.click('#run-query');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1000);
    assert.equal(errors.length, 0, errors.join('\n'));
    const csvPreviousSQL = await page.locator('#sql').inputValue();
    await page.locator('#sql').fill(`SELECT 'Çağrı İıŞşĞğÜüÖöÇç' AS "Açıklama", 1234.56::numeric AS tutar, -12.34::numeric AS eksi, 0.18::numeric AS oran, '00123.45'::text AS kod`);
    assert.equal(await page.locator('#csv-mode').inputValue(), 'excel-tr');
    for (const csvMode of ['excel-tr', 'excel-tr-legacy', 'standard']) {
      await page.locator('#csv-mode').selectOption(csvMode);
      const destination = path.join(output, 'csv-locale', csvMode + '.csv');
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, destination);
      // Clear the previous export's status to wait for this export specifically.
      await page.evaluate(() => document.querySelector('#status-text').textContent = '');
      await page.click('#export-csv');
      await page.waitForFunction(() => document.querySelector('#status-text').textContent.includes('1 satır dosyaya kaydedildi'));
      const data = await fs.readFile(destination);
      const decoded = csvMode === 'excel-tr-legacy' ? new TextDecoder('windows-1254').decode(data) : data.toString('utf8');
      assert.ok(decoded.includes('Çağrı İıŞşĞğÜüÖöÇç'));
      assert.ok(decoded.includes(csvMode === 'standard' ? ',1234.56,-12.34,0.18,' : ';1234,56;-12,34;0,18;'));
      assert.ok(decoded.includes('00123.45'));
    }
    await page.locator('#sql').fill(csvPreviousSQL);
    await page.locator('#csv-mode').selectOption('excel-tr');
    console.log('PASS: all three CSV choices use real IPC/database export; Turkish text, decimal amounts and text IDs preserved.');
    // SQL completion is local: keyword, real metadata columns/aliases and string/comment exclusion.
    await page.locator('#sql').fill('SEL');
    await page.locator('#sql').press('Control+Space');
    await page.locator('#completions').waitFor({ state: 'visible' });
    const keywordOptions = await page.locator('.completion-name').allTextContents();
    const selectIndex = keywordOptions.indexOf('SELECT'); assert.ok(selectIndex >= 0);
    for (let index = 0; index < selectIndex; index++) await page.locator('#sql').press('ArrowDown');
    await page.locator('#sql').press('Tab'); assert.equal(await page.locator('#sql').inputValue(), 'SELECT');
    if (process.argv.includes('--docker')) {
      await page.waitForFunction(() => document.querySelectorAll('.table-item').length > 0);
      const tableItem = page.locator('.table-item').first();
      const quote = value => '"' + value.replaceAll('"', '""') + '"';
      const tableSQL = 'SELECT t. FROM ' + quote(await tableItem.getAttribute('data-schema')) + '.' + quote(await tableItem.getAttribute('data-table')) + ' t';
      await page.locator('#sql').fill(tableSQL);
      await page.locator('#sql').evaluate(element => { element.focus(); element.setSelectionRange(9, 9); });
      await page.locator('#sql').press('Control+Space'); await page.locator('#completions').waitFor({ state: 'visible' });
      const column = await page.locator('.completion-name').first().textContent();
      await page.locator('#sql').press('Tab'); assert.ok((await page.locator('#sql').inputValue()).startsWith('SELECT t.' + quote(column)));
    }
    await page.locator('#sql').fill('SELECT 1 -- SEL'); await page.locator('#sql').press('Control+Space'); assert.equal(await page.locator('#completions').isVisible(), false);
    const parameterSQL = 'SELECT :message::text AS message, :exact::numeric AS exact, :flag::boolean AS flag, :day::date AS day, :payload::jsonb AS payload, :optional::text AS optional WHERE :flag::boolean';
    await page.locator('#sql').fill(parameterSQL);
    await page.locator('#parameters').waitFor({ state: 'visible' });
    const sample = "Test'; SELECT 'İstanbul' --";
    const fillParameter = async (name, value, type = 'text') => {
      const row = page.locator('.parameter-row[data-parameter="' + name + '"]');
      await row.locator('select').selectOption(type); await row.locator('.parameter-input').fill(value);
    };
    await fillParameter('message', sample); await fillParameter('exact', '9007199254740993.123456', 'number');
    await fillParameter('flag', 'true', 'boolean'); await fillParameter('day', '2026-10-20', 'date'); await fillParameter('payload', '[1,"İstanbul"]', 'json');
    await page.locator('.parameter-row[data-parameter="optional"] input[type=checkbox]').check();
    await page.click('#run-query'); await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    assert.equal(await page.locator('tbody tr td').nth(1).textContent(), sample);
    assert.equal(await page.locator('tbody tr td').nth(2).textContent(), '9007199254740993.123456');
    assert.equal(await page.locator('tbody tr td').nth(4).textContent(), '2026-10-20');
    assert.equal(await page.locator('tbody tr td').nth(6).textContent(), 'NULL');
    await page.locator('#sql').press('Control+s'); await page.waitForFunction(() => document.querySelector('#dirty').hidden);
    const parameterDisk = await fs.readFile(path.join(env.SADE_SQL_DATA_DIR, 'workspace.json'), 'utf8');
    assert.ok(parameterDisk.includes(':message')); assert.equal(parameterDisk.includes(sample), false); assert.equal(parameterDisk.includes('9007199254740993.123456'), false);
    await page.screenshot({ path: path.join(output, 'parameters-completion.png') });
    for (const format of ['csv','xlsx']) {
      const destination = path.join(output, 'parameter-result.' + format);
      await application.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, destination);
      await page.click('#export-' + format);
      await page.waitForFunction(() => document.querySelector('#status-text').textContent.includes('1 satır dosyaya kaydedildi'));
      if (format === 'xlsx') { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(destination); assert.equal(workbook.worksheets[0].getCell('A2').value, sample); assert.equal(workbook.worksheets[0].getCell('B2').value, '9007199254740993.123456'); }
      else assert.ok((await fs.readFile(destination,'utf8')).includes(sample));
    }
    await page.click('#new-query'); await page.locator('.query-item').filter({ hasText:'Müşteri raporu' }).click();
    assert.equal(await page.locator('.parameter-row[data-parameter="message"] .parameter-input').inputValue(), '');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: Windows desktop, catalog/search/quoted SELECT (Docker mode), direct Ctrl+S update preserving ID/count and restart, connection, encrypted password, preview, 25,000-row CSV + Excel, no renderer errors.');
    console.log('PASS: keyword/alias-column completion, typed parameters/NULL, exact numeric/date, injection-like text, parameterized CSV/XLSX and values excluded from disk.');
  } finally {
    if (application) await application.close().catch(() => {});
    await local.close();
  }
}
smoke().catch(error => { console.error(error); process.exitCode = 1; });
