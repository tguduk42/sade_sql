const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const API = 'https://api.github.com/repos/tguduk42/sade_sql/releases/latest';
function version(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  return match ? match.slice(1).map(Number) : null;
}
function newer(candidate, current) {
  const a = version(candidate), b = version(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function releaseInfo(release, current) {
  if (release.draft || release.prerelease || !newer(release.tag_name, current)) return null;
  const value = release.tag_name.replace(/^v/, '');
  const name = `Sade-SQL-${value}-Windows.exe`;
  const asset = release.assets?.find(item => item.name === name && item.state === 'uploaded');
  if (!asset || !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 500_000_000 || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) throw new Error('Güncelleme dosyası veya SHA-256 doğrulaması yayında bulunamadı.');
  const expected = `https://github.com/tguduk42/sade_sql/releases/download/${release.tag_name}/${name}`;
  if (asset.browser_download_url !== expected) throw new Error('Güncelleme adresi geçersiz.');
  return { version: value, name, size: asset.size, sha256: asset.digest.slice(7), url: expected };
}
async function hashFile(file) {
  const hash = createHash('sha256');
  const handle = await fs.open(file, 'r');
  try { for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk); }
  finally { await handle.close(); }
  return hash.digest('hex');
}
class Updater {
  constructor({ current, directory, fetcher = fetch, notify = () => {} }) {
    this.current = current; this.directory = directory; this.fetcher = fetcher; this.notify = notify;
    this.state = { status: 'idle', current }; this.release = null; this.ready = null;
  }
  emit(status, extra = {}) { this.state = { status, current: this.current, version: this.release?.version, ...extra }; this.notify(this.state); return this.state; }
  async check() {
    if (['checking', 'downloading', 'ready'].includes(this.state.status)) return this.state;
    this.emit('checking');
    try {
      const response = await this.fetcher(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sade-SQL/' + this.current, 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15000) });
      if (response.status === 404) { this.release = null; return this.emit('current'); }
      if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? 'GitHub istek sınırına ulaşıldı. Daha sonra tekrar deneyin.' : 'GitHub sürüm bilgisi alınamadı (HTTP ' + response.status + ').');
      this.release = releaseInfo(await response.json(), this.current);
      return this.emit(this.release ? 'available' : 'current');
    } catch (error) { return this.emit('error', { message: error.message }); }
  }
  async download() {
    if (this.state.status === 'downloading' || this.state.status === 'ready') return this.state;
    if (!this.release) throw new Error('Önce yeni sürümü kontrol edin.');
    const release = this.release;
    let temporary;
    this.emit('downloading', { percent: 0 });
    try {
      await fs.mkdir(this.directory, { recursive: true });
      const target = path.join(this.directory, release.name);
      // Never overwrite a user's existing executable, including an active version.
      try {
        if (await hashFile(target) === release.sha256) { this.ready = target; return this.emit('ready'); }
        throw new Error('Bu isimde farklı bir dosya var. Güncelleme klasöründeki dosyayı kontrol edin.');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      temporary = target + '.' + randomUUID() + '.partial';
      const response = await this.fetcher(release.url, { signal: AbortSignal.timeout(600000) });
      if (!response.ok || !response.body) throw new Error('Güncelleme indirilemedi (HTTP ' + response.status + ').');
      const handle = await fs.open(temporary, 'wx');
      const hash = createHash('sha256'); let bytes = 0, lastPercent = -1;
      try {
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > release.size) throw new Error('İndirilen dosyanın boyutu beklenen değeri aşıyor.');
          hash.update(chunk); await handle.writeFile(chunk);
          const percent = Math.floor(bytes * 100 / release.size);
          if (percent !== lastPercent) { lastPercent = percent; this.emit('downloading', { percent }); }
        }
      } finally { await handle.close(); }
      if (bytes !== release.size || hash.digest('hex') !== release.sha256) throw new Error('Dosya doğrulanamadı. Güncelleme uygulanmadı; yeniden indirin.');
      // link fails if another download placed a file at the destination meanwhile.
      await fs.link(temporary, target); await fs.unlink(temporary); temporary = null;
      this.ready = target; return this.emit('ready');
    } catch (error) { return this.emit('error', { message: error.message }); }
    finally { if (temporary) await fs.rm(temporary, { force: true }); }
  }
  async readyFile() {
    if (!this.ready || !this.release || await hashFile(this.ready) !== this.release.sha256) throw new Error('Güncelleme dosyası hazır değil veya değiştirilmiş. Yeniden kontrol edin.');
    return this.ready;
  }
}
module.exports = { Updater, newer, releaseInfo, hashFile };
