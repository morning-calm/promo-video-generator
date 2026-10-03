#!/usr/bin/env node
/* new-project.js - copy the starter into projects/<name> (a working 6 s video).   node tools/new-project.js my-launch */
const fs = require('fs'), path = require('path');
if (process.argv.length !== 3) { console.log('usage: node tools/new-project.js <name>'); process.exit(2); }
const NAME = process.argv[2], REPO = path.join(__dirname, '..'), DEST = path.join(REPO, 'projects', NAME);
if (fs.existsSync(DEST)) { console.log(`${DEST} already exists`); process.exit(1); }
fs.cpSync(path.join(REPO, 'templates', 'starter'), DEST, { recursive: true });
console.log(`Created projects/${NAME}  -  preview: node tools/render.js projects/${NAME} --stills 1,3`);
