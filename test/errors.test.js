const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { Database } = require('../src/database');
const { describeError } = require('../src/errors');
test('A refused localhost connection produces a useful error even for an empty AggregateError', async () => {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  try {
    await new Database().test({ host: 'localhost', port, database: 'postgres', user: 'postgres', password: '' });
    assert.fail('Expected a connection refusal');
  } catch (error) { assert.match(describeError(error), /bağlantısı reddedildi/); }
  assert.match(describeError(new AggregateError([Object.assign(new Error(), { code: 'ECONNREFUSED' })], '')), /Docker/);
  const statementTimeout = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' });
  assert.equal(describeError(statementTimeout), statementTimeout.message);
});
