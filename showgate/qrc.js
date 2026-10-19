/* Minimal QRC client: JSON-RPC 2.0 over TCP, null-terminated, with NoOp keep-alive. */
'use strict';
const net = require('net');

class QrcClient {
  constructor({ host = '127.0.0.1', port = 1710, user, pin } = {}) {
    Object.assign(this, { host, port, user, pin });
    this.id = 0; this.pending = new Map(); this.buf = ''; this.sock = null; this.ka = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const s = net.connect(this.port, this.host);
      s.once('error', reject);
      s.on('data', (d) => this._data(d));
      s.on('close', () => { clearInterval(this.ka); for (const [, p] of this.pending) p.reject(new Error('Connection to Core closed')); this.pending.clear(); this.sock = null; });
      s.once('connect', async () => {
        s.removeListener('error', reject); s.on('error', () => {});
        this.sock = s;
        try { if (this.user) await this.call('Logon', { User: this.user, Password: this.pin }); }
        catch (e) { s.destroy(); return reject(e); }
        this.ka = setInterval(() => this.call('NoOp', {}).catch(() => {}), 30000); this.ka.unref();
        resolve(this);
      });
    });
  }
  _data(d) {
    this.buf += d.toString('utf8'); let i;
    while ((i = this.buf.indexOf('\0')) >= 0) {
      const raw = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
      if (!raw.trim()) continue;
      const m = JSON.parse(raw); const p = this.pending.get(m.id); if (!p) continue;
      this.pending.delete(m.id);
      if (m.error) { const e = new Error(m.error.message); e.code = m.error.code; p.reject(e); } else p.resolve(m.result);
    }
  }
  call(method, params) {
    if (!this.sock) return Promise.reject(new Error('Not connected to the Core'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error('Core did not answer in 3 s')); }, 3000);
      this.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.sock.write(JSON.stringify({ jsonrpc: '2.0', method, params, id }) + '\0');
    });
  }
  close() { clearInterval(this.ka); if (this.sock) this.sock.end(); }
}
module.exports = { QrcClient };
