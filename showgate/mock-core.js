/*
 * Mock Q-SYS Core — speaks QRC (JSON-RPC 2.0 over TCP, null-terminated, port 1710).
 * A stand-in for a real Core or Designer in Emulate mode, so ShowGate can be built and
 * tested with no Windows and no hardware. It imitates QRC's shape, not every detail:
 * the error codes and access rules below are our simulation, to be checked on real Q-SYS.
 *
 * Hall A design:
 *   Presenter, Audience1, Audience2, Remote, Playback  -> controls: gain (dB), mute (0/1)
 *   Scenes      -> snapshot bank 1 Walk-in, 2 Presentation, 3 Q&A, 4 Break
 *   HUSH        -> the human safety logic. External access OFF: no QRC client can read or set it.
 *   HushTally   -> read-only indicator so external clients can SEE hush, never change it.
 * HUSH is a gate on the outputs: while it is on, no mic or remote channel reaches the room,
 * whatever its own mute control says. Releasing HUSH restores exactly what the operators had.
 * Each channel exposes a read-only 'live' control: 1 only when unmuted AND HUSH is off.
 *
 * The "physical HUSH button" is a local panel on 127.0.0.1:1711 (not QRC) — the wall button
 * wired to the Core, which only a human in the room can press.
 */
'use strict';
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');

const QRC_PORT = +process.env.QRC_PORT || 1710;
const PANEL_PORT = +process.env.PANEL_PORT || 1711;
const AUDIT = process.env.AUDIT_LOG || path.join(__dirname, 'core-audit.log');

const USERS = { 'director': { pin: '1994', role: 'Director' }, 'claude-mc': { pin: '0001', role: 'External control' } };
const MICS = ['Presenter', 'Audience1', 'Audience2', 'Remote'];

const design = {
  name: 'HallA', code: 'HA-2026-10',
  components: {
    Presenter: { type: 'gain', access: 'external', controls: { gain: 0, mute: 0 } },
    Audience1: { type: 'gain', access: 'external', controls: { gain: -6, mute: 1 } },
    Audience2: { type: 'gain', access: 'external', controls: { gain: -6, mute: 1 } },
    Remote:    { type: 'gain', access: 'external', controls: { gain: 0, mute: 0 } },
    Playback:  { type: 'gain', access: 'external', controls: { gain: -12, mute: 1 } },
    HUSH:      { type: 'logic', access: 'none', controls: { hush: 0 } },
    HushTally: { type: 'indicator', access: 'read', controls: { state: 0 } },
  },
  snapshots: {
    Scenes: {
      1: { label: 'Walk-in',      set: { Presenter: [-60, 1], Audience1: [-60, 1], Audience2: [-60, 1], Remote: [-10, 1], Playback: [-12, 0] } },
      2: { label: 'Presentation', set: { Presenter: [0, 0],   Audience1: [-6, 1],  Audience2: [-6, 1],  Remote: [0, 0],   Playback: [-12, 1] } },
      3: { label: 'Q&A',          set: { Presenter: [-3, 0],  Audience1: [-4, 1],  Audience2: [-4, 1],  Remote: [0, 0],   Playback: [-12, 1] } },
      4: { label: 'Break',        set: { Presenter: [-60, 1], Audience1: [-60, 1], Audience2: [-60, 1], Remote: [-10, 1], Playback: [-14, 0] } },
    },
  },
};

let fault = false, faultCount = 0;

function audit(line) {
  const l = new Date().toISOString() + '  ' + line;
  fs.appendFileSync(AUDIT, l + '\n');
}

/* HUSH logic: a gate after every mic/remote channel. It never touches the operators' controls. */
function applyHushLogic() {
  design.components.HushTally.controls.state = design.components.HUSH.controls.hush === 1 ? 1 : 0;
}
const READ_ONLY = new Set(['live']);
function liveOf(comp) {
  const c = design.components[comp].controls;
  return (c.mute === 0 && !(MICS.includes(comp) && design.components.HUSH.controls.hush === 1)) ? 1 : 0;
}

function ctrlOut(comp, name) {
  const v = name === 'live' ? liveOf(comp) : design.components[comp].controls[name];
  const s = name === 'live' ? (v ? 'on air' : 'silent') : name === 'gain' ? (v <= -60 ? '-inf dB' : v.toFixed(1) + 'dB') : (name === 'mute' ? (v ? 'muted' : 'unmuted') : String(v));
  return { Name: name, Value: v, String: s };
}

const ERR = {
  logon: { code: 10, message: 'Logon required' },
  badLogon: { code: 10, message: 'Logon failed' },
  unknownComp: (n) => ({ code: 2, message: 'Unknown component name: ' + n }),
  unknownCtrl: (n) => ({ code: 3, message: 'Unknown control name: ' + n }),
  noAccess: (n) => ({ code: 8, message: 'Component not accessible to external control: ' + n }),
  readOnly: (n) => ({ code: 8, message: 'Control is read-only to external control: ' + n }),
  badValue: (n) => ({ code: 9, message: 'Value out of range: ' + n }),
  noMethod: (m) => ({ code: -32601, message: 'Method not found: ' + m }),
};

function handle(sess, msg) {
  const { method, params = {} } = msg;
  if (method === 'NoOp') return {};
  if (method === 'Logon') {
    const u = USERS[params.User];
    if (!u || u.pin !== String(params.Password)) { audit(`LOGON FAILED user=${params.User} ip=${sess.ip}`); throw ERR.badLogon; }
    sess.user = params.User; audit(`LOGON user=${sess.user} ip=${sess.ip}`); return true;
  }
  if (!sess.user) throw ERR.logon;
  switch (method) {
    case 'StatusGet':
      return { Platform: 'Mock Core (ShowGate test bench)', State: 'Active', DesignName: design.name, DesignCode: design.code,
        IsRedundant: false, IsEmulator: true, Status: { Code: 0, String: 'OK' } };
    case 'Component.GetComponents':
      return Object.entries(design.components).filter(([, c]) => c.access !== 'none')
        .map(([n, c]) => ({ Name: n, Type: c.type, Properties: [] }));
    case 'Component.Get': {
      const c = design.components[params.Name];
      if (!c) throw ERR.unknownComp(params.Name);
      if (c.access === 'none') { audit(`DENIED GET ${params.Name} user=${sess.user}`); throw ERR.noAccess(params.Name); }
      const names = Object.keys(c.controls).concat(c.type === 'gain' ? ['live'] : []);
      const ctrls = (params.Controls || names.map(n => ({ Name: n }))).map(({ Name }) => {
        if (!names.includes(Name)) throw ERR.unknownCtrl(Name); return ctrlOut(params.Name, Name); });
      return { Name: params.Name, Controls: ctrls };
    }
    case 'Component.Set': {
      const c = design.components[params.Name];
      if (!c) throw ERR.unknownComp(params.Name);
      if (c.access === 'none') { audit(`DENIED SET ${params.Name} user=${sess.user}`); throw ERR.noAccess(params.Name); }
      if (c.access === 'read') { audit(`DENIED SET ${params.Name} (read-only) user=${sess.user}`); throw ERR.readOnly(params.Name); }
      for (const { Name, Value } of params.Controls || []) {
        if (READ_ONLY.has(Name)) { audit(`DENIED SET ${params.Name}.${Name} (read-only) user=${sess.user}`); throw ERR.readOnly(params.Name + '.' + Name); }
        if (!(Name in c.controls)) throw ERR.unknownCtrl(Name);
        const v = Number(Value);
        if (Name === 'gain' && !(v >= -100 && v <= 20)) throw ERR.badValue(Name);
        if (Name === 'mute' && !(v === 0 || v === 1)) throw ERR.badValue(Name);
      }
      faultCount++;
      if (fault && faultCount % 2 === 0) { audit(`SET ${params.Name} user=${sess.user} -> LOST (fault injection)`); return true; }
      for (const { Name, Value } of params.Controls) c.controls[Name] = Number(Value);
      applyHushLogic();
      audit(`SET ${params.Name} ${params.Controls.map(x => x.Name + '=' + x.Value).join(' ')} user=${sess.user}`);
      return true;
    }
    case 'Snapshot.Load': {
      const bank = design.snapshots[params.Name];
      if (!bank) throw ERR.unknownComp(params.Name);
      const snap = bank[params.Bank];
      if (!snap) throw ERR.badValue('Bank');
      faultCount++;
      if (fault && faultCount % 2 === 0) { audit(`SNAPSHOT ${params.Name}#${params.Bank} user=${sess.user} -> LOST (fault injection)`); return true; }
      for (const [comp, [g, m]] of Object.entries(snap.set)) { design.components[comp].controls.gain = g; design.components[comp].controls.mute = m; }
      applyHushLogic();
      audit(`SNAPSHOT ${params.Name}#${params.Bank} (${snap.label}) user=${sess.user}`);
      return true;
    }
    default: throw ERR.noMethod(method);
  }
}

/* QRC server: null-terminated JSON-RPC 2.0, 60 s idle timeout like a real Core */
const server = net.createServer((sock) => {
  const sess = { ip: sock.remoteAddress, user: null };
  let buf = '';
  sock.setTimeout(60000, () => { audit(`TIMEOUT ip=${sess.ip} user=${sess.user}`); sock.end(); });
  sock.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const raw = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!raw.trim()) continue;
      let msg; try { msg = JSON.parse(raw); } catch { sock.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\0'); continue; }
      let out;
      try { out = { jsonrpc: '2.0', id: msg.id, result: handle(sess, msg) }; }
      catch (e) { out = { jsonrpc: '2.0', id: msg.id, error: e.code !== undefined ? e : { code: -32603, message: String(e) } }; }
      if (msg.id !== undefined) sock.write(JSON.stringify(out) + '\0');
    }
  });
  sock.on('error', () => {});
});

/* The physical HUSH button on the wall, and the bench's fault switch. Localhost only. */
const panel = http.createServer((req, res) => {
  const ok = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
  if (req.url === '/hush/on') { design.components.HUSH.controls.hush = 1; applyHushLogic(); audit('HUSH ON  (wall button, human)'); return ok({ hush: 1 }); }
  if (req.url === '/hush/off') { design.components.HUSH.controls.hush = 0; applyHushLogic(); audit('HUSH OFF (wall button held, human)'); return ok({ hush: 0 }); }
  if (req.url === '/fault/on') { fault = true; faultCount = 0; audit('BENCH: fault injection ON (every 2nd command lost)'); return ok({ fault }); }
  if (req.url === '/fault/off') { fault = false; audit('BENCH: fault injection OFF'); return ok({ fault }); }
  res.writeHead(404); res.end();
});

server.listen(QRC_PORT, '127.0.0.1', () => {
  panel.listen(PANEL_PORT, '127.0.0.1', () => {
    audit(`CORE UP design=${design.name} QRC=127.0.0.1:${QRC_PORT} panel=127.0.0.1:${PANEL_PORT}`);
    console.log(`Mock Core running: QRC on 127.0.0.1:${QRC_PORT}, HUSH wall button on 127.0.0.1:${PANEL_PORT}`);
  });
});
