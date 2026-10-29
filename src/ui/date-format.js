(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DateDisplay = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function isTimestamp(oid) { return oid === 1114 || oid === 1184; }
  function format(value, oid) {
    if (value == null || !isTimestamp(oid)) return value;
    const text = String(value);
    // PostgreSQL ISO output, including historical offsets with seconds.
    // Do not parse through Date: that would truncate microseconds to milliseconds.
    const match = /^(\d{4,}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}(?::?\d{2})?(?::?\d{2})?)?$/.exec(text);
    if (!match) return text; // Preserve infinity, BC dates and unusual values.
    return match[1] + ' ' + match[2] + '.' + (match[3] || '').padEnd(6, '0');
  }
  return { isTimestamp, format };
});
