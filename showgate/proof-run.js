#!/usr/bin/env node
/*
 * Proof run: a scripted show through a real MCP client -> ShowGate -> QRC -> the mock Core.
 * Every claim is checked against the Core's own read-back. Writes proof-run.txt.
 */
'use strict';
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { QrcClient } = require('./qrc.js');

const D = __dirname, OUT = path.join(D, 'proof-run.txt');
for (const f of ['core-audit.log', 'showgate.log', 'showgate-mode.json', 'proof-run.txt']) try { fs.unlinkSync(path.join(D, f)); } catch {}
const lines = [];
const say = (s = '') => { console.log(s); lines.push(s); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const human = (m) => { execFileSync('node', [path.join(D, 'mode.js'), m]); say(`  HUMAN  switch -> ${m.toUpperCase()}`); };
const wall = (p) => new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port: 1711, path: p, method: 'POST' }, (x) => { x.resume(); x.on('end', res); }); r.on('error', rej); r.end(); });
let pass = 0, fail = 0;
const check = (ok, what) => { ok ? pass++ : fail++; say(`  ${ok ? 'PASS' : 'FAIL'}   ${what}`); };
const parse = (r) => { try { return JSON.parse(r.content[0].text); } catch { return { raw: r.content && r.content[0] && r.content[0].text }; } };

(async () => {
  const core = spawn('node', [path.join(D, 'mock-core.js')], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((r) => core.stdout.once('data', r));
  human('on');
  const client = new Client({ name: 'proof-run', version: '1.0.0' });
  await client.connect(new StdioClientTransport({ command: 'node', args: [path.join(D, 'showgate.js')] }));
  const ai = async (name, args = {}) => { try { const r = await client.callTool({ name, arguments: args }); return { ...parse(r), isError: !!r.isError }; } catch (e) { return { protocolError: e.message }; } };

  say('SHOWGATE PROOF RUN · ' + new Date().toISOString());
  say('Claude (MCP client) -> ShowGate -> QRC 127.0.0.1:1710 -> mock Q-SYS Core "HallA"\n');

  say('1. What Claude is offered');
  const tools = (await client.listTools()).tools.map((t) => t.name);
  say('  tools: ' + tools.join(', '));
  check(!tools.some((t) => /hush/i.test(t)), 'No HUSH tool exists for Claude');

  say('\n2. Claude reads the room (switch ON)');
  const r0 = await ai('read_room');
  say('  ' + JSON.stringify(r0.channels));
  check(r0.channels && r0.hush === false, 'Read-back comes from the Core');

  say('\n3. Claude recalls Q&A');
  const r1 = await ai('recall_scene', { scene: 'qa' });
  say(`  verified=${r1.verified}  presenter=${JSON.stringify(r1.readback_from_core && r1.readback_from_core.presenter)}`);
  check(r1.verified === true, 'Scene confirmed by the Core, channel by channel');

  say('\n4. Claude opens audience mic 2');
  const r2 = await ai('set_channel', { channel: 'audience2', mute: false });
  say(`  verified=${r2.verified}  core says ${JSON.stringify(r2.readback_from_core)}`);
  check(r2.verified === true, 'Mic 2 open, confirmed by the Core');

  say('\n5. Claude tries to reach HUSH through ShowGate');
  const r3 = await ai('set_channel', { channel: 'hush', mute: true });
  say('  ' + (r3.protocolError || r3.reason || JSON.stringify(r3)).slice(0, 140));
  check(!!(r3.protocolError || r3.isError), 'ShowGate has no way to name HUSH: rejected');

  say('\n6. Claude goes around ShowGate, straight to the Core with its own login');
  const raw = new QrcClient({ user: 'claude-mc', pin: '0001' }); await raw.connect();
  let e1 = null; try { await raw.call('Component.Set', { Name: 'HUSH', Controls: [{ Name: 'hush', Value: 0 }] }); } catch (e) { e1 = e; }
  say('  Core: ' + (e1 ? `error ${e1.code} · ${e1.message}` : 'ACCEPTED'));
  check(!!e1, 'The Core itself refuses external access to the HUSH logic');
  let e2 = null; try { await raw.call('Component.Set', { Name: 'HushTally', Controls: [{ Name: 'state', Value: 0 }] }); } catch (e) { e2 = e; }
  say('  Core: ' + (e2 ? `error ${e2.code} · ${e2.message}` : 'ACCEPTED'));
  check(!!e2, 'HUSH indicator is look-only from outside');

  say('\n7. A human presses the HUSH button on the wall');
  await wall('/hush/on'); say('  HUMAN  HUSH ON');
  const r4 = await ai('read_room');
  const onAir = r4.channels ? Object.entries(r4.channels).filter(([, v]) => v.on_air).map(([k]) => k) : ['?'];
  say(`  Claude sees hush=${r4.hush}; channels still on air: ${onAir.join(', ') || 'none'}`);
  check(r4.hush === true && !r4.channels.presenter.on_air && !r4.channels.audience2.on_air && !r4.channels.remote.on_air, 'Every mic and the remote feed cut by the Core\'s own logic');
  const r5 = await ai('set_channel', { channel: 'presenter', mute: false });
  say('  ' + (r5.reason || JSON.stringify(r5)).slice(0, 140));
  check(r5.refused === true, 'ShowGate refuses audio while HUSH is on');
  await raw.call('Component.Set', { Name: 'Audience1', Controls: [{ Name: 'mute', Value: 0 }] });
  const rb = await raw.call('Component.Get', { Name: 'Audience1', Controls: [{ Name: 'live' }] });
  say(`  Raw QRC unmute of mic 1 around ShowGate -> Core says mic 1 is ${rb.Controls[0].String}`);
  check(rb.Controls[0].Value === 0, 'Even a raw unmute stays silent behind the HUSH gate');
  let e3 = null; try { await raw.call('Component.Set', { Name: 'Presenter', Controls: [{ Name: 'live', Value: 1 }] }); } catch (e) { e3 = e; }
  check(!!e3, 'The on-air state itself cannot be written from outside');
  await raw.call('Component.Set', { Name: 'Audience1', Controls: [{ Name: 'mute', Value: 1 }] });
  await wall('/hush/off'); say('  HUMAN  holds to release HUSH');
  const r4b = await ai('read_room');
  say(`  After release: presenter on air=${r4b.channels.presenter.on_air}, mic 2 on air=${r4b.channels.audience2.on_air}`);
  check(r4b.hush === false && r4b.channels.presenter.on_air && r4b.channels.audience2.on_air, 'Releasing HUSH restores exactly what the operators had');
  raw.close();

  say('\n8. The human switches the AI to WATCH');
  human('watch');
  const r6 = await ai('read_room'); check(!!r6.channels, 'WATCH: Claude can still look');
  const r7 = await ai('recall_scene', { scene: 'brk' }); say('  ' + (r7.reason || '').slice(0, 120));
  check(r7.refused === true, 'WATCH: Claude cannot act');

  say('\n9. The human switches the AI OFF');
  human('off');
  const r8 = await ai('read_room'); say('  ' + (r8.reason || '').slice(0, 120));
  check(r8.refused === true, 'OFF: Claude cannot even look');

  say('\n10. Back ON, and the network starts losing commands (every 2nd one)');
  human('on');
  await wall('/fault/on');
  const r9 = await ai('set_channel', { channel: 'remote', level_db: -5 });
  say(`  remote -> -5 dB: verified=${r9.verified}, core says ${r9.readback_from_core && r9.readback_from_core.level_db} dB`);
  const r10 = await ai('set_channel', { channel: 'remote', level_db: -3 });
  say(`  remote -> -3 dB: verified=${r10.verified}, core says ${r10.readback_from_core && r10.readback_from_core.level_db} dB`);
  check(r9.verified === true && r10.verified === false, 'A lost command is caught by the read-back, never reported as done');
  await wall('/fault/off');

  say(`\nRESULT: ${pass} passed, ${fail} failed`);
  say('\n--- Core audit log (written by the Core, not by Claude) ---');
  say(fs.readFileSync(path.join(D, 'core-audit.log'), 'utf8').trim());
  say('\n--- ShowGate log ---');
  say(fs.readFileSync(path.join(D, 'showgate.log'), 'utf8').trim());
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
  await client.close(); core.kill();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
