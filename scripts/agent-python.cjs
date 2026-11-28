const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '..');
const windows = process.platform === 'win32';
const venvPython = resolve(root, '.venv', windows ? 'Scripts/python.exe' : 'bin/python');
const python = existsSync(venvPython) ? venvPython : windows ? 'python' : 'python3';
const args = process.argv.slice(2);
const cwdFlag = args.indexOf('--cwd');
const cwd = cwdFlag >= 0 && args[cwdFlag + 1] ? resolve(root, args[cwdFlag + 1]) : root;
if (cwdFlag >= 0) args.splice(cwdFlag, 2);
const result = spawnSync(python, args, {
  cwd,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Unable to run Python (${python}): ${result.error.message}`);
}
process.exit(result.status ?? 1);
