const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
test('Saved queries round trip; connection secrets never appear in public state or plaintext file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sade-sql-store-'));
  // Deterministic fake crypto tests the storage boundary; Windows DPAPI is separately checked in the desktop smoke test.
  const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from('cipher:' + Buffer.from(value).toString('base64')), decryptString: value => Buffer.from(value.toString().slice(7), 'base64').toString() };
  try {
    const store = new Store(directory, encryption); await store.load();
    const connection = await store.saveConnection({ name: 'Test', host: 'localhost', database: 'postgres', user: 'postgres', password: 'test-only-password', rememberPassword: true });
    assert.equal(connection.connections[0].hasPassword, true); assert.equal(connection.connections[0].secret, undefined);
    assert.equal((await fs.readFile(store.file, 'utf8')).includes('test-only-password'), false);
    assert.equal(store.resolve({ id: connection.id, useSavedPassword: true }).password, 'test-only-password');
    const saved = await store.saveQuery({ name: 'Günlük rapor', sql: 'SELECT 1' });
    const reload = new Store(directory, encryption); await reload.load(); assert.equal(reload.publicState().queries[0].sql, 'SELECT 1');
    await reload.saveQuery({ id: saved.id, name: 'Günlük rapor', sql: 'SELECT 2' }); assert.equal(reload.state.queries.length, 1);
    await reload.remove('queries', saved.id); assert.equal(reload.state.queries.length, 0);
    await reload.saveConnection({ ...connection.connections[0], rememberPassword: false }); assert.equal(reload.state.connections[0].secret, undefined);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
