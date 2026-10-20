const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { Database } = require('../src/database');
const { fixture } = require('./fixture');
let local;
before(async () => { local = await fixture(); });
after(async () => { if (local) await local.close(); });
test('PostgreSQL connection, bounded preview, duplicate column names and empty result metadata', async () => {
  const db = new Database();
  assert.equal((await db.test(local.connection)).database, 'postgres');
  const result = await db.preview(local.connection, 'SELECT i AS same, i + 1 AS same FROM generate_series(1,25000) i');
  assert.equal(result.rows.length, 1000); assert.equal(result.truncated, true);
  assert.deepEqual(result.fields, ['same', 'same']); assert.deepEqual(result.rows[0], ['1', '2']);
  const empty = await db.preview(local.connection, 'SELECT 1 AS empty WHERE false');
  assert.deepEqual(empty.fields, ['empty']); assert.equal(empty.rows.length, 0);
});
test('Catalog lists readable user tables and views, safely preserves quoted identifiers, and excludes system/inaccessible objects', async () => {
  const db = new Database();
  await db.withClient(local.connection, async client => {
    await client.query('CREATE SCHEMA "catalog test"');
    await client.query('CREATE TABLE "catalog test"."odd""table" (id integer)');
    await client.query('CREATE TABLE "catalog test".hidden (id integer)');
    await client.query('CREATE VIEW "catalog test".example_view AS SELECT 1 AS id');
    await client.query('CREATE ROLE catalog_reader LOGIN');
    await client.query('GRANT USAGE ON SCHEMA "catalog test" TO catalog_reader');
    await client.query('GRANT SELECT ON "catalog test"."odd""table", "catalog test".example_view TO catalog_reader');
  });
  try {
    const tables = await db.tables({ ...local.connection, user: 'catalog_reader' });
    assert.deepEqual(tables, [
      { schema: 'catalog test', name: 'example_view', kind: 'view', columns: [{ name: 'id', type: 'integer' }] },
      { schema: 'catalog test', name: 'odd"table', kind: 'table', columns: [{ name: 'id', type: 'integer' }] }
    ]);
  } finally {
    await db.withClient(local.connection, async client => {
      await client.query('DROP SCHEMA "catalog test" CASCADE');
      await client.query('DROP ROLE catalog_reader');
    });
  }
});
test('Named and native parameters are bound as values for preview and both full export formats', async () => {
  const db = new Database(), injected = "x'; DROP TABLE important; --";
  const query = 'SELECT i, :label::text AS label, :exact::numeric AS exact, :missing::text AS missing, :enabled::boolean AS enabled FROM generate_series(1,:count::int) i WHERE :enabled::boolean';
  const parameters = { label: injected, exact: '9007199254740993.123456', missing: null, enabled: true, count: '1250' };
  const result = await db.preview(local.connection, query, parameters);
  assert.equal(result.rows.length, 1000); assert.equal(result.truncated, true);
  assert.deepEqual(result.rows[0], ['1', injected, parameters.exact, null, 'true']);
  const native = await db.preview(local.connection, 'SELECT $2::date AS date, $1::jsonb AS json, $2::date AS repeated', { '$1': '[1,"İstanbul"]', '$2': '2026-10-20' });
  assert.equal(native.rows[0][0], '2026-10-20');
  assert.equal(native.rows[0][1], '[1,"İstanbul"]');
  for (const format of ['csv', 'xlsx']) {
    const destination = path.join(local.directory, 'parameters.' + format);
    assert.equal((await db.export(local.connection, query, format, destination, undefined, parameters)).rows, 1250);
    if (format === 'csv') {
      const text = await fs.readFile(destination, 'utf8'); assert.ok(text.includes(injected)); assert.equal(text.split('\r\n').length, 1252);
    } else {
      const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(destination);
      assert.equal(workbook.worksheets[0].rowCount, 1251); assert.equal(workbook.worksheets[0].getCell('B2').value, injected); assert.equal(workbook.worksheets[0].getCell('C2').value, parameters.exact);
    }
  }
  await assert.rejects(db.preview(local.connection, 'SELECT :missing::text'), /eksik/);
});
test('CSV streams all 100,000 rows, UTF-8, quotes, newlines and bigint without preview cap', async () => {
  const file = path.join(local.directory, 'large.csv');
  const result = await new Database().export(local.connection, `SELECT i, 'Çağrı, "İstanbul"'::text AS text, 9007199254740993::bigint AS bigint FROM generate_series(1,100000) i`, 'csv', file);
  assert.equal(result.rows, 100000);
  const contents = await fs.readFile(file, 'utf8');
  assert.ok(contents.startsWith('\uFEFFi,text,bigint\r\n'));
  assert.ok(contents.endsWith('100000,"Çağrı, ""İstanbul""",9007199254740993\r\n'));
  assert.equal(contents.split('\r\n').length, 100002);
  const multiline = path.join(local.directory, 'newline.csv');
  await new Database().export(local.connection, `SELECT E'a\nb' AS value`, 'csv', multiline);
  assert.equal(await fs.readFile(multiline, 'utf8'), '\uFEFFvalue\r\n"a\nb"\r\n');
});
test('Excel streams 25,000 rows and preserves Turkish, NULL, exact numbers and formula-like text', async () => {
  const file = path.join(local.directory, 'large.xlsx');
  const result = await new Database().export(local.connection, `SELECT i, 'İstanbul'::text AS city, 9007199254740993::bigint AS exact, NULL::text AS missing, '=1+1'::text AS literal FROM generate_series(1,25000) i`, 'xlsx', file);
  assert.equal(result.rows, 25000);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(file);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, 25001); assert.equal(sheet.getCell('A25001').value, 25000);
  assert.equal(sheet.getCell('B2').value, 'İstanbul'); assert.equal(sheet.getCell('C2').value, '9007199254740993');
  assert.equal(sheet.getCell('D2').value, null); assert.equal(sheet.getCell('E2').value, '=1+1');
});
test('Empty exports retain headings; export refuses writes and preserves existing destination on failure', async () => {
  const db = new Database(), csv = path.join(local.directory, 'empty.csv'), xlsx = path.join(local.directory, 'empty.xlsx');
  await db.export(local.connection, 'SELECT 1 AS heading WHERE false', 'csv', csv);
  assert.equal(await fs.readFile(csv, 'utf8'), '\uFEFFheading\r\n');
  await db.export(local.connection, 'SELECT 1 AS heading WHERE false', 'xlsx', xlsx);
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(xlsx); assert.equal(book.worksheets[0].getCell('A1').value, 'heading');
  await fs.writeFile(csv, 'original');
  await assert.rejects(db.export(local.connection, 'CREATE TABLE should_not_exist(id integer)', 'csv', csv), /read-only/i);
  assert.equal(await fs.readFile(csv, 'utf8'), 'original');
  await assert.rejects(db.export(local.connection, 'SELECT invalid_syntax FROM missing_table', 'csv', csv));
  assert.equal(await fs.readFile(csv, 'utf8'), 'original');
  assert.equal((await fs.readdir(local.directory)).some(name => name.endsWith('.partial')), false);
});
test('A long-running query can be cancelled and connection is reusable', { timeout: 10000 }, async () => {
  const db = new Database();
  const run = db.preview(local.connection, 'SELECT pg_sleep(30)');
  const rejected = assert.rejects(run, /iptal/);
  await new Promise(resolve => setTimeout(resolve, 300)); await db.cancel(); await rejected;
  assert.equal((await db.preview(local.connection, 'SELECT 42 AS answer')).rows[0][0], '42');
});
test('Excel rejects overlong cells without publishing a broken file; CSV preserves the full text', async () => {
  const db = new Database(), file = path.join(local.directory, 'long.xlsx');
  await assert.rejects(db.export(local.connection, "SELECT repeat('a',32768) AS long_text", 'xlsx', file), /32.767/);
  await assert.rejects(fs.access(file));
  const csv = path.join(local.directory, 'long.csv');
  await db.export(local.connection, "SELECT repeat('a',32768) AS long_text", 'csv', csv);
  assert.ok((await fs.readFile(csv, 'utf8')).includes('a'.repeat(32768)));
});
test('Cancelled export removes partial output', { timeout: 10000 }, async () => {
  const db = new Database(), file = path.join(local.directory, 'cancel.csv');
  const run = db.export(local.connection, 'SELECT pg_sleep(30)', 'csv', file);
  const rejected = assert.rejects(run, /iptal/);
  await new Promise(resolve => setTimeout(resolve, 300)); await db.cancel(); await rejected;
  await assert.rejects(fs.access(file));
  assert.equal((await fs.readdir(local.directory)).some(name => name.endsWith('.partial')), false);
});
test('Large batches cancel both export formats, preserve an existing file and allow a new query', { timeout: 30000 }, async () => {
  for (const batchSize of [2000, 10000]) {
    for (const format of ['csv', 'xlsx']) {
      const db = new Database({ batchSize });
      const file = path.join(local.directory, 'cancel-batch-' + batchSize + '.' + format);
      await fs.writeFile(file, 'original destination');
      let cancellation;
      await assert.rejects(db.export(local.connection, "SELECT i, repeat('İstanbul, test ',100) AS detail FROM generate_series(1,100000) i", format, file, progress => {
        if (progress.rows === 1000) cancellation = db.cancel();
      }), /iptal/);
      await cancellation;
      assert.equal(await fs.readFile(file, 'utf8'), 'original destination');
      assert.equal((await db.preview(local.connection, 'SELECT 42 AS answer')).rows[0][0], '42');
    }
  }
  assert.equal((await fs.readdir(local.directory)).some(name => name.endsWith('.partial')), false);
});
