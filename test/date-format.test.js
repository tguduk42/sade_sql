const test = require('node:test');
const assert = require('node:assert/strict');
const { format } = require('../src/ui/date-format');
test('Timestamp display preserves six microsecond digits and wall-clock time without Date conversion', () => {
  for (const [value, expected] of [
    ['2022-12-21 12:26:06.671862','2022-12-21 12:26:06.671862'],
    ['2022-12-21 12:26:06.1','2022-12-21 12:26:06.100000'],
    ['2022-12-21 12:26:06','2022-12-21 12:26:06.000000'],
    ['2022-12-21 12:26:06.000001+03','2022-12-21 12:26:06.000001'],
    ['2022-12-21 12:26:06.123456+05:45','2022-12-21 12:26:06.123456'],
    ['2022-12-21T12:26:06.123456Z','2022-12-21 12:26:06.123456'],
    ['1900-01-01 12:00:00+05:41:16','1900-01-01 12:00:00.000000']
  ]) assert.equal(format(value,1184),expected);
  assert.equal(format('2022-12-21 12:26:06.671862',1114),'2022-12-21 12:26:06.671862');
});
test('Date-only, literal text, NULL and exceptional timestamps are retained', () => {
  assert.equal(format('2022-12-21',1082),'2022-12-21');
  assert.equal(format('2022-12-21T12:00:00Z',25),'2022-12-21T12:00:00Z');
  assert.equal(format(null,1114),null);
  for (const text of ['infinity','-infinity','0001-01-01 00:00:00 BC']) assert.equal(format(text,1114),text);
});
