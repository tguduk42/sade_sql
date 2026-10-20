const fs = require('node:fs/promises');
const path = require('node:path');
class Store {
  constructor(directory, encryption) { this.file = path.join(directory, 'workspace.json'); this.encryption = encryption; this.state = { connections: [], queries: [] }; }
  async load() {
    try {
      this.state = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (!Array.isArray(this.state.connections) || !Array.isArray(this.state.queries)) throw new Error('Geçersiz kayıt dosyası.');
    } catch (error) { if (error.code !== 'ENOENT') throw new Error('Kayıt dosyası okunamadı: ' + this.file); }
  }
  publicState() {
    return { queries: this.state.queries, connections: this.state.connections.map(({ secret, ...connection }) => ({ ...connection, hasPassword: Boolean(secret) })) };
  }
  resolve(connection) {
    const stored = this.state.connections.find(item => item.id === connection.id);
    let password = connection.password;
    if ((password == null || password === '') && connection.useSavedPassword && stored?.secret) {
      if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows parola şifrelemesi şu anda kullanılamıyor. Parolanızı yeniden girin.');
      password = this.encryption.decryptString(Buffer.from(stored.secret, 'base64'));
    }
    return { ...connection, password };
  }
  async persist() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file + '.tmp', JSON.stringify(this.state, null, 2), { mode: 0o600 });
    await fs.rename(this.file + '.tmp', this.file);
  }
  async saveConnection(input) {
    const { randomUUID } = require('node:crypto');
    const previous = this.state.connections.find(item => item.id === input.id);
    const connection = { id: input.id || randomUUID(), name: String(input.name || input.database).trim(), host: String(input.host), port: Number(input.port || 5432), database: String(input.database), user: String(input.user), ssl: input.ssl || 'disable' };
    if (input.rememberPassword) {
      if (!this.encryption.isEncryptionAvailable()) throw new Error('Güvenli parola saklama kullanılamıyor. Parolayı hatırla seçeneğini kapatın.');
      if (input.password) connection.secret = this.encryption.encryptString(input.password).toString('base64');
      else if (input.useSavedPassword) connection.secret = previous?.secret;
    }
    this.state.connections = this.state.connections.filter(item => item.id !== connection.id).concat(connection);
    await this.persist();
    return { id: connection.id, ...this.publicState() };
  }
  async saveQuery(input) {
    const { randomUUID } = require('node:crypto');
    const query = { id: input.id || randomUUID(), name: String(input.name).trim().slice(0, 160), sql: String(input.sql), updatedAt: new Date().toISOString() };
    if (!query.name || !query.sql.trim()) throw new Error('Sorgu adı ve SQL gerekli.');
    this.state.queries = this.state.queries.filter(item => item.id !== query.id).concat(query);
    await this.persist();
    return { id: query.id, ...this.publicState() };
  }
  async remove(kind, id) {
    if (!['queries', 'connections'].includes(kind)) throw new Error('Geçersiz kayıt türü.');
    this.state[kind] = this.state[kind].filter(item => item.id !== id);
    await this.persist();
    return this.publicState();
  }
}
module.exports = { Store };
