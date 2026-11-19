# Verticale

Jeu de gestion de tour en coupe pour mobile (tactile), dans l'esprit de *Project Highrise*. HTML5 pur : moteur et rendu en JavaScript sans bibliothèque, un seul fichier.

Construisez une tour étage par étage, reliez-la par escaliers et ascenseurs, louez des logements, bureaux et commerces, gardez vos habitants satisfaits et montez en rang de ★1 à ★5.

## Jouer

Page autonome : [`docs/index.html`](docs/index.html). Pour l'héberger avec GitHub Pages : **Settings → Pages → Deploy from a branch → `main` / `/docs`**. Le jeu s'ouvre alors dans le navigateur du téléphone (ce n'est pas une APK).

## Ce que contient le jeu

- 34 types de pièces en 6 catégories : Base, Logement, Travail, Commerces, Loisirs, Services.
- Personnages qui marchent, prennent escaliers et ascenseurs (recherche de chemin, files d'attente, cabines à contrôle collectif).
- Satisfaction par pièce (transport, bruit, saleté, vue, services, commodités), rénovation, politique de loyer.
- Services à effet global (sécurité, déchets, local technique, jardin, métro, héliport, panneaux solaires), événements quotidiens, 33 objectifs.
- Sauvegarde automatique dans le navigateur, sauvegarde manuelle, export et import par code texte.

Détails de conception : [`NOTES.md`](NOTES.md).

## Sauvegarde dans le cloud

La synchronisation cloud (onglet Sauvegarde) n'existe que lorsque la page est ouverte comme artefact dans un compte claude.ai. Sur GitHub Pages elle est désactivée avec un message ; la sauvegarde locale et l'export par code fonctionnent partout.

## Développer

Aucune dépendance pour construire le jeu :

```sh
node build.js            # dist/index.html, avec le crochet de test window.__verticale
PROD=1 node build.js     # dist/index.html, sans le crochet
PAGES=1 node build.js    # docs/index.html, page autonome pour GitHub Pages
```

Fichiers :

- `src/engine.js` : simulation, testable sous Node sans DOM.
- `src/ui.js` : rendu canvas, gestes, panneaux.
- `src/index.template.html` : structure et styles.

### Tests

Moteur (Node seul) : `node test/t4.js`, `t5.js`, `t6.js`, `t7.js`. Chaque script affiche ses résultats ; il n'y a pas de lanceur global.

Interface (Playwright, Chromium) : `npm i playwright`, puis `node build.js && node test/wrap.js` et `node test/ui1.js` à `ui10.js`. Les tests tournent à 390×800 avec le réseau coupé. Les captures sont écrites dans `test/` (ignorées par git).

Le jeu n'a pas été essayé sur un vrai téléphone Android.
