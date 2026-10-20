const $ = selector => document.querySelector(selector);
const api = window.desktop;
let workspace = { connections: [], queries: [] }, connectionId = null, queryId = null;
let savedSQL = '', busy = false, exportedPath = null, hasRun = false, toastTimer;
let volatilePassword = '', useSavedPassword = false;
let tables = [], tablesLoading = false, tableError = '', tableRequest = 0, savingQuery = false;
const sql = $('#sql');
const editor = window.createSQLEditor(sql, updateEditor);
const number = value => value.toLocaleString('tr-TR');
function toast(message, error = false) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').className = error ? 'error' : ''; $('#toast').hidden = false;
  toastTimer = setTimeout(() => $('#toast').hidden = true, error ? 9000 : 4500);
}
async function call(method, input) {
  const result = await api[method](input);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
function confirmAction(title, text) {
  return new Promise(resolve => {
    const modal = $('#confirm-dialog'); $('#confirm-title').textContent = title; $('#confirm-text').textContent = text;
    let finished = false;
    const finish = value => { if (finished) return; finished = true; modal.close(); resolve(value); };
    $('#confirm-yes').onclick = () => finish(true); $('#confirm-no').onclick = () => finish(false);
    modal.oncancel = event => { event.preventDefault(); finish(false); }; modal.showModal();
  });
}
function updateEditor() {
  const query = workspace.queries.find(item => item.id === queryId);
  const name = query?.name || 'Yeni sorgu';
  $('#query-title').textContent = name; $('#breadcrumb').textContent = name; $('#editor-file').textContent = name + '.sql';
  $('#dirty').hidden = sql.value === savedSQL;
  $('#line-numbers').textContent = Array.from({ length: sql.value.split('\n').length }, (_, index) => index + 1).join('\n');
  editor.sync();
  updateButtons();
}
function currentConnection() {
  const selected = workspace.connections.find(item => item.id === connectionId);
  if (!selected) throw new Error('Önce sol üstten bir PostgreSQL bağlantısı ekleyin.');
  return { ...selected, password: volatilePassword, useSavedPassword };
}
function updateButtons() {
  const ready = Boolean(connectionId && sql.value.trim() && !busy);
  $('#run-query').disabled = !ready;
  $('#export-csv').disabled = !ready; $('#export-xlsx').disabled = !ready;
  $('#cancel').hidden = !busy;
  for (const selector of ['#save-query', '#rename-query', '#new-query', '#open-sql', '#add-connection', '#edit-connection']) $(selector).disabled = busy || savingQuery;
  $('#refresh-tables').disabled = busy || tablesLoading || !connectionId;
  sql.readOnly = busy;
  editor.disable(busy);
}
function setBusy(value, label = 'Hazır') { busy = value; updateButtons(); $('#status-text').textContent = label; }
function clearTables(message = '') {
  tableRequest++; tables = []; tablesLoading = false; tableError = message;
  $('#table-search').value = ''; renderTables();
}
function renderTables() {
  editor.setCatalog(tables);
  const list = $('#table-list'); list.replaceChildren();
  $('#table-count').textContent = tables.length ? String(tables.length) : '';
  const filter = $('#table-search').value.toLocaleLowerCase('tr-TR');
  const visible = tables.filter(table => (table.schema + '.' + table.name).toLocaleLowerCase('tr-TR').includes(filter));
  if (tablesLoading || tableError || !visible.length) {
    const hint = document.createElement('div'); hint.className = 'sidebar-hint';
    hint.textContent = tablesLoading ? 'Tablolar yükleniyor…' : tableError || (filter ? 'Eşleşen tablo yok.' : connectionId ? 'Okunabilir tablo veya görünüm bulunamadı.' : 'Tablolar için bir bağlantı seç.');
    list.append(hint);
  } else {
    const groups = new Map();
    for (const table of visible) {
      let group = groups.get(table.schema);
      if (!group) {
        group = document.createElement('details'); group.className = 'schema-group'; group.open = true;
        const heading = document.createElement('summary'); heading.textContent = table.schema; group.append(heading);
        groups.set(table.schema, group); list.append(group);
      }
      const button = document.createElement('button'); button.className = 'table-item';
      button.dataset.schema = table.schema; button.dataset.table = table.name;
      const icon = document.createElement('span'); icon.textContent = table.kind.includes('view') ? '◫' : '▦'; icon.className = 'table-item-icon';
      const name = document.createElement('span'); name.textContent = table.name;
      button.append(icon, name); button.title = table.schema + '.' + table.name + ' — SELECT sorgusunu aç';
      button.onclick = async () => {
        if (busy || savingQuery || $('dialog[open]') || !await allowDiscard()) return;
        const quote = value => '"' + value.replaceAll('"', '""') + '"';
        queryId = null; sql.value = 'SELECT * FROM ' + quote(table.schema) + '.' + quote(table.name) + ';'; savedSQL = '';
        clearResults(); updateEditor(); renderSidebar(); sql.focus();
      };
      group.append(button);
    }
  }
  updateButtons();
}
async function refreshTables() {
  if (!connectionId) { clearTables(); return; }
  const request = ++tableRequest;
  const selected = connectionId;
  tables = []; tableError = ''; tablesLoading = true; renderTables();
  try {
    const result = await call('tables', { connection: currentConnection() });
    if (request === tableRequest && selected === connectionId) tables = result;
  } catch (error) { if (request === tableRequest) tableError = error.message; }
  finally { if (request === tableRequest) { tablesLoading = false; renderTables(); } }
}
function clearResults() {
  editor.reset();
  hasRun = false; exportedPath = null; $('#show-file').hidden = true;
  $('#row-count').textContent = '0 satır'; $('#duration').textContent = '';
  $('#results').replaceChildren();
  const empty = document.createElement('div'); empty.className = 'empty-state';
  const icon = document.createElement('div'); icon.className = 'empty-icon'; icon.textContent = '▦';
  const title = document.createElement('h2'); title.textContent = 'Sorgun hazır.';
  const hint = document.createElement('p'); hint.textContent = 'Sonuçları görmek için Çalıştır’a bas veya tüm sonuçları doğrudan indir.';
  empty.append(icon, title, hint); $('#results').append(empty); $('#status-text').textContent = 'Hazır';
}
function renderSidebar() {
  const connections = $('#connection-list'); connections.replaceChildren();
  if (!workspace.connections.length) {
    const button = document.createElement('button'); button.className = 'connection-item'; button.textContent = '＋ İlk bağlantını ekle'; button.onclick = () => openConnection(); connections.append(button);
  }
  for (const connection of workspace.connections) {
    const button = document.createElement('button'); button.className = 'connection-item' + (connection.id === connectionId ? ' active' : '');
    const icon = document.createElement('span'); icon.className = 'connection-icon'; icon.textContent = '▱';
    const info = document.createElement('span'), name = document.createElement('strong'), detail = document.createElement('small');
    name.textContent = connection.name; detail.textContent = connection.database + ' · ' + connection.host; info.append(name, detail); button.append(icon, info);
    button.onclick = () => {
      if (busy || savingQuery) return;
      if (connectionId !== connection.id) { connectionId = connection.id; volatilePassword = ''; useSavedPassword = connection.hasPassword; clearTables(); }
      renderSidebar();
      if (!connection.hasPassword && !volatilePassword) openConnection(connection); else refreshTables();
    };
    button.ondblclick = () => { if (!busy) openConnection(connection); }; connections.append(button);
  }
  const queryList = $('#query-list'); queryList.replaceChildren();
  const filter = $('#search').value.toLocaleLowerCase('tr-TR');
  const queries = workspace.queries.filter(query => query.name.toLocaleLowerCase('tr-TR').includes(filter)).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  if (!queries.length) {
    const hint = document.createElement('div'); hint.className = 'sidebar-hint'; hint.textContent = filter ? 'Eşleşen sorgu yok.' : 'Sorgularını isim vererek kaydet. Bir sonraki sefer buradan aç.'; queryList.append(hint);
  }
  for (const query of queries) {
    const entry = document.createElement('div'); entry.dataset.id = query.id; entry.className = 'query-entry' + (query.id === queryId ? ' active' : '');
    const button = document.createElement('button'); button.className = 'query-item'; button.title = 'Açmak için tıkla · Açıp çalıştırmak için çift tıkla';
    const icon = document.createElement('span'); icon.className = 'query-icon'; icon.textContent = '≡';
    const name = document.createElement('span'); name.textContent = query.name; button.append(icon, name);
    button.onclick = async () => {
      if (busy || queryId === query.id || $('dialog[open]') || !await allowDiscard()) return;
      queryId = query.id; sql.value = query.sql; savedSQL = query.sql; clearResults(); updateEditor();
      queryList.querySelectorAll('.query-entry').forEach(item => item.classList.toggle('active', item.dataset.id === queryId));
    };
    button.ondblclick = () => { if (!busy && queryId === query.id && connectionId) run(); };
    const remove = document.createElement('button'); remove.className = 'query-delete'; remove.textContent = '×'; remove.title = 'Sorguyu sil'; remove.setAttribute('aria-label', query.name + ' sorgusunu sil');
    remove.onclick = async () => {
      if (busy || !await confirmAction('Sorgu silinsin mi?', query.name + ' kayıtlı sorgusu silinecek.')) return;
      try { workspace = await call('remove', { kind: 'queries', id: query.id }); if (queryId === query.id) { queryId = null; savedSQL = ''; updateEditor(); } renderSidebar(); } catch (error) { toast(error.message, true); }
    };
    entry.append(button, remove); queryList.append(entry);
  }
  const selected = workspace.connections.find(item => item.id === connectionId);
  $('#active-connection').textContent = selected?.name || 'Bağlantı seçin';
  $('#edit-connection').classList.toggle('connected', Boolean(selected));
  $('#footer-connection').textContent = selected ? '● ' + selected.database + ' @ ' + selected.host + ':' + selected.port : '● Bağlantı seçilmedi';
  updateButtons();
}
async function allowDiscard() {
  return sql.value === savedSQL || await confirmAction('Kaydedilmemiş değişiklikler var', 'Devam edersen editördeki kaydedilmemiş değişiklikler silinecek.');
}
function openConnection(connection = null) {
  const form = $('#connection-form'); form.reset();
  for (const name of ['id', 'name', 'host', 'port', 'database', 'user', 'ssl']) {
    if (connection) form.elements[name].value = connection[name] ?? '';
    else if (name === 'id') form.elements[name].value = '';
  }
  form.elements.password.value = connection?.id === connectionId ? volatilePassword : '';
  form.elements.password.placeholder = connection?.hasPassword ? 'Kayıtlı parola kullanılacak' : 'Parolanız';
  form.elements.rememberPassword.checked = Boolean(connection?.hasPassword);
  $('#connection-message').textContent = ''; $('#delete-connection').hidden = !connection;
  $('#connection-dialog').showModal();
}
function connectionForm() {
  const form = $('#connection-form');
  return { ...Object.fromEntries(new FormData(form)), rememberPassword: form.elements.rememberPassword.checked,
    useSavedPassword: Boolean(workspace.connections.find(item => item.id === form.elements.id.value)?.hasPassword) };
}
function showResults(result) {
  hasRun = true; $('#row-count').textContent = number(result.rows.length) + (result.truncated ? '+' : '') + ' satır';
  $('#duration').textContent = (result.elapsed / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' sn';
  const table = document.createElement('table'), head = document.createElement('thead'), header = document.createElement('tr');
  for (const name of ['#', ...result.fields]) { const th = document.createElement('th'); th.textContent = name; header.append(th); } head.append(header);
  const body = document.createElement('tbody');
  result.rows.forEach((values, index) => {
    const row = document.createElement('tr'), count = document.createElement('td'); count.textContent = index + 1; count.className = 'row-number'; row.append(count);
    for (const value of values) { const cell = document.createElement('td'); cell.textContent = value === null ? 'NULL' : value; if (value === null) cell.className = 'null'; cell.title = value ?? 'NULL'; row.append(cell); }
    body.append(row);
  }); table.append(head, body); $('#results').replaceChildren(table);
  $('#status-text').textContent = result.truncated ? 'İlk 1.000 satır gösteriliyor. İndirme düğmeleri tüm sonuçları aktarır.' : result.rows.length ? 'Sorgu tamamlandı.' : 'Komut tamamlandı. Sonuç satırı yok.';
}
async function run() {
  if (busy) return;
  try {
    const connection = currentConnection(), parameters = editor.values(); setBusy(true, 'Sorgu çalışıyor…');
    exportedPath = null; $('#show-file').hidden = true;
    showResults(await call('run', { connection, sql: sql.value, parameters }));
  } catch (error) {
    const box = document.createElement('div'); box.className = 'error-state'; box.textContent = error.message; $('#results').replaceChildren(box);
    hasRun = false; $('#row-count').textContent = '0 satır'; $('#duration').textContent = ''; $('#status-text').textContent = 'Sorgu tamamlanamadı.';
  } finally { busy = false; updateButtons(); }
}
async function exportResults(format) {
  if (busy) return;
  // Exports are intentionally read-only: rerunning a modifying statement must not duplicate writes.
  try {
    const connection = currentConnection(), parameters = editor.values(); setBusy(true, 'Dosya konumu seçiliyor…');
    const result = await call('export', { connection, sql: sql.value, parameters, format, name: workspace.queries.find(query => query.id === queryId)?.name || 'Sorgu sonucu' });
    if (result.cancelled) { $('#status-text').textContent = 'İndirme iptal edildi.'; return; }
    exportedPath = result.path; $('#show-file').hidden = false;
    $('#status-text').textContent = number(result.rows) + ' satır dosyaya kaydedildi.';
    toast(number(result.rows) + ' satır ' + (format === 'xlsx' ? 'Excel' : 'CSV') + ' olarak kaydedildi.');
  } catch (error) { $('#status-text').textContent = 'Aktarım tamamlanamadı.'; toast(error.message, true); }
  finally { busy = false; updateButtons(); }
}
function openSave() {
  if (busy || savingQuery || !sql.value.trim()) { if (!busy && !savingQuery) toast('Önce bir SQL sorgusu yazın.', true); return; }
  $('#query-name').value = workspace.queries.find(query => query.id === queryId)?.name || '';
  $('#save-copy').hidden = !queryId; $('#save-dialog').showModal(); $('#query-name').focus();
}
async function saveCurrent() {
  if (busy || savingQuery) return;
  const query = workspace.queries.find(item => item.id === queryId);
  if (!query) { openSave(); return; }
  if (!sql.value.trim()) { toast('Önce bir SQL sorgusu yazın.', true); return; }
  const snapshot = { id: query.id, name: query.name, sql: sql.value };
  savingQuery = true; updateButtons();
  try {
    const result = await call('saveQuery', snapshot);
    workspace.queries = result.queries;
    if (queryId === snapshot.id) savedSQL = snapshot.sql;
    renderSidebar(); updateEditor(); toast('Sorgu güncellendi.');
  } catch (error) { toast(error.message, true); }
  finally { savingQuery = false; updateButtons(); }
}
async function saveQuery(copy = false) {
  if (savingQuery || !$('#save-form').reportValidity()) return;
  const snapshot = { id: copy ? null : queryId, name: $('#query-name').value, sql: sql.value };
  savingQuery = true; updateButtons();
  $('#save-form').querySelectorAll('button').forEach(button => button.disabled = true);
  try {
    const result = await call('saveQuery', snapshot);
    workspace.queries = result.queries; queryId = result.id; savedSQL = snapshot.sql; $('#save-dialog').close(); renderSidebar(); updateEditor(); toast('Sorgu kaydedildi.');
  } catch (error) { toast(error.message, true); }
  finally { savingQuery = false; $('#save-form').querySelectorAll('button').forEach(button => button.disabled = false); updateButtons(); }
}
$('#connection-form').onsubmit = async event => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true;
  try { const input = connectionForm(); const result = await call('saveConnection', input); workspace = result; connectionId = result.id; volatilePassword = input.password; useSavedPassword = input.rememberPassword; $('#connection-dialog').close(); clearTables(); renderSidebar(); refreshTables(); toast('Bağlantı kaydedildi.'); }
  catch (error) { $('#connection-message').textContent = error.message; $('#connection-message').className = 'form-message error'; }
  finally { button.disabled = false; }
};
$('#test-connection').onclick = async () => {
  if (!$('#connection-form').reportValidity()) return;
  $('#test-connection').disabled = true; $('#connection-message').textContent = 'Bağlantı deneniyor…'; $('#connection-message').className = 'form-message';
  try { const result = await call('test', connectionForm()); $('#connection-message').textContent = 'Bağlantı başarılı · ' + result.database; }
  catch (error) { $('#connection-message').textContent = error.message; $('#connection-message').className = 'form-message error'; }
  finally { $('#test-connection').disabled = false; }
};
$('#delete-connection').onclick = async () => {
  const id = $('#connection-form').elements.id.value;
  $('#connection-dialog').close();
  if (!await confirmAction('Bağlantı silinsin mi?', 'Yalnızca bu bilgisayardaki bağlantı kaydı silinecek.')) return;
  try { workspace = await call('remove', { kind: 'connections', id }); if (connectionId === id) { connectionId = null; volatilePassword = ''; useSavedPassword = false; clearTables(); } renderSidebar(); } catch (error) { toast(error.message, true); }
};
$('#save-form').onsubmit = event => { event.preventDefault(); saveQuery(); };
$('#save-copy').onclick = () => saveQuery(true);
$('#add-connection').onclick = () => openConnection();
$('#edit-connection').onclick = () => openConnection(workspace.connections.find(item => item.id === connectionId));
$('#save-query').onclick = saveCurrent;
$('#rename-query').onclick = openSave;
$('#refresh-tables').onclick = () => refreshTables();
$('#table-search').oninput = renderTables;
$('#run-query').onclick = run;
$('#export-csv').onclick = () => exportResults('csv'); $('#export-xlsx').onclick = () => exportResults('xlsx');
$('#cancel').onclick = async () => { $('#status-text').textContent = 'İptal ediliyor…'; try { await call('cancel'); } catch (error) { toast(error.message, true); } };
$('#new-query').onclick = async () => { if (busy || !await allowDiscard()) return; queryId = null; sql.value = ''; savedSQL = ''; clearResults(); updateEditor(); renderSidebar(); sql.focus(); };
$('#open-sql').onclick = async () => {
  if (busy || !await allowDiscard()) return;
  try { const result = await call('openSQL'); if (result) { queryId = null; sql.value = result.sql; savedSQL = ''; clearResults(); updateEditor(); renderSidebar(); toast('Dosya açıldı. Kaydet ile sorgu listene ekleyebilirsin.'); } } catch (error) { toast(error.message, true); }
};
$('#show-file').onclick = () => call('showFile', exportedPath).catch(error => toast(error.message, true));
$('#search').oninput = renderSidebar;
sql.oninput = () => { updateEditor(); editor.suggest(); };
sql.onscroll = () => { $('#line-numbers').scrollTop = sql.scrollTop; };
sql.onkeydown = event => { if (event.key === 'Tab') { event.preventDefault(); sql.setRangeText('  ', sql.selectionStart, sql.selectionEnd, 'end'); updateEditor(); } };
document.querySelectorAll('.close-dialog').forEach(button => button.onclick = () => button.closest('dialog').close());
document.addEventListener('keydown', event => {
  if (!event.ctrlKey) return;
  if (event.key.toLowerCase() === 's') { event.preventDefault(); if (!$('dialog[open]')) saveCurrent(); return; }
  if ($('dialog[open]')) return;
  if (event.key === 'Enter') { event.preventDefault(); if (!$('#run-query').disabled) run(); }
  if (event.key.toLowerCase() === 'n') { event.preventDefault(); $('#new-query').click(); }
});
window.addEventListener('beforeunload', event => {
  if (busy || sql.value !== savedSQL) { event.preventDefault(); event.returnValue = ''; }
});
api.onProgress(progress => $('#status-text').textContent = number(progress.rows) + ' satır aktarılıyor…');
call('load').then(result => { workspace = result; if (workspace.connections.length) { connectionId = workspace.connections[0].id; useSavedPassword = workspace.connections[0].hasPassword; } renderSidebar(); updateEditor(); if (useSavedPassword) refreshTables(); else clearTables(connectionId ? 'Tabloları yüklemek için bağlantıyı açın veya ↻ düğmesine basın.' : ''); }).catch(error => toast(error.message, true));
