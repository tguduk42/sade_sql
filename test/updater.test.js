const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Updater, newer, releaseInfo } = require('../src/updater');
const payload = Buffer.from('synthetic update fixture, not an executable');
function release(extra = {}) {
  return { tag_name: 'v1.0.6', draft: false, prerelease: false, assets: [{ name: 'Sade-SQL-1.0.6-Windows.exe', state: 'uploaded', size: payload.length, digest: 'sha256:' + createHash('sha256').update(payload).digest('hex'), browser_download_url: 'https://github.com/tguduk42/sade_sql/releases/download/v1.0.6/Sade-SQL-1.0.6-Windows.exe' }], ...extra };
}
test('Update selection compares numeric stable versions and trusts only exact repository assets with SHA256', () => {
  assert.equal(newer('v1.0.10', '1.0.9'), true);
  assert.equal(newer('v1.0.4', '1.0.5'), false);
  assert.equal(newer('v1.0.6-beta', '1.0.5'), false);
  assert.equal(releaseInfo(release({ prerelease: true }), '1.0.5'), null);
  assert.equal(releaseInfo(release({ draft: true }), '1.0.5'), null);
  assert.equal(releaseInfo(release(), '1.0.6'), null);
  assert.equal(releaseInfo(release(), '1.0.5').version, '1.0.6');
  const invalid = release(); invalid.assets[0].browser_download_url = 'https://example.com/update.exe';
  assert.throws(() => releaseInfo(invalid, '1.0.5'));
  invalid.assets[0].digest = ''; assert.throws(() => releaseInfo(invalid, '1.0.5'));
});
test('Updates stream, verify before activation, reuse verified downloads and detect later tampering', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sade-update-'));
  try {
    let downloads = 0; const events = [];
    const fetcher = async url => url.endsWith('/latest') ? Response.json(release()) : (downloads++, new Response(payload));
    const updater = new Updater({ current: '1.0.5', directory, fetcher, notify: state => events.push(state) });
    assert.equal((await updater.check()).status, 'available');
    const results = await Promise.all([updater.download(), updater.download()]);
    assert.ok(results.some(item => item.status === 'ready')); assert.equal(downloads, 1);
    const file = await updater.readyFile(); assert.deepEqual(await fs.readFile(file), payload);
    assert.ok(events.some(item => item.status === 'downloading' && item.percent === 100));
    const second = new Updater({ current: '1.0.5', directory, fetcher });
    await second.check(); assert.equal((await second.download()).status, 'ready'); assert.equal(downloads, 1);
    await fs.writeFile(file, 'tampered'); await assert.rejects(() => updater.readyFile());
    const third = new Updater({ current: '1.0.5', directory, fetcher }); await third.check();
    assert.equal((await third.download()).status, 'error'); assert.equal(await fs.readFile(file, 'utf8'), 'tampered');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('Corrupt, truncated and failed downloads leave no executable or partial; check failures can retry', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sade-update-'));
  try {
    for (const response of [() => new Response(Buffer.alloc(payload.length)), () => new Response(payload.subarray(0, 5)), () => new Response('', { status: 503 }), () => new Response(Buffer.alloc(payload.length + 1))]) {
      const updater = new Updater({ current: '1.0.5', directory, fetcher: async url => url.endsWith('/latest') ? Response.json(release()) : response() });
      await updater.check(); assert.equal((await updater.download()).status, 'error');
      assert.deepEqual(await fs.readdir(directory), []); await assert.rejects(() => updater.readyFile());
    }
    let fail = true;
    const updater = new Updater({ current: '1.0.5', directory, fetcher: async () => { if (fail) throw new Error('offline'); return Response.json(release()); } });
    assert.equal((await updater.check()).status, 'error'); fail = false;
    assert.equal((await updater.check()).status, 'available');
    const current = new Updater({ current: '1.0.6', directory, fetcher: async () => Response.json(release()) });
    assert.equal((await current.check()).status, 'current');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
