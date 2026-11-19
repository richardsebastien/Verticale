# Verticale — jeu de gestion de tour (v4)

Jeu HTML5 mobile (tactile) dans l'esprit de Project Highrise. Publié comme artefact ; moteur et rendu en JavaScript pur, sans bibliothèque.

## Boucle de jeu
- Construire des pièces sur une tour en coupe (grille 40 colonnes, terrain extensible par 4 colonnes).
- Les gens marchent sur des cases contiguës, prennent escaliers ou ascenseurs (recherche de chemin, files d'attente, cabines à contrôle collectif).
- Loyers à minuit, ventes des commerces en direct, charges (entretien, cabines, concierge), prêt bancaire.
- Satisfaction par pièce : transport (durée des trajets), bruit, saleté, vue, services. Elle règle le loyer et les départs.
- Rang ★1 à ★5 selon habitants et satisfaction : débloque bâtiments, hauteur (R+6 à R+45) et sous-sols.
- 33 objectifs avec récompenses (l'onglet n'affiche que les 3 derniers accomplis), conseils contextuels, bilan sur 14 jours.

## Sauvegarde
- Automatique dans le navigateur (localStorage, clé `verticale-save-v1`) : à chaque minuit de jeu, 1,5 s après une construction, et quand la page passe en arrière-plan. Les personnages ne sont pas sauvegardés : ils sont recréés d'après les horaires au chargement.
- Menu, onglet Sauvegarde : sauvegarde manuelle (avec heure de la dernière), export en code texte à copier, import d'un code. Si le navigateur refuse d'enregistrer (navigation privée, stockage bloqué), un avertissement s'affiche et l'export reste possible.
- Format du code : `VERTICALE1.<z|r>.<base64url>.<somme FNV-1a>`. `z` = JSON compressé (deflate-raw via CompressionStream), `r` = JSON brut si le navigateur ne compresse pas. Décompression plafonnée à 3 Mo.
- Import sûr : somme de contrôle, puis `Engine.validate` (version, nombres finis, types connus, pièces dans le terrain, sans chevauchement, hall présent, ids uniques). L'utilisateur voit un résumé et confirme ; en cas d'échec la partie en cours est restaurée.
- Cloud (compte Claude, pas Google : la page publiée ne peut joindre aucun serveur externe, donc pas de connexion Google ni d'API Drive) : capacités déclarées `db` + `user`. Le jeu écrit le code d'export dans `data/users/<id>/save`, espace privé de chaque spectateur. Boutons Envoyer / Récupérer, jamais de synchro automatique ; garde-fou si le cloud est plus avancé (jour) ; récupération = même confirmation que l'import. Hors claude.ai ou sans identité, la section est désactivée et le reste fonctionne.
- Une APK (WebView) n'aurait pas accès à `db` : seuls la sauvegarde locale et l'export par code y subsisteraient. L'utilisateur a choisi de rester sur la page web. Aucun SDK Android ni réseau dans l'environnement de session, donc pas de compilation possible ici.
- Tests : `test/ui6.js` (faux `claude.use` en mémoire : envoi, récupération, garde-fou, quota, droits, document altéré, délai dépassé, capacité absente), `test/t4.js` (aller-retour moteur, 12 cas altérés), `test/ui5.js` (export, copie, import, code tronqué ou modifié, stockage bloqué, sans CompressionStream, bombe de décompression).

## Bâtiments (34 types, 6 catégories dans la palette)
- Base : Hall, Ascenseur (1 à 4 cabines, 3 niveaux), Escalier.
- Logement : Studio, Appartement, Loft (R+2 mini, rang 3), Penthouse.
- Travail : Bureau, Coworking, Open space, Banque (taux de prêt 0,3 % au lieu de 0,4 %), Clinique, Crèche.
- Commerces : Boutique, Boulangerie, Café, Coiffeur, Supérette, Pharmacie, Restaurant.
- Loisirs : Salle de sport, Cinéma, Bar-lounge (R+4 mini), Club (sous-sol, 21 h–5 h), Observatoire (R+25, rang 5).
- Services (toujours « occupés », sans loyer, effet global) : Conciergerie, Local déchets (saleté −20 %), Poste de sécurité (anti-vol), Local technique (moins de pannes, ascenseurs −20 % d'entretien), Jardin (bruit −6 autour), Parking, Panneaux solaires (+75 €/jour, sans accès nécessaire), Station de métro (+30 % de clients), Héliport (R+30, penthouses +10 %).

## Données du moteur (TYPES)
Champs : cat, cap, hours [ouverture, fermeture ; >1440 = après minuit], days 'week', rent, price, dur, flow, prof (day|morn|eve|night), tgt (calculé automatiquement : 0,85 × flux × somme du profil sur les heures d'ouverture, ×5/7 en semaine ; 3 mini ; boutique et restaurant gardent 10), tags (any|lunch|shop|leisure), svc (commodités), noise (négatif = jardin), wk (office|shop|resto), base/nk/sk/vk (satisfaction), service, fx (sec|tech|trash|solar|metro|heli|bank), income, ab (étiquette courte).
**Règle d'étalonnage** : ne jamais fixer `tgt` à la main pour un nouveau lieu ouvert au public, sinon sa satisfaction dérive (ratio visites attendues / cible mesuré entre 0,54 et 1,4 avant le calcul auto).

## Fonctions ajoutées (v4)
- Commodités : un logement ou un bureau gagne de la satisfaction selon les lieux joignables (café, gym, crèche, banque, etc.).
- Rénovation d'une pièce louée (niveaux 0 à 2, coût = moitié du prix × niveau, +4 de satisfaction et +12 % de loyer par niveau) et politique de loyer (bas 0,82 / normal / élevé 1,25).
- Événements quotidiens à 8 h : panne d'ascenseur, fuite, vol (déjoué si un poste de sécurité existe), inspection, fête, article de presse, tournage. Journal des 12 derniers dans l'onglet Tour.
- Onglet Tour : occupation, variété (n / 34), attente moyenne, tableau par catégorie, effets actifs, journal. Bilan : ligne « Autres revenus » (panneaux solaires). Les gains ponctuels (tournage, subvention d'inspection) vont directement en trésorerie et ne figurent pas dans le bilan du jour.
- Sauvegarde : champs `lvl` (0–2) et `pol` (−1..1) validés ; les anciennes sauvegardes se chargent (`test/t7.js`).

## Tests
- Moteur sous Node : t4 (sauvegarde), t5 (34 types, 8 jours, événements, rénovation), t6 (tour réaliste de 10 étages), t7 (ancienne sauvegarde).
- Interface Playwright (390×800, réseau coupé) : ui1–ui6 (jeu de base, gestes, sauvegarde, cloud), ui7 (catégories, fiches pièce, rénovation et loyer, onglet Tour), ui8/ui9 (galerie des dessins de jour et de nuit), ui10 (petit téléphone en sombre, bureau). Non testé sur un vrai téléphone Android.

## Fichiers (hors projet : dossier de travail de la session)
- src/engine.js : simulation (testée sous Node sans DOM)
- src/ui.js : rendu canvas, gestes, panneaux
- src/index.template.html : styles et structure

## Pistes pour la suite
- Paquet APK (Capacitor ou TWA) pour une installation hors navigateur.
- Hôtel, étages d'événements saisonniers, parking plus détaillé, sons d'ambiance.
- Équilibrage du rythme des premiers jours selon les retours de jeu.
