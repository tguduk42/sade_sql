const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const fsSync = require('node:fs');
async function fixture() {
  const binary = process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\18\\bin';
  const directory = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'sade-sql-test-'));
  const data = path.join(directory, 'database');
  const port = await new Promise((resolve, reject) => { const server = net.createServer(); server.on('error', reject); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
  function command(name, args) {
    const log = path.join(directory, name + '-command.log');
    const fd = fsSync.openSync(log, 'w');
    let result;
    try { result = spawnSync(path.join(binary, name + '.exe'), args, { stdio: ['ignore', fd, fd], windowsHide: true, timeout: 45000 }); }
    finally { fsSync.closeSync(fd); }
    if (result.error || result.status !== 0) throw new Error(name + ': ' + (result.error?.message || fsSync.readFileSync(log, 'utf8')));
  }
  try {
    command('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C']);
    command('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + port, '-w', 'start']);
  } catch (error) {
    if (fsSync.existsSync(path.join(data, 'postmaster.pid'))) { try { command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']); } catch {} }
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 300 }); throw error;
  }
  return { directory, connection: { name: 'Yerel test', host: '127.0.0.1', port, database: 'postgres', user: 'postgres', ssl: 'disable' },
    async close() { command('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']); await fs.rm(directory, { recursive: true, force: true }); }
  };
}
module.exports = { fixture };
