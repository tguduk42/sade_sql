const test = require('node:test');
const assert = require('node:assert/strict');
const { money, display, isMoneyColumn, excelNumber } = require('../src/ui/number-format');
test('Turkish money formatting groups digits and rounds decimal strings without binary precision loss', () => {
  for (const [input, expected] of [['36000', '36.000,00'], ['850000.0000000', '850.000,00'], ['1234.56', '1.234,56'], ['-12.34','-12,34'], ['0.18','0,18'], ['1.005','1,01'], ['-1.005','-1,01'], ['999.995','1.000,00'], ['.005','0,01'], ['0.0049','0,00'], ['-0.004','0,00'], ['1.25e4','12.500,00'], ['1e-8','0,00'], ['5e-3','0,01'], ['9007199254740993.125','9.007.199.254.740.993,13']]) assert.equal(money(input), expected, input);
  for (const input of ['NaN','Infinity','abc','1234,56']) assert.equal(money(input), input);
});
test('Formatting distinguishes decimal amounts, integer money columns, IDs and raw values', () => {
  assert.equal(isMoneyColumn(1700, 'whatever'), true);
  assert.equal(display('36000', 23, 'İşlem Tutarı'), '36.000,00');
  assert.equal(display('36000', 23, 'customer_id'), '36000');
  assert.equal(display('36000', 1700, 'customerId'), '36000');
  assert.equal(display('850000.0000000', 25, 'kod'), '850000.0000000');
  assert.equal(display('36000', 1700, 'tutar', 'raw'), '36000');
  assert.equal(display(null, 1700, 'tutar'), null);
  assert.equal(excelNumber('36000.0000000'), 36000);
  assert.equal(excelNumber('850000.0000000'), 850000);
  assert.equal(excelNumber('9007199254740993.125'), null);
  assert.equal(excelNumber('NaN'), null);
  assert.equal(excelNumber('1e-999'), null);
});
