// Read-only connection check against an existing Docker PostgreSQL in WSL.
// Credentials stay in this process; no container settings or database rows change.
const { execFileSync, spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Database } = require('../src/database');
const distribution = process.env.SADE_SQL_WSL || 'Ubuntu';
const container = process.env.SADE_SQL_CONTAINER || 'whatsapp-postgres-1';
function docker(...args) {
  return execFileSync('wsl.exe', ['-d', distribution, '--', 'docker', ...args], { encoding: 'utf8', windowsHide: true, timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
}
async function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
const python = `import socket,socketserver,select,threading,sys
target=(sys.argv[1],5432)
class Proxy(socketserver.BaseRequestHandler):
 def handle(self):
  try:
   with socket.create_connection(target,timeout=10) as upstream:
    upstream.settimeout(None)
    while True:
     readable,_,_=select.select([self.request,upstream],[],[],30)
     if not readable: continue
     for source in readable:
      data=source.recv(65536)
      if not data: return
      (upstream if source is self.request else self.request).sendall(data)
  except (OSError,ValueError): pass
class Server(socketserver.ThreadingTCPServer):
 allow_reuse_address=True
 daemon_threads=True
server=Server(('127.0.0.1',int(sys.argv[2])),Proxy)
threading.Thread(target=server.serve_forever,daemon=True).start()
print('READY',flush=True)
try: sys.stdin.read()
finally:
 server.shutdown()
 server.server_close()
print('CLOSED',flush=True)
`;
async function main() {
  let tunnel, secret = '', exited, exportFolder;
  const report = { checkedAt: new Date().toISOString(), distribution, container, readOnly: true, temporaryForwarding: true };
  try {
    const inspection = JSON.parse(docker('inspect', container))[0];
    if (!inspection.State.Running) throw new Error('PostgreSQL container çalışmıyor.');
    const env = Object.fromEntries(inspection.Config.Env.map(entry => { const index = entry.indexOf('='); return [entry.slice(0, index), entry.slice(index + 1)]; }));
    secret = env.POSTGRES_PASSWORD || '';
    if (!secret && env.POSTGRES_PASSWORD_FILE) secret = docker('exec', container, 'cat', env.POSTGRES_PASSWORD_FILE).trimEnd();
    const address = Object.values(inspection.NetworkSettings.Networks).find(network => network.IPAddress)?.IPAddress;
    if (!address) throw new Error('Container ağ adresi bulunamadı.');
    const port = await unusedPort();
    tunnel = spawn('wsl.exe', ['-d', distribution, '--', 'python3', '-u', '-c', python, address, String(port)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let childError, stderr = '', output = '';
    tunnel.on('error', error => { childError = error; });
    tunnel.stderr.on('data', data => { stderr += data; });
    tunnel.stdout.on('data', data => { output += data; });
    exited = new Promise(resolve => tunnel.once('exit', resolve));
    const deadline = Date.now() + 15000;
    while (!output.includes('READY')) {
      if (childError || tunnel.exitCode !== null) throw new Error('Geçici yönlendirme başlatılamadı: ' + (childError?.message || stderr));
      if (Date.now() > deadline) throw new Error('Geçici yönlendirme zaman aşımına uğradı.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const connection = { host: '127.0.0.1', port, database: env.POSTGRES_DB || env.POSTGRES_USER || 'postgres', user: env.POSTGRES_USER || 'postgres', password: secret, ssl: 'disable' };
    // Give WSL's localhost forwarding a moment to discover the temporary listener.
    await new Promise(resolve => setTimeout(resolve, 1000));
    const batchOption = process.argv.find(argument => argument.startsWith('--batch-size='));
    const database = new Database(batchOption ? { batchSize: Number(batchOption.split('=')[1]) } : {}), started = Date.now();
    report.batchSize = database.batchSize;
    report.exportBatchSizes = { csv: database.batchSize, xlsx: database.excelBatchSize };
    const result = await database.test(connection);
    report.connectionTest = 'passed'; report.connectionTimeMs = Date.now() - started;
    report.database = result.database; report.version = result.version;
    const preview = await database.preview(connection, 'SELECT 1 AS connection_test, current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl');
    if (preview.rows.length !== 1 || preview.rows[0][0] !== '1') throw new Error('SELECT 1 doğrulaması başarısız.');
    report.applicationPreview = 'passed'; report.ssl = preview.rows[0][2]; report.status = 'passed';
    if (process.argv.includes('--export')) {
      const assert = require('node:assert/strict');
      const ExcelJS = require('exceljs');
      const { parse } = require('@fast-csv/parse');
      const { createReadStream } = require('node:fs');
      const { randomUUID } = require('node:crypto');
      const QueryStream = require('pg-query-stream');
      const rowsOption = process.argv.find(argument => argument.startsWith('--rows='));
      const expectedRows = rowsOption ? Number(rowsOption.split('=')[1]) : 100000;
      if (!Number.isSafeInteger(expectedRows) || expectedRows < 1 || expectedRows > 5000000) throw new Error('Satır sayısı 1 ile 5.000.000 arasında olmalı.');
      const digits = Math.max(6, String(expectedRows).length);
      const expectedAmount = (expectedRows * 12.5).toFixed(2);
      const expectedCity = ['İstanbul', 'Ankara', 'İzmir', 'Eskişehir'][expectedRows % 4];
      const folder = path.resolve(__dirname, '../outputs/docker-test-' + expectedRows + '-batch-' + database.batchSize + '-' + randomUUID().slice(0, 8));
      exportFolder = folder;
      await fs.mkdir(folder, { recursive: true });
      const sql = `SELECT i AS "Kayıt No",
 'Test Müşteri ' || lpad(i::text, ${digits}, '0') AS "Müşteri",
 (ARRAY['İstanbul','Ankara','İzmir','Eskişehir'])[(i % 4) + 1] AS "Şehir",
 (i * 12.50)::numeric(14,2) AS "Tutar",
 DATE '2026-01-01' + (i % 365) AS "Tarih",
 CASE WHEN i % 2 = 0 THEN 'Aktif' ELSE 'Beklemede' END AS "Durum",
 'Örnek, "açıklama"'::text AS "Açıklama"
 FROM generate_series(1,${expectedRows}) AS i ORDER BY i`;
      await fs.writeFile(path.join(folder, 'test-sorgusu.sql'), sql + ';\n');
      report.expectedRows = expectedRows;
      report.columns = 7;
      const explained = await database.withClient(connection, client => client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql));
      const plan = explained.rows[0]['QUERY PLAN'][0];
      assert.equal(plan.Plan['Actual Rows'], expectedRows);
      report.serverQuery = { planningMs: plan['Planning Time'], executionMs: plan['Execution Time'], rows: plan.Plan['Actual Rows'] };
      await fs.writeFile(path.join(folder, 'query-plan.json'), JSON.stringify(plan, null, 2));
      console.log('SERVER QUERY: ' + report.serverQuery.executionMs + ' ms, ' + expectedRows + ' rows.');
      const fetchStarted = performance.now();
      let firstRowMs, fetched = 0;
      await database.withClient(connection, async client => {
        const stream = client.query(new QueryStream(sql, [], { rowMode: 'array', batchSize: database.batchSize }));
        for await (const row of stream) {
          if (fetched === 0) firstRowMs = performance.now() - fetchStarted;
          fetched++;
          assert.equal(row[0], fetched);
        }
      });
      assert.equal(fetched, expectedRows);
      report.fullFetch = { rows: fetched, firstRowMs: Math.round(firstRowMs), totalMs: Math.round(performance.now() - fetchStarted), writesFile: false };
      console.log('FULL FETCH: ' + report.fullFetch.totalMs + ' ms.');
      const previewStarted = performance.now();
      const dataPreview = await database.preview(connection, sql);
      assert.equal(dataPreview.rows.length, Math.min(1000, expectedRows));
      report.preview = { rows: dataPreview.rows.length, truncated: dataPreview.truncated, totalMs: Math.round(performance.now() - previewStarted) };
      report.exports = [];
      for (const format of ['csv', 'xlsx']) {
        const target = path.join(folder, 'test-data-' + expectedRows + '.' + format);
        const before = Date.now();
        const startRss = process.memoryUsage().rss;
        let peakRss = startRss;
        const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 100);
        let result;
        try {
          result = await database.export(connection, sql, format, target, progress => {
            if (progress.rows % 100000 === 0) console.log(format.toUpperCase() + ': ' + progress.rows + '/' + expectedRows + ' rows written');
          });
        } finally { clearInterval(sampler); peakRss = Math.max(peakRss, process.memoryUsage().rss); }
        const exportMs = Date.now() - before;
        assert.equal(result.rows, expectedRows);
        const verifyStarted = Date.now();
        let count = 0, first, last;
        if (format === 'csv') {
          const reader = createReadStream(target).pipe(parse({ headers: true }));
          for await (const row of reader) { if (!first) first = row; last = row; count++; assert.equal(row['Kayıt No'], String(count)); }
          assert.equal(first['Kayıt No'], '1'); assert.equal(last['Kayıt No'], String(expectedRows));
          assert.equal(first['Müşteri'], 'Test Müşteri ' + '1'.padStart(digits, '0'));
          assert.equal(first['Şehir'], 'Ankara'); assert.equal(last['Şehir'], expectedCity);
          assert.equal(last['Tutar'], expectedAmount); assert.equal(first['Açıklama'], 'Örnek, "açıklama"');
        } else {
          const reader = new ExcelJS.stream.xlsx.WorkbookReader(target, { sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit' });
          for await (const sheet of reader) {
            for await (const row of sheet) {
              if (row.number === 1) { assert.equal(row.getCell(1).value, 'Kayıt No'); continue; }
              const values = row.values;
              if (!first) first = values;
              last = values; count++; assert.equal(values[1], count);
            }
          }
          assert.equal(first[1], 1); assert.equal(last[1], expectedRows);
          assert.equal(first[2], 'Test Müşteri ' + '1'.padStart(digits, '0')); assert.equal(last[3], expectedCity);
          assert.equal(last[4], expectedAmount); assert.equal(first[7], 'Örnek, "açıklama"');
        }
        assert.equal(count, expectedRows);
        report.exports.push({ format, path: target, rows: count, bytes: (await fs.stat(target)).size, exportMs, verificationMs: Date.now() - verifyStarted, processStartRssMiB: Math.round(startRss / 1048576), sampledPeakRssMiB: Math.round(peakRss / 1048576), verified: true });
        console.log(format.toUpperCase() + ': ' + expectedRows + ' rows exported and verified.');
      }
      report.syntheticDataOnly = true;
      await fs.writeFile(path.join(folder, 'verification.json'), JSON.stringify({ ...report, credentials: 'not included' }, null, 2));
    }
  } catch (error) {
    report.status = 'failed';
    report.error = secret ? String(error.message).replaceAll(secret, '[redacted]') : error.message;
    process.exitCode = 1;
  } finally {
    if (tunnel) {
      tunnel.stdin.end();
      const closed = await Promise.race([exited.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 5000))]);
      report.temporaryForwardingClosed = closed;
      if (!closed) { report.status = 'cleanup-needed'; process.exitCode = 1; }
    }
    secret = '';
    await fs.mkdir(path.resolve(__dirname, '../test-output'), { recursive: true });
    await fs.writeFile(path.resolve(__dirname, '../test-output/docker-connection.json'), JSON.stringify(report, null, 2));
    if (exportFolder) await fs.writeFile(path.join(exportFolder, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
}
main().catch(error => { console.error('Test başlatılamadı: ' + error.code); process.exitCode = 1; });
