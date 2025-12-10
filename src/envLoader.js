const fs = require('fs');
const path = require('path');

const ENV_FILE_CANDIDATES = ['sw-menu.env', '.env.sw-menu', '.env', '.env.local'];

const parseEnvContent = (content) => {
  const entries = {};
  if (!content) {
    return entries;
  }
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }
    const key = line.slice(0, eqIndex).trim();
    if (!key) {
      continue;
    }
    let value = line.slice(eqIndex + 1);
    const isQuoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
};

const applyEnvEntries = (entries) => {
  if (!entries) {
    return [];
  }
  const applied = [];
  for (const [key, value] of Object.entries(entries)) {
    if (typeof process.env[key] === 'undefined') {
      process.env[key] = value;
      applied.push(key);
    }
  }
  return applied;
};

const loadSwMenuEnv = ({ baseDir } = {}) => {
  const searchRoots = [baseDir, process.cwd(), path.resolve(__dirname, '..'), path.resolve(__dirname, '..', '..')].filter(
    Boolean,
  );
  const visited = new Set();
  for (const root of searchRoots) {
    for (const fileName of ENV_FILE_CANDIDATES) {
      const candidate = path.isAbsolute(fileName) ? fileName : path.join(root, fileName);
      if (visited.has(candidate)) {
        continue;
      }
      visited.add(candidate);
      if (!fs.existsSync(candidate)) {
        continue;
      }
      try {
        const content = fs.readFileSync(candidate, 'utf8');
        const entries = parseEnvContent(content);
        const appliedKeys = applyEnvEntries(entries);
        return { path: candidate, appliedKeys };
      } catch (error) {
        // 続行して次の候補を試す
        continue;
      }
    }
  }
  return null;
};

module.exports = {
  loadSwMenuEnv,
};
