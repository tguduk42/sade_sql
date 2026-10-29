(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NumberDisplay = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const decimals = new Set([700, 701, 1700]);
  const integers = new Set([20, 21, 23]);
  function isMoneyColumn(oid, name = '') {
    const normalized = name.replace(/([a-z])([A-Z])/g, '$1_$2').toLocaleLowerCase('tr-TR').replaceAll('ı', 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/(?:^|[_\s])(?:id|kimlik|kod|code|uuid|iban)(?:$|[_\s])/.test(normalized)) return false;
    return decimals.has(oid) || integers.has(oid) && /tutar|amount|fiyat|price|bakiye|balance|toplam|total|bedel|borc|alacak|odeme|payment|maliyet|cost|komisyon|fee/.test(normalized);
  }
  // Decimal-string rounding avoids Number's precision loss and 1.005 errors.
  // Round half away from zero to two places, including exponent notation.
  function money(value) {
    const text = String(value);
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[2] || match[3])) return text;
    const exponent = Number(match[4] || 0);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000 || text.length > 10000) return text;
    const digits = match[2] + (match[3] || '');
    const end = match[2].length + exponent + 2;
    let cents = end >= digits.length ? digits + '0'.repeat(end - digits.length) : digits.slice(0, Math.max(0, end));
    cents = cents.replace(/^0+/, '') || '0';
    if (end >= 0 && end < digits.length && digits[end] >= '5') cents = (BigInt(cents) + 1n).toString();
    cents = cents.padStart(3, '0');
    const sign = match[1] === '-' && /[1-9]/.test(cents) ? '-' : '';
    return sign + cents.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + cents.slice(-2);
  }
  function display(value, oid, name, mode = 'tr-money') {
    if (value == null) return value;
    return mode === 'tr-money' && isMoneyColumn(oid, name) ? money(value) : String(value);
  }
  function excelNumber(value) {
    const text = String(value);
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
    const significant = text.replace(/^[+-]/, '').split(/[eE]/)[0].replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length;
    const number = Number(text);
    // Excel supports 15 significant digits. Keep larger values as exact text.
    if (significant > 15 || !Number.isFinite(number) || number === 0 && /[1-9]/.test(text.split(/[eE]/)[0])) return null;
    return number;
  }
  return { isMoneyColumn, money, display, excelNumber };
});
