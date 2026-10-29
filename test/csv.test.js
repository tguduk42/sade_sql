const test = require('node:test');
const assert = require('node:assert/strict');
const { createCSV, encode } = require('../src/csv');
test('CSV escaping follows the selected separator and never changes text identifiers or JSON', () => {
  const fields = [{ name: 'id', dataTypeID: 25 }, { name: 'amount', dataTypeID: 1700 }, { name: 'json', dataTypeID: 3802 }];
  const text = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const tr = createCSV('excel-tr', text), standard = createCSV('standard', text);
  const row = ['001.230', '1234.56', { amount: 1.23, city: 'İstanbul' }];
  assert.equal(tr.row(row, fields).toString(), '001.230;1234,56;"{""amount"":1.23,""city"":""İstanbul""}"\r\n');
  assert.equal(standard.row(row, fields).toString(), '001.230,1234.56,"{""amount"":1.23,""city"":""İstanbul""}"\r\n');
  assert.equal(tr.row(['a;"b"\r\nc', '-1.25e-7', null], fields).toString(), '"a;""b""\r\nc";-1,25e-7;\r\n');
  assert.throws(() => createCSV('unknown', text), /Geçersiz/);
});
test('Legacy Turkish encoding is explicit and refuses silent character replacement', () => {
  const original = 'İıŞşĞğÜüÖöÇç €';
  const bytes = encode(original, 'windows-1254');
  assert.equal(new TextDecoder('windows-1254').decode(bytes), original);
  assert.throws(() => encode('😀', 'windows-1254'), /desteklemiyor/);
});
