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
  // GitHub Pages : icônes en fichiers + manifeste (Chrome Android ignore les icônes en data URI pour l'écran d'accueil).
  const icons = '<link rel="icon" type="image/svg+xml" href="favicon.svg"><link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">' +
    '<link rel="apple-touch-icon" href="apple-touch-icon.png"><link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#1f4fd8">' +
    '<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Verticale">';
  const pg = page.replace(/<link rel="icon"[^>]*>\n?/, '').replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '');
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync('docs/index.html', head.replace('</head>', icons + '</head>') + pg + '</body></html>');
  console.log('docs/index.html', page.length, 'octets');
} else {
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/index.html', page);
  console.log('dist/index.html', page.length, 'octets');
}
