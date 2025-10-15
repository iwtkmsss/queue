const fs = require('fs');
const path = require('path');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const settingsDir = path.join(__dirname, '..', 'settings');
const files = {
  extra_actions: path.join(settingsDir, 'extra_actions.json'),
  application_types: path.join(settingsDir, 'application_types.json'),
};

let cache = null;
function loadOptions() {
  cache = {
    extra_actions: readJson(files.extra_actions),
    application_types: readJson(files.application_types),
  };
  return cache;
}

function getOptions() {
  if (!cache) return loadOptions();
  return cache;
}

// опційно: гаряче оновлення при зміні файлів у проді відключити
Object.values(files).forEach((f) => {
  fs.watchFile(f, { interval: 2000 }, () => {
    try { loadOptions(); console.log('[optionsService] reloaded'); } catch (e) { console.error(e); }
  });
});

module.exports = { getOptions };
