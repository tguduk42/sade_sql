const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Database, configuration } = require('./database');
const { Store } = require('./store');
const { describeError } = require('./errors');
const { Updater } = require('./updater');
const database = new Database();
let window, store, pendingRestart;
const exportedFiles = new Set();
function handle(name, action) {
  ipcMain.handle(name, async (event, data) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) return { ok: false, error: 'Geçersiz istek.' };
    try { return { ok: true, data: await action(data) }; }
    catch (error) { return { ok: false, error: describeError(error) }; }
  });
}
if (process.env.SADE_SQL_DATA_DIR) app.setPath('userData', process.env.SADE_SQL_DATA_DIR);
app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'), safeStorage);
  try { await store.load(); } catch (error) { dialog.showErrorBox('Kayıtlar açılamadı', error.message); app.quit(); return; }
  Menu.setApplicationMenu(null);
  window = new BrowserWindow({ width: 1380, height: 880, minWidth: 1000, minHeight: 660, backgroundColor: '#171b20', title: 'Sade SQL',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, { type: 'question', title: 'Sade SQL kapatılsın mı?', message: 'Kaydedilmemiş değişiklikler veya devam eden işlem var.', detail: 'Kapatırsanız kaydedilmemiş değişiklikler kaybolur ve devam eden işlem iptal edilir.', buttons: ['Vazgeç', 'Kapat'], defaultId: 0, cancelId: 0 });
    if (choice === 1) event.preventDefault();
    else if (pendingRestart) { window.removeListener('closed', pendingRestart); pendingRestart = null; }
  });
  handle('workspace:load', () => store.publicState());
  handle('connection:save', input => { configuration(input); return store.saveConnection(input); });
  handle('connection:test', input => database.test(store.resolve(input)));
  handle('connection:tables', input => new Database().tables(store.resolve(input.connection)));
  handle('query:save', input => store.saveQuery(input));
  handle('workspace:remove', input => store.remove(input.kind, input.id));
  handle('query:run', input => database.preview(store.resolve(input.connection), input.sql, input.parameters));
  handle('query:cancel', () => database.cancel());
  handle('query:export', async input => {
    if (!['csv', 'xlsx'].includes(input.format)) throw new Error('Geçersiz dosya türü.');
    const choice = await dialog.showSaveDialog(window, { title: input.format === 'xlsx' ? 'Excel olarak kaydet' : 'CSV olarak kaydet',
      defaultPath: path.join(app.getPath('downloads'), (String(input.name || 'Sorgu sonucu').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || 'Sonuclar') + '.' + input.format),
      filters: [{ name: input.format === 'xlsx' ? 'Excel çalışma kitabı' : 'CSV dosyası', extensions: [input.format] }]
    });
    if (choice.canceled) return { cancelled: true };
    const result = await database.export(store.resolve(input.connection), input.sql, input.format, choice.filePath,
      progress => { if (!window.isDestroyed()) window.webContents.send('export:progress', progress); }, input.parameters, { csvMode: input.csvMode || 'excel-tr' });
    exportedFiles.add(result.path);
    return result;
  });
  handle('query:open', async () => {
    const choice = await dialog.showOpenDialog(window, { properties: ['openFile'], filters: [{ name: 'SQL dosyası', extensions: ['sql'] }] });
    if (choice.canceled) return null;
    if ((await fs.stat(choice.filePaths[0])).size > 2_000_000) throw new Error('SQL dosyası en fazla 2 MB olabilir.');
    return { name: path.basename(choice.filePaths[0], '.sql'), sql: await fs.readFile(choice.filePaths[0], 'utf8') };
  });
  handle('file:show', file => { if (exportedFiles.has(file)) shell.showItemInFolder(file); });
  const updater = new Updater({ current: app.getVersion(), directory: path.join(app.getPath('downloads'), 'Sade SQL'),
    notify: state => { if (!window.isDestroyed()) window.webContents.send('update:state', state); } });
  handle('update:state', () => updater.state);
  handle('update:check', () => updater.check());
  handle('update:download', () => updater.download());
  handle('update:restart', async () => {
    if (!app.isPackaged || process.platform !== 'win32') throw new Error('Güncelleme açılışı paketlenmiş Windows uygulamasında kullanılabilir.');
    const file = await updater.readyFile();
    // Relaunch is scheduled only after the window actually closes. Existing
    // beforeunload confirmation can still cancel closure without starting a copy.
    if (pendingRestart) return null;
    pendingRestart = () => app.relaunch({ execPath: file, args: [] });
    window.once('closed', pendingRestart);
    window.close();
    return null;
  });
  await window.loadFile(path.join(__dirname, 'ui/index.html'));
  if (app.isPackaged) {
    const timer = setTimeout(() => updater.check(), 5000); timer.unref();
    const interval = setInterval(() => updater.check(), 6 * 60 * 60 * 1000); interval.unref();
  }
});
app.on('window-all-closed', () => { database.cancel(); app.quit(); });
