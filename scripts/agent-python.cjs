const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '..');
const windows = process.platform === 'win32';
const venvPython = resolve(root, '.venv', windows ? 'Scripts/python.exe' : 'bin/python');
const python = existsSync(venvPython) ? venvPython : windows ? 'python' : 'python3';
const result = spawnSync(python, process.argv.slice(2), {
  cwd: root,
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Unable to run Python (${python}): ${result.error.message}`);
}
process.exit(result.status ?? 1);
