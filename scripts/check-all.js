const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function collect(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.cache'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...collect(full));
    else if (entry.isFile() && full.endsWith('.js')) result.push(full);
  }
  return result;
}

const files = collect(process.cwd());
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    process.stderr.write(check.stderr || `Syntax error: ${file}\n`);
    process.exit(check.status || 1);
  }
}
console.log(`Syntax OK: ${files.length} JavaScript files checked.`);
