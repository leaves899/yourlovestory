/**
 * Dev launcher that ensures ELECTRON_RUN_AS_NODE is unset.
 * Git Bash (MSYS2) automatically sets this variable, which causes
 * the Electron binary to run as plain Node.js instead of as Electron.
 */

const { spawn } = require('child_process');
const path = require('path');

// Clean environment - remove ELECTRON_RUN_AS_NODE
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Run electron-vite dev
const electronVitePath = path.join(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js');
const args = ['dev', ...process.argv.slice(2)];

console.log('Starting electron-vite dev (without ELECTRON_RUN_AS_NODE)...');

const child = spawn(process.execPath, [electronVitePath, ...args], {
  env,
  stdio: 'inherit',
  cwd: path.join(__dirname, '..')
});

child.on('close', (code) => {
  process.exit(code || 0);
});
