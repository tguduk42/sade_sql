const { Client, types } = require('pg');
const QueryStream = require('pg-query-stream');
const ExcelJS = require('exceljs');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { bind } = require('./ui/sql-tools');
const { createCSV } = require('./csv');
const { isMoneyColumn, excelNumber } = require('./ui/number-format');
const DateDisplay = require('./ui/date-format');

const PREVIEW_LIMIT = 1000;
// CSV benefits strongly from fewer database round trips. XLSX is dominated by
// ZIP/XML work; a smaller batch keeps row buffering down for a similar duration.
const EXPORT_BATCH_SIZE = 10000;
const EXCEL_BATCH_SIZE = 2000;
function configuration(input) {
  if (!input || !input.host?.trim() || !input.database?.trim() || !input.user?.trim())
    throw new Error('Sunucu, veritabanı ve kullanıcı adı gerekli.');
  const port = Number(input.port || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Geçerli bir port girin.');
  return {
    host: input.host.trim(), port, database: input.database.trim(), user: input.user.trim(),
    password: String(input.password || ''),
    ssl: input.ssl === 'verify' ? { rejectUnauthorized: true } : input.ssl === 'require' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000, application_name: 'Sade SQL',
  };
}
function checkSQL(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('Önce bir SQL sorgusu yazın.');
  if (sql.length > 2_000_000) throw new Error('Sorgu dosyası çok büyük (en fazla 2 MB).');
}
function valueText(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '\\x' + value.toString('hex');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function csvCell(value) {
  const text = valueText(value);
  return /[",\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}
class Database {
  constructor({ batchSize } = {}) {
    if (batchSize !== undefined && (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 10000)) throw new Error('Paket boyutu 1 ile 10.000 arasında olmalı.');
    this.batchSize = batchSize ?? EXPORT_BATCH_SIZE;
    this.excelBatchSize = batchSize ?? EXCEL_BATCH_SIZE;
    this.active = null;
  }
  async cancel() {
    const operation = this.active;
    if (!operation) return;
    operation.cancelled = true;
    if (!operation.client.processID) return;
    // Let PostgreSQL finish the cursor with a cancellation error. Destroying its
    // socket first can leave pg-cursor's close callback pending indefinitely.
    const cancellation = new Client(operation.config);
    cancellation.on('error', () => {});
    try {
      await cancellation.connect();
      await cancellation.query('SELECT pg_cancel_backend($1)', [operation.client.processID]);
    } finally { await cancellation.end().catch(() => {}); }
  }
  async withClient(connection, task) {
    if (this.active) throw new Error('Devam eden işlemin bitmesini bekleyin.');
    const config = configuration(connection);
    // Keep scalar date/timestamp text: Date truncates the last three fractional
    // digits and can shift wall-clock timestamps through the machine timezone.
    const client = new Client({ ...config, types: { getTypeParser: (oid, format) => [1082,1114,1184].includes(oid) && format !== 'binary' ? value => value : types.getTypeParser(oid, format) } });
    const operation = { client, config, stream: null, cancelled: false };
    this.active = operation;
    // Connection-level errors must never terminate the desktop process.
    client.on('error', error => { operation.connectionError = error; });
    try {
      await client.connect();
      if (operation.cancelled) throw new Error('İşlem iptal edildi.');
      // ISO output only; retain the server's DMY/MDY/YMD input ordering.
      await client.query('SET DateStyle TO ISO');
      if (operation.cancelled) throw new Error('İşlem iptal edildi.');
      return await task(client, operation);
    } catch (error) {
      if (operation.cancelled) throw new Error('İşlem iptal edildi.');
      throw error;
    } finally {
      await client.end().catch(() => {});
      if (this.active === operation) this.active = null;
    }
  }
  async test(connection) {
    return this.withClient(connection, async client => {
      const result = await client.query('SELECT current_database() AS database, version() AS version');
      return result.rows[0];
    });
  }
  async tables(connection) {
    return this.withClient(connection, async client => {
      const result = await client.query(`SELECT n.nspname AS schema, c.relname AS name,
        COALESCE((SELECT json_agg(json_build_object('name', a.attname,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod)) ORDER BY a.attnum)
          FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid
          AND a.attnum > 0 AND NOT a.attisdropped), '[]'::json) AS columns,
        CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view'
          WHEN 'f' THEN 'foreign_table' ELSE 'table' END AS kind
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r','p','v','m','f') AND NOT c.relispartition
          AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
          AND has_schema_privilege(n.oid, 'USAGE')
          AND has_table_privilege(c.oid, 'SELECT')
        ORDER BY n.nspname, c.relname`);
      return result.rows;
    });
  }
  async preview(connection, sql, parameters = {}) {
    checkSQL(sql);
    const query = bind(sql, parameters);
    return this.withClient(connection, async (client, operation) => {
      const started = Date.now();
      const stream = client.query(new QueryStream(query.text, query.values, { rowMode: 'array', batchSize: 200 }));
      operation.stream = stream;
      const rows = [];
      let truncated = false;
      for await (const row of stream) {
        if (rows.length === PREVIEW_LIMIT) { truncated = true; break; }
        rows.push(row.map(value => value === null ? null : valueText(value)));
      }
      if (operation.cancelled) throw new Error('İşlem iptal edildi.');
      const fields = stream.cursor._result.fields.map(field => field.name);
      const fieldTypes = stream.cursor._result.fields.map(field => field.dataTypeID);
      return { fields, fieldTypes, rows, truncated, elapsed: Date.now() - started, limit: PREVIEW_LIMIT };
    });
  }
  async export(connection, sql, format, destination, progress = () => {}, parameters = {}, options = {}) {
    checkSQL(sql);
    const query = bind(sql, parameters);
    if (!['csv', 'xlsx'].includes(format)) throw new Error('Geçersiz dosya türü.');
    const numberFormat = options.numberFormat || 'raw';
    if (!['raw', 'tr-money'].includes(numberFormat)) throw new Error('Geçersiz sayı görünümü.');
    const csv = format === 'csv' ? createCSV(options.csvMode || 'standard', valueText, numberFormat) : null;
    const temporary = path.join(path.dirname(destination), '.' + randomUUID() + '.partial');
    let output;
    try {
      const result = await this.withClient(connection, async (client, operation) => {
        // Re-executing an export must never repeat INSERT/UPDATE/DELETE side effects.
        await client.query('BEGIN READ ONLY');
        const stream = client.query(new QueryStream(query.text, query.values, { rowMode: 'array', batchSize: format === 'xlsx' ? this.excelBatchSize : this.batchSize }));
        operation.stream = stream;
        output = fs.createWriteStream(temporary, { flags: 'wx' });
        let outputError;
        output.on('error', error => { outputError = error; stream.destroy(error); });
        let workbook, sheet, fields, metadata, count = 0, sheetNumber = 0, sheetRows = 0;
        if (format === 'xlsx') workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useStyles: true, useSharedStrings: false });
        const write = async text => {
          if (outputError) throw outputError;
          if (!output.write(text)) await once(output, 'drain');
        };
        const header = async () => {
          if (format === 'csv') await write(csv.header(metadata));
          else {
            sheet = workbook.addWorksheet('Sonuçlar ' + (++sheetNumber), { views: [{ state: 'frozen', ySplit: 1 }] });
            sheet.columns = fields.map((name, index) => ({ width: Math.min(48, Math.max(18, name.length + 3)),
              ...(numberFormat === 'tr-money' && isMoneyColumn(metadata[index].dataTypeID, name) ? { style: { numFmt: '#,##0.00' } } : {}) }));
            const row = sheet.addRow(fields);
            row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF245A50' } };
            row.commit();
            sheetRows = 0;
          }
        };
        for await (const row of stream) {
          if (operation.cancelled) throw new Error('İşlem iptal edildi.');
          if (!fields) { metadata = stream.cursor._result.fields; fields = metadata.map(field => field.name); await header(); }
          if (format === 'csv') await write(csv.row(row, metadata));
          else {
            if (sheetRows >= 1_048_575) { sheet.commit(); await header(); }
            // Preserve bigint/numeric strings without Excel's 15-digit rounding.
            const cells = row.map((value, index) => {
              if (value == null) return null;
              if (DateDisplay.isTimestamp(metadata[index].dataTypeID)) return DateDisplay.format(value, metadata[index].dataTypeID);
              if (numberFormat === 'tr-money' && isMoneyColumn(metadata[index].dataTypeID, fields[index])) {
                const numeric = excelNumber(value);
                if (numeric !== null) return numeric;
              }
              return typeof value === 'number' || typeof value === 'boolean' ? value : valueText(value);
            });
            if (cells.some(value => typeof value === 'string' && value.length > 32767)) throw new Error('Bir hücre Excel’in 32.767 karakter sınırını aşıyor. Veriyi eksiksiz almak için CSV kullanın.');
            sheet.addRow(cells).commit();
            sheetRows++;
            // Let the ZIP writer drain instead of retaining the whole export in memory.
            if (count % 200 === 0) {
              await new Promise(resolve => setImmediate(resolve));
              while (sheet.stream.buffers.reduce((size, buffer) => size + buffer.length, 0) > 1024 * 1024) {
                if (outputError) throw outputError;
                if (operation.cancelled) throw new Error('İşlem iptal edildi.');
                await new Promise(resolve => setTimeout(resolve, 5));
              }
            }
          }
          count++;
          if (count % 1000 === 0) progress({ rows: count });
        }
        if (!fields) { metadata = stream.cursor._result.fields; fields = metadata.map(field => field.name); await header(); }
        if (operation.cancelled) throw new Error('İşlem iptal edildi.');
        if (workbook) { sheet.commit(); await workbook.commit(); }
        else { const finished = once(output, 'finish'); output.end(); await finished; }
        if (outputError) throw outputError;
        await client.query('COMMIT');
        progress({ rows: count });
        return { rows: count, path: destination };
      });
      await fsp.rename(temporary, destination);
      return result;
    } catch (error) {
      if (output && !output.closed) { output.destroy(); await once(output, 'close').catch(() => {}); }
      await fsp.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  }
}
module.exports = { Database, configuration, csvCell, valueText, PREVIEW_LIMIT, EXPORT_BATCH_SIZE, EXCEL_BATCH_SIZE };
