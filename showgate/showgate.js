#!/usr/bin/env node
/*
 * ShowGate — the room connector between Claude and a Q-SYS Core (over QRC).
 * Concept by Ovi · built with Claude.
 *
 * The rules live here, not in the AI:
 *   1. The human holds the switch. OFF: no tools at all. WATCH: Claude may look, never act. ON: Claude may act.
 *      The switch is a file only a human writes (node mode.js on|watch|off). There is no tool to change it.
 *   2. Allowlist. Claude can reach five channels and four scenes. HUSH is not a tool, and the Core
 *      itself refuses external access to the HUSH logic, so it is locked twice.
 *   3. Nothing counts as done without a read-back from the Core. Every move is set, then read back,
 *      and reported verified true/false. Claude is never its own witness.
 *   4. Every call is written to showgate.log (who, what, read-back).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { QrcClient } = require('./qrc.js');

const MODE_FILE = process.env.SHOWGATE_MODE || path.join(__dirname, 'showgate-mode.json');
const LOG = process.env.SHOWGATE_LOG || path.join(__dirname, 'showgate.log');
const CORE = { host: process.env.QRC_HOST || '127.0.0.1', port: +process.env.QRC_PORT || 1710,
  user: process.env.QRC_USER || 'claude-mc', pin: process.env.QRC_PIN || '0001' };

const CHANNELS = { presenter: 'Presenter', audience1: 'Audience1', audience2: 'Audience2', remote: 'Remote', playback: 'Playback' };
const SCENES = {
  walkin:       { bank: 1, label: 'Walk-in',      expect: { Presenter: [-60, 1], Audience1: [-60, 1], Audience2: [-60, 1], Remote: [-10, 1], Playback: [-12, 0] } },
  presentation: { bank: 2, label: 'Presentation', expect: { Presenter: [0, 0],   Audience1: [-6, 1],  Audience2: [-6, 1],  Remote: [0, 0],   Playback: [-12, 1] } },
  qa:           { bank: 3, label: 'Q&A',          expect: { Presenter: [-3, 0],  Audience1: [-4, 1],  Audience2: [-4, 1],  Remote: [0, 0],   Playback: [-12, 1] } },
  brk:          { bank: 4, label: 'Break',        expect: { Presenter: [-60, 1], Audience1: [-60, 1], Audience2: [-60, 1], Remote: [-10, 1], Playback: [-14, 0] } },
};

function log(line) { fs.appendFileSync(LOG, new Date().toISOString() + '  ' + line + '\n'); }
function mode() {
  try { const m = JSON.parse(fs.readFileSync(MODE_FILE, 'utf8')).mode; return ['off', 'watch', 'on'].includes(m) ? m : 'off'; }
  catch { return 'off'; }   /* no switch file means OFF: the safe default */
}
class Refused extends Error {}
function need(level) {
  const m = mode();
  if (m === 'off') throw new Refused('The crew switched the AI OFF. ShowGate gives Claude no access at all. Only a human can switch it back on.');
  if (level === 'act' && m !== 'on') throw new Refused('The crew has the AI on WATCH. Claude may look but not act. Only a human can switch it to ON.');
}

let core = null;
async function qrc() {
  if (core && core.sock) return core;
  core = new QrcClient(CORE); await core.connect(); return core;
}
async function channelState(c, comp) {
  const r = await c.call('Component.Get', { Name: comp, Controls: [{ Name: 'gain' }, { Name: 'mute' }, { Name: 'live' }] });
  const v = Object.fromEntries(r.Controls.map((x) => [x.Name, x.Value]));
  return { level_db: v.gain, muted: v.mute === 1, on_air: v.live === 1 };
}
async function hushOn(c) {
  const r = await c.call('Component.Get', { Name: 'HushTally', Controls: [{ Name: 'state' }] });
  return r.Controls[0].Value === 1;
}
async function room(c) {
  const out = {};
  for (const [k, comp] of Object.entries(CHANNELS)) out[k] = await channelState(c, comp);
  return { channels: out, hush: await hushOn(c) };
}
const text = (o, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 2) }], isError });
async function run(tool, args, fn) {
  try { const r = await fn(); log(`${tool} ${JSON.stringify(args)} -> ${JSON.stringify(r)}`); return text(r, r.verified === false); }
  catch (e) {
    const why = e instanceof Refused ? 'REFUSED by ShowGate: ' + e.message : 'Core said: ' + e.message;
    log(`${tool} ${JSON.stringify(args)} -> ${why}`); return text({ refused: true, reason: why }, true);
  }
}

const server = new McpServer({ name: 'showgate', version: '0.1.0' }, {
  instructions: 'ShowGate connects you to the room\'s Q-SYS Core under the crew\'s rules. A human holds the AI switch (OFF, WATCH, ON); you cannot change it. HUSH is human-only and not available to you. Every action returns verified true/false from the Core\'s own read-back: never report success unless verified is true, and say plainly what did not take.',
});

server.registerTool('read_room', {
  title: 'Read the room',
  description: 'Read every channel (level_db, muted, on_air) and whether HUSH is engaged, straight from the Core. on_air is what the room actually hears: false whenever HUSH is on. Allowed in WATCH and ON.',
  inputSchema: {},
}, async () => run('read_room', {}, async () => { need('look'); return await room(await qrc()); }));

server.registerTool('set_channel', {
  title: 'Set one channel',
  description: 'Change one channel: mute (true/false) and/or level_db (-60 to +10). The Core is read back afterwards and verified is reported. Refused while HUSH is engaged, and unless the AI switch is ON.',
  inputSchema: { channel: z.enum(Object.keys(CHANNELS)), mute: z.boolean().optional(), level_db: z.number().min(-60).max(10).optional() },
}, async (a) => run('set_channel', a, async () => {
  need('act');
  if (a.mute === undefined && a.level_db === undefined) throw new Refused('Give mute and/or level_db.');
  const c = await qrc(), comp = CHANNELS[a.channel];
  if (await hushOn(c)) throw new Refused('HUSH is engaged by a human. Audio is locked until a human releases it.');
  const ctrls = [];
  if (a.level_db !== undefined) ctrls.push({ Name: 'gain', Value: Math.round(a.level_db) });
  if (a.mute !== undefined) ctrls.push({ Name: 'mute', Value: a.mute ? 1 : 0 });
  await c.call('Component.Set', { Name: comp, Controls: ctrls });
  const rb = await channelState(c, comp);
  const ok = (a.level_db === undefined || rb.level_db === Math.round(a.level_db)) && (a.mute === undefined || rb.muted === a.mute);
  return { channel: a.channel, sent: { level_db: a.level_db, mute: a.mute }, readback_from_core: rb, verified: ok };
}));

server.registerTool('recall_scene', {
  title: 'Recall a scene',
  description: 'Recall a snapshot scene on the Core: walkin, presentation, qa, brk. Every channel is read back and compared with the scene. Refused while HUSH is engaged, and unless the AI switch is ON.',
  inputSchema: { scene: z.enum(Object.keys(SCENES)) },
}, async (a) => run('recall_scene', a, async () => {
  need('act');
  const c = await qrc(), s = SCENES[a.scene];
  if (await hushOn(c)) throw new Refused('HUSH is engaged by a human. Scenes wait until a human releases it.');
  await c.call('Snapshot.Load', { Name: 'Scenes', Bank: s.bank });
  const rb = await room(c);
  const wrong = Object.entries(s.expect).filter(([comp, [g, m]]) => {
    const k = Object.keys(CHANNELS).find((x) => CHANNELS[x] === comp); const st = rb.channels[k];
    return st.level_db !== g || st.muted !== (m === 1); }).map(([comp]) => comp);
  return { scene: s.label, readback_from_core: rb.channels, verified: wrong.length === 0, did_not_take: wrong };
}));

(async () => { await server.connect(new StdioServerTransport()); log(`SHOWGATE UP core=${CORE.host}:${CORE.port} user=${CORE.user} mode=${mode()}`); })();
