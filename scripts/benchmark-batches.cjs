// Each candidate runs sequentially in a fresh Node process, using identical SQL.
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
async function main() {
  const summary = { startedAt: new Date().toISOString(), rows: 1000000, candidates: [] };
  for (const batchSize of [200, 2000, 10000]) {
    console.log('\nBENCHMARK batchSize=' + batchSize);
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'test-docker-connection.cjs'), '--export', '--rows=1000000', '--batch-size=' + batchSize], { cwd: root, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit'] });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error('Benchmark failed: batchSize=' + batchSize + ', code=' + code)));
    });
    const report = JSON.parse(await fs.readFile(path.join(root, 'test-output/docker-connection.json'), 'utf8'));
    if (report.status !== 'passed' || report.batchSize !== batchSize || !report.temporaryForwardingClosed) throw new Error('Invalid benchmark report.');
    summary.candidates.push(report);
    await fs.writeFile(path.join(root, 'test-output/batch-benchmark.json'), JSON.stringify(summary, null, 2));
  }
  summary.completedAt = new Date().toISOString();
  await fs.writeFile(path.join(root, 'test-output/batch-benchmark.json'), JSON.stringify(summary, null, 2));
  console.log('\nBATCH COMPARISON');
  console.table(summary.candidates.map(report => ({ batchSize: report.batchSize, fetchSeconds: report.fullFetch.totalMs / 1000, previewSeconds: report.preview.totalMs / 1000, csvSeconds: report.exports[0].exportMs / 1000, xlsxSeconds: report.exports[1].exportMs / 1000, csvPeakMiB: report.exports[0].sampledPeakRssMiB, xlsxPeakMiB: report.exports[1].sampledPeakRssMiB })));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
