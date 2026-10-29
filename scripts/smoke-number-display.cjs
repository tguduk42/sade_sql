// Headless renderer check: uses a fixture bridge; PostgreSQL/export behavior is
// covered separately by database.test.js. Does not control the user's desktop.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
async function main() {
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  try {
    const page = await browser.newPage({ viewport:{width:1380,height:880} });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.testRuns = 0; window.testExport = null;
      const ok = data => Promise.resolve({ok:true,data});
      window.desktop = {
        load: () => ok({connections:[{id:'fixture',name:'Test',hasPassword:true}],queries:[]}),
        tables: () => ok([]), onProgress: () => () => {}, onUpdate: () => () => {},
        updateState: () => ok({status:'current',current:'test'}),
        run: () => { window.testRuns++; return ok({fields:['Tutar','Bakiye','id','Kod'],fieldTypes:[1700,1700,23,25],rows:[['36000','850000.0000000','7','00123.45']],elapsed:1,truncated:false}); },
        export: input => { window.testExport = input; return ok({rows:1,path:'fixture.csv'}); }
      };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname,'../src/ui/index.html')).href);
    await page.locator('#sql').fill('SELECT 36000::numeric AS tutar');
    await page.locator('#run-query').click();
    await page.waitForSelector('tbody tr');
    assert.deepEqual(await page.locator('tbody td').allTextContents(), ['1','36.000,00','850.000,00','7','00123.45']);
    assert.equal(await page.locator('tbody td').nth(2).getAttribute('title'), '850000.0000000');
    await page.locator('#number-format').selectOption('raw');
    assert.equal(await page.locator('tbody td').nth(2).textContent(), '850000.0000000');
    await page.locator('#number-format').selectOption('tr-money');
    assert.equal(await page.evaluate(() => window.testRuns),1);
    await page.locator('#export-csv').click();
    await page.waitForFunction(() => window.testExport !== null);
    assert.equal(await page.evaluate(() => window.testExport.numberFormat),'tr-money');
    assert.equal(await page.evaluate(() => window.testExport.csvMode),'excel-tr');
    await fs.mkdir(path.resolve(__dirname,'../test-output'),{recursive:true});
    await page.screenshot({path:path.resolve(__dirname,'../test-output/money-display.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: headless renderer shows 36.000,00 / 850.000,00, preserves IDs/raw tooltips, toggles without rerunning SQL, and forwards export format. Bridge uses synthetic fixtures.');
  } finally { await browser.close(); }
}
main().catch(error => {console.error(error);process.exitCode=1});
