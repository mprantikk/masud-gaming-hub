/**
 * Builds the GitHub Pages site: docs/index.html (one file).
 *   src/app.html          the page and the app (its <!-- @ENGINE --> line is replaced)
 *   node_modules/peerjs   peer-to-peer connections (inlined, so the page needs no CDN)
 *   src/platform.js + src/engine/*.js   the game engine, wrapped in one function scope -> window.HubEngine
 *   src/net.js            routes each call to this device or to the match host -> window.HubNet
 * Usage: node tools/build.js         (writes docs/index.html)
 *        node tools/build.js --check (fails if docs/index.html is out of date)
 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');

function build() {
  const engineSrc = rd('src/engine/core.js') + '\n' + rd('src/engine/games.js');
  const names = (engineSrc.match(/^function ([A-Za-z0-9]+)\(/gm) || []).map(x => x.slice(9, -1)).filter(n => !/_$/.test(n));
  const engine = 'window.HubEngine = (function () {\n' + rd('src/platform.js') + '\n' + engineSrc +
    '\nCONFIG.HOST_TAG = HubStore.hostTag;\nreturn { api: { ' + names.map(n => n + ': ' + n).join(', ') + ' }, CONFIG: CONFIG, save: HubStore.save, rid: HubStore.rid };\n})();\n';
  const peer = rd('node_modules/peerjs/dist/peerjs.min.js').replace(/\/\/# sourceMappingURL=.*$/m, '');
  const block = [
    '<script>/* PeerJS 1.5.4, MIT license, https://github.com/peers/peerjs */\n' + peer + '\n</script>',
    '<script>\n' + engine + '</script>',
    '<script>\n' + rd('src/net.js') + '</script>'
  ].join('\n  ');
  const app = rd('src/app.html');
  if (app.indexOf('<!-- @ENGINE -->') === -1) throw new Error('src/app.html has no <!-- @ENGINE --> line');
  for (const s of [engine, rd('src/net.js'), peer]) if (/<\/script/i.test(s)) throw new Error('A script contains </script>');
  return app.replace('<!-- @ENGINE -->', () => block);
}

if (require.main === module) {
  const out = path.join(root, 'docs/index.html'), html = build();
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (cur !== html) { console.error('docs/index.html is out of date: run  npm run build'); process.exit(1); }
    console.log('docs/index.html is up to date');
  } else { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, html); console.log('wrote docs/index.html', html.length, 'chars'); }
}
module.exports = { build };
