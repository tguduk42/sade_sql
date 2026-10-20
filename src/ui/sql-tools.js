(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SQLTools = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const quote = value => '"' + value.replaceAll('"', '""') + '"';
  function analyze(sql) {
    const tokens = [], mask = sql.split('');
    let i = 0, endState = 'code';
    const blank = (start, end) => { for (let n = start; n < end; n++) if (mask[n] !== '\n') mask[n] = ' '; };
    while (i < sql.length) {
      const start = i;
      if (sql.startsWith('--', i)) {
        i = sql.indexOf('\n', i + 2); if (i < 0) { i = sql.length; endState = 'comment'; } blank(start, i); continue;
      }
      if (sql.startsWith('/*', i)) {
        let depth = 1; i += 2;
        while (i < sql.length && depth) { if (sql.startsWith('/*', i)) { depth++; i += 2; } else if (sql.startsWith('*/', i)) { depth--; i += 2; } else i++; }
        if (depth) endState = 'comment'; blank(start, i); continue;
      }
      if (sql[i] === "'" || sql[i] === '"') {
        const delimiter = sql[i++];
        const escaped = delimiter === "'" && /[eE]/.test(sql[start - 1] || '') && !/[\w$]/.test(sql[start - 2] || '');
        let closed = false;
        while (i < sql.length) {
          if (escaped && sql[i] === '\\') { i += 2; continue; }
          if (sql[i] === delimiter) { if (sql[i + 1] === delimiter) { i += 2; continue; } i++; closed = true; break; }
          i++;
        }
        i = Math.min(i, sql.length);
        if (!closed) endState = delimiter === '"' ? 'identifier' : 'string';
        if (delimiter === "'") blank(start, i);
        continue;
      }
      if (sql[i] === '$' && !/[\p{L}\p{N}_$]/u.test(sql[i - 1] || '')) {
        const tag = sql.slice(i).match(/^\$(?:[\p{L}_][\p{L}\p{N}_]*)?\$/u)?.[0];
        if (tag) {
          const end = sql.indexOf(tag, i + tag.length);
          i = end < 0 ? sql.length : end + tag.length;
          if (end < 0) endState = 'string'; blank(start, i); continue;
        }
        const positional = sql.slice(i).match(/^\$([1-9][0-9]*)/);
        if (positional) { i += positional[0].length; tokens.push({ start, end: i, name: positional[0], position: Number(positional[1]) }); continue; }
      }
      if (sql[i] === ':' && sql[i - 1] !== ':' && sql[i + 1] !== ':') {
        const named = sql.slice(i + 1).match(/^[A-Za-z_][A-Za-z_0-9]*/)?.[0];
        if (named) { i += named.length + 1; tokens.push({ start, end: i, name: named }); continue; }
      }
      i++;
    }
    const native = tokens.some(token => token.position !== undefined);
    const named = tokens.some(token => token.position === undefined);
    let error = native && named ? ':isim ve $1 parametrelerini aynı sorguda birlikte kullanmayın.' : null;
    const names = [...new Set(tokens.map(token => token.name))];
    if (native) names.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    if (names.length > 128 || tokens.some(token => token.position > 128)) error = 'Bir sorguda en fazla 128 parametre kullanılabilir.';
    if (!error && native && names.some((name, index) => name !== '$' + (index + 1))) error = '$ parametreleri $1’den başlayıp sıralı olmalı ($1, $2, …).';
    return { tokens, names, native, error, mask: mask.join(''), endState };
  }
  function bind(sql, parameters = {}) {
    const parsed = analyze(sql);
    if (parsed.error) throw new Error(parsed.error);
    const values = parsed.names.map(name => {
      if (!parameters || !Object.hasOwn(parameters, name)) throw new Error('Parametre değeri eksik: ' + (parsed.native ? name : ':' + name));
      const value = parameters[name];
      if (value !== null && !['string', 'boolean', 'number'].includes(typeof value)) throw new Error('Geçersiz parametre değeri: ' + name);
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Geçersiz sayısal parametre: ' + name);
      return value;
    });
    let text = '', cursor = 0;
    for (const token of parsed.tokens) {
      text += sql.slice(cursor, token.start) + (parsed.native ? token.name : '$' + (parsed.names.indexOf(token.name) + 1)); cursor = token.end;
    }
    return { text: text + sql.slice(cursor), values };
  }
  function parameterValue(type, text, isNull = false) {
    if (isNull) return null;
    if (type === 'number') {
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text.trim())) throw new Error('Geçerli bir sayı girin; ondalık ayırıcı olarak nokta kullanın.');
      return text.trim(); // Retain exact bigint/numeric precision.
    }
    if (type === 'boolean') {
      if (!/^(true|false)$/i.test(text.trim())) throw new Error('Boolean değer true veya false olmalı.');
      return text.trim().toLowerCase() === 'true';
    }
    if (type === 'json') { try { return JSON.stringify(JSON.parse(text)); } catch { throw new Error('Geçerli bir JSON değeri girin.'); } }
    if (type === 'date' || type === 'timestamp') {
      if (!/^\d{4}-\d{2}-\d{2}/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error('Geçerli bir tarih girin.');
    }
    return text;
  }
  const keywords = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IS NULL', 'IS NOT NULL', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'ON', 'IN', 'BETWEEN', 'LIKE', 'ILIKE', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'UNION ALL', 'INSERT INTO', 'UPDATE', 'SET', 'DELETE FROM', 'RETURNING', 'COUNT(*)', 'SUM(', 'AVG(', 'MIN(', 'MAX(', 'COALESCE(', 'CURRENT_DATE', 'CURRENT_TIMESTAMP'];
  const identifier = '(?:"(?:[^"]|"")*"|[A-Za-z_][A-Za-z_0-9$]*)';
  const unquote = value => value.startsWith('"') ? value.slice(1, -1).replaceAll('""', '"') : value.toLowerCase();
  function completions(sql, cursor, tables = [], explicit = false) {
    const before = sql.slice(0, cursor), parsed = analyze(before);
    if (parsed.endState !== 'code') return null;
    const word = before.match(/[A-Za-z_0-9$]*$/)[0], start = cursor - word.length;
    if (/[:$]/.test(before[start - 1] || '')) return null;
    const dot = before.slice(0, start).match(new RegExp('(' + identifier + ')\\.\\s*$'));
    if (!explicit && !dot && word.length < 2) return null;
    const all = analyze(sql).mask, referenced = [], aliases = new Map();
    const references = new RegExp('\\b(?:FROM|JOIN|UPDATE|INTO)\\s+(' + identifier + ')(?:\\s*\\.\\s*(' + identifier + '))?(?:\\s+(?:AS\\s+)?(' + identifier + '))?', 'gi');
    for (const match of all.matchAll(references)) {
      const schema = match[2] ? unquote(match[1]) : null, name = unquote(match[2] || match[1]);
      const table = tables.find(table => table.name === name && (!schema || table.schema === schema));
      if (table) {
        referenced.push(table); aliases.set(table.name, table);
        if (match[3] && !keywords.some(keyword => keyword.split(/[ (]/)[0] === match[3].toUpperCase())) aliases.set(unquote(match[3]), table);
      }
    }
    const candidates = [], addTable = (table, qualified) => candidates.push({ label: table.schema + '.' + table.name, insert: qualified ? quote(table.schema) + '.' + quote(table.name) : quote(table.name), match: table.name, kind: 'tablo', detail: table.kind });
    const addColumns = source => {
      for (const table of source) for (const column of table.columns || []) candidates.push({ label: column.name, insert: quote(column.name), match: column.name, kind: 'sütun', detail: table.name + ' · ' + column.type });
    };
    if (dot) {
      const qualifier = unquote(dot[1]), table = aliases.get(qualifier) || tables.find(table => table.name === qualifier);
      if (table) addColumns([table]); else for (const table of tables.filter(table => table.schema === qualifier)) addTable(table, false);
    } else {
      const tableContext = /\b(?:FROM|JOIN|UPDATE|INTO)\s*$/i.test(parsed.mask.slice(0, start));
      if (!tableContext) {
        addColumns(referenced.length ? referenced : tables);
        for (const keyword of keywords) candidates.push({ label: keyword, insert: keyword, match: keyword, kind: 'SQL', detail: '' });
      }
      for (const table of tables) addTable(table, true);
      for (const schema of new Set(tables.map(table => table.schema))) candidates.push({ label: schema, insert: quote(schema) + '.', match: schema, kind: 'şema', detail: '' });
    }
    const seen = new Set(), prefix = word.toLowerCase();
    const items = candidates.filter(candidate => candidate.match.toLowerCase().startsWith(prefix) && !seen.has(candidate.insert) && seen.add(candidate.insert)).slice(0, 30);
    return items.length ? { start, end: cursor, items } : null;
  }
  return { analyze, bind, parameterValue, completions, quote };
});
