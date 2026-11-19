// Assemble moteur + interface + gabarit en une seule page.
//   node build.js              -> dist/index.html (version de test, expose window.__verticale)
//   PROD=1 node build.js       -> dist/index.html (sans le crochet de test)
//   PAGES=1 node build.js      -> docs/index.html, page autonome pour GitHub Pages
const fs = require('fs');
const t = fs.readFileSync('src/index.template.html', 'utf8');
const e = fs.readFileSync('src/engine.js', 'utf8');
const u = fs.readFileSync('src/ui.js', 'utf8');
const prod = process.env.PROD || process.env.PAGES;
const u2 = prod ? u.replace(/^window\.__verticale = .*$/m, '') : u;
const page = t.replace('/*@@ENGINE@@*/', () => e).replace('/*@@UI@@*/', () => u2);
if (process.env.PAGES) {
  const head = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/index.html', head + page + '</body></html>');
  console.log('docs/index.html', page.length, 'octets');
} else {
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/index.html', page);
  console.log('dist/index.html', page.length, 'octets');
}
