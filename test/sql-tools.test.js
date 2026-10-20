const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze, bind, completions, parameterValue } = require('../src/ui/sql-tools');
test('SQL parameter lexer skips strings, escaped strings, quoted identifiers, nested comments and dollar bodies', () => {
  const sql = `SELECT :id::int, :id, :other, ':ignored', "colon:name", E'escaped\\' :ignored', $$:ignored $3$$, $tag$:ignored $7$tag$
    -- :ignored $9
    /* :ignored /* $8 */ :ignored */ $işlem$:ignored $4$işlem$`;
  const parsed = analyze(sql);
  assert.deepEqual(parsed.names, ['id', 'other']);
  const compiled = bind(sql, { id: '42', other: "' OR true --" });
  assert.ok(compiled.text.startsWith('SELECT $1::int, $1, $2,'));
  assert.deepEqual(compiled.values, ['42', "' OR true --"]);
  assert.ok(compiled.text.includes("':ignored'"));
  assert.throws(() => bind('SELECT :id, $1', { id: 1, '$1': 2 }), /birlikte/);
  assert.throws(() => bind('SELECT $2', { '$2': 2 }), /sıralı/);
  assert.throws(() => bind('SELECT $999999', {}), /128/);
});
test('Parameter conversions preserve precision, empty text, explicit NULL and JSON arrays', () => {
  assert.equal(parameterValue('number', '9007199254740993.123'), '9007199254740993.123');
  assert.equal(parameterValue('text', ''), ''); assert.equal(parameterValue('text', 'abc', true), null);
  assert.equal(parameterValue('boolean', 'false'), false);
  assert.equal(parameterValue('json', '[1, "İstanbul"]'), '[1,"İstanbul"]');
  assert.throws(() => parameterValue('number', '1; DROP TABLE x'), /sayı/);
  assert.throws(() => parameterValue('json', '{bad}'), /JSON/);
});
test('Completion offers SQL, schema tables and quoted columns for aliases while skipping comments and literals', () => {
  const tables = [{ schema: 'public', name: 'users', kind: 'table', columns: [{ name: 'email', type: 'text' }, { name: 'odd"name', type: 'text' }] }];
  assert.equal(completions('SEL', 3, []).items[0].insert, 'SELECT');
  assert.ok(completions('SELECT * FROM us', 16, tables).items.some(item => item.insert === '"public"."users"'));
  const sql = 'SELECT u.em FROM public.users u';
  assert.equal(completions(sql, 'SELECT u.em'.length, tables).items[0].insert, '"email"');
  assert.equal(completions('SELECT public.', 14, tables).items[0].insert, '"users"');
  assert.equal(completions("SELECT 'SEL", 11, tables, true), null);
  assert.equal(completions('SELECT 1 -- SEL', 15, tables, true), null);
});
