// Optional local-only WSL bridge. Does not recreate or modify the PostgreSQL container.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { Database } = require('../src/database');
const directory = path.resolve(__dirname, '../.local');
const stateFile = path.join(directory, 'docker-local.json');
const container = 'whatsapp-postgres-1';
const distribution = 'Ubuntu';
const port = 15432;
const python = `import socket,socketserver,select,threading,sys
class Proxy(socketserver.BaseRequestHandler):
 def handle(self):
  try:
   with socket.create_connection((sys.argv[1],5432),timeout=10) as upstream:
    upstream.settimeout(None)
    while True:
     readable,_,_=select.select([self.request,upstream],[],[],30)
     for source in readable:
      data=source.recv(65536)
      if not data:return
      (upstream if source is self.request else self.request).sendall(data)
  except OSError:pass
class Server(socketserver.ThreadingTCPServer):
 daemon_threads=True
 allow_reuse_address=True
server=Server(('127.0.0.1',int(sys.argv[2])),Proxy)
threading.Thread(target=server.serve_forever,daemon=True).start()
print('READY',flush=True)
try:sys.stdin.read()
finally:
 server.shutdown()
 server.server_close()
`;
function docker(...args) {
  return execFileSync('wsl.exe', ['-d', distribution, '--', 'docker', ...args], { encoding: 'utf8', windowsHide: true, timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
}
async function state() { try { return JSON.parse(await fs.readFile(stateFile, 'utf8')); } catch { return null; } }
async function control(saved, stop = false) {
  return new Promise(resolve => {
    const request = http.request({ host: '127.0.0.1', port: saved.controlPort, path: stop ? '/stop' : '/status', method: stop ? 'POST' : 'GET', headers: { authorization: saved.token }, timeout: 1500 }, response => { response.resume(); response.on('end', () => resolve(response.statusCode === 200)); });
    request.on('error', () => resolve(false)); request.on('timeout', () => request.destroy()); request.end();
  });
}
async function serve() {
  await fs.mkdir(directory, { recursive: true });
  const existing = await state();
  if (existing && await control(existing)) { console.log('ALREADY RUNNING: 127.0.0.1:' + port); return; }
  const inspected = JSON.parse(docker('inspect', container))[0];
  if (!inspected.State.Running) throw new Error('PostgreSQL container çalışmıyor.');
  const env = Object.fromEntries(inspected.Config.Env.map(value => { const i = value.indexOf('='); return [value.slice(0, i), value.slice(i + 1)]; }));
  const ip = Object.values(inspected.NetworkSettings.Networks).find(network => network.IPAddress)?.IPAddress;
  if (!ip) throw new Error('Container ağ adresi bulunamadı.');
  const tunnel = spawn('wsl.exe', ['-d', distribution, '--', 'python3', '-u', '-c', python, ip, String(port)], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', errorOutput = '', controlServer, stopping = false;
  tunnel.stdout.on('data', data => { output += data; }); tunnel.stderr.on('data', data => { errorOutput += data; });
  const stop = async () => {
    if (stopping) return; stopping = true;
    tunnel.stdin.end(); controlServer?.close();
    const current = await state();
    if (current?.pid === process.pid) await fs.rm(stateFile, { force: true });
  };
  tunnel.on('error', () => { console.error('WSL yönlendirmesi başlatılamadı.'); stop(); });
  tunnel.on('exit', () => { if (!stopping) { console.error('WSL yönlendirmesi kapandı. Başlatıcıyı yeniden çalıştırın.'); stop(); } });
  try {
    const deadline = Date.now() + 15000;
    while (!output.includes('READY')) {
      if (tunnel.exitCode !== null || Date.now() > deadline) throw new Error('Yönlendirme açılamadı. 15432 portu kullanılıyor olabilir. ' + errorOutput);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    const password = env.POSTGRES_PASSWORD || (env.POSTGRES_PASSWORD_FILE ? docker('exec', container, 'cat', env.POSTGRES_PASSWORD_FILE).trimEnd() : '');
    const result = await new Database().test({ host: '127.0.0.1', port, database: env.POSTGRES_DB || env.POSTGRES_USER || 'postgres', user: env.POSTGRES_USER || 'postgres', password, ssl: 'disable' });
    const token = randomUUID();
    controlServer = http.createServer((request, response) => {
      if (request.headers.authorization !== token) { response.writeHead(403); response.end(); return; }
      response.writeHead(200); response.end('OK');
      if (request.method === 'POST' && request.url === '/stop') stop();
    });
    await new Promise(resolve => controlServer.listen(0, '127.0.0.1', resolve));
    await fs.writeFile(stateFile, JSON.stringify({ pid: process.pid, token, controlPort: controlServer.address().port, host: '127.0.0.1', port, database: result.database, user: env.POSTGRES_USER || 'postgres' }, null, 2));
    console.log('READY: PostgreSQL 127.0.0.1:15432, database=' + result.database);
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch (error) { await stop(); throw error; }
}
async function main() {
  if (process.argv.includes('--stop')) {
    const saved = await state();
    console.log(saved && await control(saved, true) ? 'Yönlendirme kapatıldı.' : 'Çalışan yönlendirme yok.');
    return;
  }
  await serve();
}
main().catch(error => { console.error(error.message || 'Docker bağlantısı açılamadı.'); process.exitCode = 1; });
