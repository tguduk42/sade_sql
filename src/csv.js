const NUMERIC_TYPES = new Set([20, 21, 23, 700, 701, 1700]);
const { display } = require('./ui/number-format');
const MODES = {
  standard: { delimiter: ',', decimal: '.', encoding: 'utf8', bom: '\uFEFF' },
  'excel-tr': { delimiter: ';', decimal: ',', encoding: 'utf8', bom: '\uFEFF' },
  'excel-tr-legacy': { delimiter: ';', decimal: ',', encoding: 'windows-1254', bom: '' }
};
let legacyMap;
function encode(text, encoding) {
  if (encoding !== 'windows-1254') return Buffer.from(text, 'utf8');
  if (!legacyMap) {
    legacyMap = new Map();
    const decoder = new TextDecoder('windows-1254');
    for (let i = 0; i < 256; i++) {
      const char = decoder.decode(Uint8Array.of(i));
      if (char !== '\uFFFD') legacyMap.set(char, i);
    }
  }
  const bytes = [];
  for (const char of text) {
    const byte = legacyMap.get(char);
    if (byte === undefined) throw new Error('Eski Excel kodlaması bu karakteri desteklemiyor: ' + char + '. CSV biçimini Excel (Türkçe / UTF-8) seçin veya Excel indir kullanın.');
    bytes.push(byte);
  }
  return Buffer.from(bytes);
}
function createCSV(mode, valueText, numberFormat = 'raw') {
  const options = MODES[mode];
  if (!options) throw new Error('Geçersiz CSV biçimi.');
  const cell = (value, field = {}) => {
    let text = valueText(value);
    // Localize database numbers only. Text IDs, JSON and dates must retain dots.
    if (options.decimal === ',') {
      const formatted = display(text, field.dataTypeID, field.name, numberFormat);
      if (formatted !== text) text = formatted;
      else if (NUMERIC_TYPES.has(field.dataTypeID) && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) text = text.replace('.', ',');
    }
    return text.includes(options.delimiter) || /["\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
  };
  return {
    header: fields => encode(options.bom + fields.map(field => cell(field.name)).join(options.delimiter) + '\r\n', options.encoding),
    row: (values, fields) => encode(values.map((value, index) => cell(value, fields[index])).join(options.delimiter) + '\r\n', options.encoding)
  };
}
module.exports = { createCSV, encode };
