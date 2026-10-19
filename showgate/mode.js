#!/usr/bin/env node
/* The human's switch. Only a person at the desk runs this: node mode.js on | watch | off */
'use strict';
const fs = require('fs');
const path = require('path');
const FILE = process.env.SHOWGATE_MODE || path.join(__dirname, 'showgate-mode.json');
const m = process.argv[2];
if (!['on', 'watch', 'off'].includes(m)) {
  let cur = 'off'; try { cur = JSON.parse(fs.readFileSync(FILE, 'utf8')).mode; } catch {}
  console.log('AI switch is ' + cur.toUpperCase() + '.  Use: node mode.js on | watch | off'); process.exit(m ? 1 : 0);
}
fs.writeFileSync(FILE, JSON.stringify({ mode: m, by: process.env.USER || 'human', at: new Date().toISOString() }, null, 2));
console.log('AI switch set to ' + m.toUpperCase() + '.');
