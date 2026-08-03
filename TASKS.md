# Suivi des tâches — lmu-telemetry

> Tenu à jour en continu (pas juste en fin de session) pour que le contexte
> survive même si on change de conversation Claude Code. Le détail complet de
> chaque changement reste dans `git log` — ce fichier sert à s'orienter vite,
> pas à dupliquer les messages de commit.

## En cours / à faire

- [ ] **Pivot produit (2026-08-03)** : le projet devient un hub communautaire
      LMU — tracking des sessions/pilotes, import télémétrie (base actuelle),
      bot Discord qui publie les résultats de course d'un joueur, etc.
      Hébergement dédié + nom de domaine prévus. Implique un chantier
      réglementaire (RGPD, mentions légales, copyright/marques) — liste
      préparée et débrief à faire avec Quentin, voir mémoire Claude
      `project_hub_pivot`. Rien d'implémenté encore côté code pour ce point.
- [ ] **Refonte "Channels shown"** (sidebar TelemetryViewer, sélection/
      groupement de canaux) : Quentin veut changer tout ce système, pas juste
      le look des checkboxes — signalé le 2026-08-03, à préciser avec lui
      avant de retoucher quoi que ce soit ici (volontairement pas touché
      pendant le nettoyage des checkboxes système du 2026-08-03, voir
      l'entrée "Terminé" du même jour).

## Terminé

### 2026-08-03 — Fix police mono + largeur du badge label/valeurs sur le graphe
- `.lane-label` (le badge label + valeurs + delta affiché directement sur
  chaque graphe, distinct de la légende de la sidebar déjà corrigée) n'avait
  pas la police de données — oublié lors du passage précédent. Ajouté
  `font-family: var(--font-family-mono, ...)`.
- Le badge s'étirait sur toute la largeur du canal (`left: 44px; right: 8px`
  forçait une largeur pleine) au lieu de suivre son contenu. Remplacé
  `right: 8px` par `max-width: calc(100% - 52px)` — le badge ne prend
  maintenant que la largeur de son texte (label/valeurs/delta), plafonnée
  pour ne pas dépasser le bord droit du graphe.

### 2026-08-03 — Police mono sur le graphe + bibliothèque de polices générales x2 plus large
- **Police de données appliquée au graphe uPlot** (manquait à l'entrée
  précédente) : uPlot dessine ses labels d'axes sur `<canvas>`, pas en DOM/
  CSS, donc `--font-family-mono` ne l'atteignait pas. Nouvelle fonction
  `axisFont()` dans `ChannelPlot.tsx` qui lit la variable CSS au moment de
  construire chaque graphe et la passe à `axes[].font` (police + taille,
  11px). Talon connu : si l'admin change la police de données alors qu'un
  graphe est déjà affiché, il ne se remet à jour qu'au prochain rebuild du
  graphe (changement de canal/tour/resize), pas instantanément — acceptable,
  les graphes se reconstruisent déjà souvent.
- Tailles des textes mono réduites un peu comme demandé : légende de canal
  11→10px, tableau des tours 12→11px.
- **Bibliothèque de polices générales élargie deux fois de plus** (Quentin
  n'aimait toujours pas la sélection) : +8 polices couvrant des genres
  variés — Nunito (arrondie), Outfit (géométrique), Lexend (lisibilité),
  Barlow Condensed (condensée), Merriweather + Lora (serif classique),
  Roboto Slab (slab serif), Caveat (manuscrite). Total : 21 polices site +
  8 polices données (monospace).
- Navbar : liens en gras (`.navbar-links a`/`.navbar-login`, `font-weight:
  600`, la marque l'était déjà).
- **Bug de migration corrigé** : `siteSettingsSchema.sql` élargissait la
  contrainte `font` de façon incrémentale (retrécir → valider → élargir →
  valider, répété à chaque nouveau lot de polices) — casse dès que les
  données en cours utilisent déjà une valeur d'un lot ultérieur, parce que
  le script entier se replaie depuis le début à chaque démarrage et
  réapplique temporairement une contrainte intermédiaire trop stricte.
  Backend en crash-loop pendant le fix (aucune perte de données — le
  problème était uniquement au redémarrage, jamais dans les valeurs
  choisies par Quentin). Corrigé en fusionnant tout l'historique de la
  contrainte en une seule étape finale (drop + add avec la liste complète
  actuelle), au lieu de plusieurs cycles successifs.

### 2026-08-03 — Presets d'affichage sur le backend + bibliothèque de polices élargie (2 choix)
- **Presets de vue backend-only** (`Object.keys(presets)` dans le sélecteur
  du panneau "Display preset") : ce chantier roadmap est fait. Les presets
  vivaient en `localStorage` (`lmu-telemetry-presets`), contredisant la règle
  "jamais de localStorage pour les prefs". Migré vers le mécanisme de
  préférences existant (`preferences.displayPresets`, même table/endpoint que
  `accentColor`/`sidebarCollapsed`/etc.) — zéro nouvel endpoint nécessaire.
  Suit maintenant le compte, pas le navigateur/device.
- **Mettre à jour un preset après modification** : nouveau bouton "Update"
  (`updateSelectedPreset`), affiché seulement quand le layout/poids/axe
  actuel diffère du preset chargé (`selectedPresetDirty`, comparaison
  JSON) — répond au besoin "si je modifie un preset sélectionné, je dois
  pouvoir le sauvegarder" sans avoir à retaper son nom.
- **Textbox de nom de preset en thème système** : fix via un reset global
  `input` (voir plus bas, même chantier que les checkboxes/select).
- **Bibliothèque de polices élargie + séparée en deux choix indépendants** :
  - Police **site** (générale) : System UI, Inter, Roboto, Poppins,
    Montserrat, Work Sans, Space Grotesk, Manrope, Oswald, Orbitron,
    Rajdhani, Bebas Neue, Playfair Display (13 choix, contre 9 avant —
    Quentin n'était pas fan de la sélection initiale).
  - Police **données** (nouveau, `dataFont`) : monospace uniquement — System
    monospace, JetBrains Mono, IBM Plex Mono, Space Mono, Roboto Mono, Fira
    Code, Source Code Pro, DM Mono. Appliquée aux tableaux/valeurs
    numériques de la télémétrie (`.telemetry-legend-table`,
    `.lap-select-table`) via `--font-family-mono`, séparée de la police
    site pour garder les colonnes/chiffres alignés quel que soit le choix.
    Pas encore branché sur les labels d'axes uPlot (rendu canvas, pas CSS —
    laissé de côté pour l'instant, complexité/risque plus élevés).
  - Nouveau `siteSettings.data_font` en DB (constraint dédiée) ; `font`
    (général) a perdu `jetbrains-mono`/`ibm-plex-mono` (déplacées vers
    `data_font` exclusivement) — remappées vers `system` si jamais utilisées
    côté général.
  - Preview live pour les deux polices dans `/admin`.
- **Navbar en gras** : `.navbar-links a`/`.navbar-login` passés à
  `font-weight: 600` (la marque l'était déjà).
- **Facteur de taille de texte revu en profondeur** : la première version
  (2026-08-03, entrée précédente) utilisait `zoom`, qui scalait TOUT (icônes,
  paddings), pas seulement le texte — signalé comme non voulu. Remplacé par
  une vraie conversion texte-only : les ~88 `font-size: Npx` de `styles.css`
  convertis en `calc(1rem * N / 16)`, relatif à `html { font-size: calc(16px
  * var(--text-scale)) }` — donc seul le texte grossit/rétrécit, tout le
  reste (icônes, marges, mise en page) reste fixe. Plage élargie à 80%–200%
  (au lieu de 80%–150%) pour laisser de la marge.
- **Log out en rouge** dans le menu compte (`.account-menu-logout`).
- Nouveau reset CSS global pour les `<input>` texte (même logique que les
  resets `button`/`select` précédents) — corrige la textbox de preset ET
  tout autre champ texte nu de l'app. Wrappé en `:where()` pour garder une
  spécificité nulle (sinon ça aurait écrasé silencieusement le padding/
  font-size des inputs déjà stylés comme `.modal-filter`).

### 2026-08-03 — Checkboxes/select natifs restants + facteur de taille de texte
- Coches natives OS restées dans le tableau "Laps" (colonnes Ref./Compare) et
  le `<select>` du "Display preset" (dropdown de chargement) : remplacées
  par un style custom pur CSS (`appearance: none` + case/coche dessinées à
  la main pour les checkboxes, `appearance: none` + chevron SVG en
  background-image pour les `<select>`). Reset `select {}` ajouté au niveau
  global (même logique que le reset `button {}` du 2026-08-03 précédent) —
  bénéficie à tous les `<select>` de l'app (presets, sélection de session à
  comparer, `MesSessions`), pas seulement ceux mentionnés.
- **Volontairement pas touché** : les checkboxes de la section "Channels
  shown" (delta channel toggle + sélection de canaux à grouper) — Quentin
  veut refondre tout ce système plus tard, pas juste le style visuel. Noté
  en "à faire" ci-dessus.
- Nouveau réglage **Taille du texte** dans `/admin` > Affichage : un
  facteur d'échelle (80%–150%, slider) appliqué via CSS `zoom` sur `#root`
  (pas juste `font-size` — la plupart des règles de `styles.css` sont en px
  fixe, pas en `rem`, donc scaler `body.font-size` seul n'aurait rien changé
  ailleurs ; `zoom` scale tout — texte, icônes, paddings — en un seul
  endroit). A nécessité de changer `.app-shell` de `height: 100vh` à `100%`
  (les unités viewport ne suivent pas `zoom`, un `100vh` zoomé dépasserait
  l'écran). Preview live dans l'admin (le texte d'exemple change de taille
  ET de police ensemble, avant save).
- Nouveau slider custom (`input[type=range]`, `appearance:none` + thumb/track
  stylés) réutilisable pour ce réglage et les futurs.
- **Bug corrigé en cours de route** : le backend crashait en boucle au
  démarrage depuis l'élargissement des polices — `INSERT ... ON CONFLICT DO
  NOTHING` évalue et valide les DEFAULT des colonnes contre les CHECK
  constraints *avant* de détecter le conflit ; `CREATE TABLE IF NOT EXISTS`
  ne mettait jamais à jour le DEFAULT réel de la colonne `font` (resté sur
  `'sans'`, invalide depuis l'élargissement) → chaque redémarrage replantait
  sur l'INSERT. Fix : `ALTER TABLE site_settings ALTER COLUMN font SET
  DEFAULT 'system'` ajouté avant l'INSERT dans `siteSettingsSchema.sql`.
  Aucune perte de données (les réglages déjà choisis par Quentin dans
  `/admin` — nom du site, police, couleur, glow désactivé — n'ont jamais été
  touchés, seul le démarrage du serveur était bloqué).

### 2026-08-03 — Fix centrage Admin + vraie librairie de polices + color pickers custom
- Fix : les deux `.social-card` de `/admin` s'affichaient collées à gauche —
  `.social-card` a son propre `align-self: flex-start` (pensé pour le mode
  ligne d'origine, où ça veut juste dire "ne pas s'étirer en hauteur") ; en
  passant `.admin-page` en `flex-direction: column` cet `align-self` devenait
  un alignement à gauche sur l'axe transverse (devenu horizontal). Corrigé
  via `.admin-page .social-card { align-self: center; }`.
- Polices : le choix "sans/mono/serif" (3 piles OS) remplacé par une vraie
  bibliothèque de polices auto-hébergée (`@fontsource`, pas de CDN externe) —
  9 polices (System UI, Inter, Roboto, IBM Plex Mono, JetBrains Mono,
  Orbitron, Rajdhani, Bebas Neue, Playfair Display). Catalogue central dans
  `frontend/src/fonts.ts`. Sélecteur dans `/admin` avec preview live (texte
  d'exemple qui change de police avant même de sauvegarder, police déjà
  chargée par l'app donc pas d'attente réseau). Migration DB : colonne
  `font` élargie, anciennes valeurs `sans/mono/serif` remappées vers les
  nouvelles clés.
- Color pickers : tous les `<input type="color">` (natif OS, moche) remplacés
  par `react-colorful` (~2.8 Ko, pas de dépendances, pas de dialogue OS) —
  nouveau composant partagé `components/ColorPicker.tsx` (swatch + popover,
  même pattern clic-extérieur/Escape que les autres popovers de l'app).
  Utilisé dans `/admin` (couleur par défaut + presets) et dans les
  préférences de couleur de tour de `TelemetryViewer`. `AccentPicker.tsx`
  (navbar) garde son propre système de swatches néon dédié, déjà non-natif.
- `package.json`/`package-lock.json` du frontend mis à jour sur l'hôte après
  l'install dans le conteneur (le Dockerfile ne bind-mount pas ces fichiers —
  sans ça, les deps auraient disparu au prochain rebuild).

### 2026-08-03 — Panel admin : catégorie "Affichage" (config site-wide)
- Nouvelle section dans `/admin` : nom du site, police (sans/mono/serif —
  uniquement des piles de polices déjà installées sur l'OS, pas de
  webfont/CDN chargé), couleur d'accent par défaut, palette de presets de
  couleurs proposée dans le picker de la navbar (éditable, 1 à 12 couleurs),
  toggle effet néon (glow) global.
- Table singleton `site_settings` (une seule ligne, id figé à 1) —
  `backend/src/siteSettings.ts` + `siteSettingsSchema.sql`. Distinct de
  `user_preferences` : ce n'est pas par-utilisateur, c'est le réglage
  global/fallback, guests compris.
- `GET /api/site-settings` public (pas d'auth — s'applique aussi aux guests,
  page de login incluse) ; `PATCH /api/admin/site-settings` admin-only.
- Frontend : nouveau `SiteSettingsContext` (fetché une fois, monté avant
  `AuthProvider` dans `main.tsx`). `AccentPicker.tsx` applique maintenant
  police/glow/couleur par défaut à partir de ce contexte (au lieu des
  constantes en dur `NEON_PRESETS`/`DEFAULT_ACCENT_COLOR`, gardées comme
  simple fallback avant le premier chargement). `Navbar.tsx` affiche le nom
  du site dynamique + met à jour `document.title`.
- Testé en réel (curl) : PATCH complet → reflété immédiatement sur le GET
  public. Validation serveur sur police (whitelist), couleurs (regex hex),
  nombre de presets (1 à 12).

### 2026-08-03 — Fixes navbar/social : avatar placeholder, boutons natifs, badge VIP manquant
- Bug boutons "natifs OS" (page admin + reset global) : les 3 boutons ajoutés
  dans la page Admin n'avaient aucune classe CSS → repli sur le style natif
  du navigateur. Corrigé + ajout d'un reset de base sur `button` dans
  `styles.css` (aucune règle globale n'existait, chaque bouton stylé dépend
  d'une classe spécifique) pour éviter la récidive sur un futur bouton oublié.
- Navbar : roue admin retirée du menu compte, remplacée par un avatar
  placeholder (icône silhouette générique, pas de vraie photo de profil pour
  l'instant — `UserIcon` dans `icons.tsx`, `.navbar-avatar`).
- Badge VIP (couronne) manquant partout sauf dans la navbar pour soi-même :
  factorisé en composant partagé `components/VipBadge.tsx`, maintenant
  affiché aussi dans `Social.tsx` (recherche, amis, demandes entrantes/
  sortantes, following/followers) et `Profile.tsx` (profil d'un autre user).

### 2026-08-03 — Panel admin (`/admin`)
- Liste de tous les users (table, réutilise `.modal-table`) : pseudo
  (éditable inline), email, plan (toggle free/vip), isAdmin (checkbox),
  statut actif/désactivé, usage stockage (réutilise `getStorageUsage`).
  Actions par ligne : envoyer un email de reset mot de passe (réutilise le
  flow `forgot-password` existant), désactiver/réactiver, supprimer le
  compte (confirmation).
- Backend : nouveau module `backend/src/admin.ts`, guard `requireAdmin`
  (vérifie `isAdmin` en DB à chaque requête — pas mis en cache sur la
  session). Routes : `GET/PATCH /api/admin/users(/:id)`,
  `POST /api/admin/users/:id/send-password-reset`,
  `DELETE /api/admin/users/:id`.
- Nouvelle colonne `users.is_active` (défaut `true`) : désactiver un compte
  détruit immédiatement toutes ses sessions (`destroyAllSessionsForUser`,
  même mécanisme que le reset password) et bloque les logins futurs
  (`403 ACCOUNT_DISABLED` dans `auth.ts`, vérifié après le mot de passe pour
  ne pas fuiter l'info à quelqu'un qui ne connaît pas le mot de passe).
- Garde-fous testés en réel (curl, comptes de test) : un admin ne peut pas
  changer son propre `isAdmin`/`isActive` ni se supprimer lui-même
  (`CANNOT_MODIFY_SELF`/`CANNOT_DELETE_SELF`) — évite l'auto-lockout du
  panel. Changement de pseudo par l'admin revalide unicité (409 si pris).
- `/admin` reste gated `isAdmin` côté front (`Admin.tsx`), plus placeholder.

### 2026-08-03 — Profil public/privé
- Colonne `users.profile_visibility` ('public' par défaut / 'private'),
  bascule dans Settings (`PUT /api/auth/profile-visibility`).
- Enforcement backend dans `social.ts` : `POST /api/friends/requests` et
  `POST /api/follows/:pseudo` renvoient `403 PROFILE_IS_PRIVATE` si la cible
  est privée. Testé en réel via curl (2 comptes, follow/friend-request
  bloqués une fois la cible passée privée).
- Passer en privé ne casse **pas** les relations déjà existantes (amitié,
  follow) — bloque seulement les nouvelles ; vérifié en réel (A suit B, B
  passe privé, A suit toujours B et peut toujours se désabonner).
- Frontend : `RelationActions.tsx` masque "Add as friend"/"Follow" (affiche
  "This profile is private" à la place) sauf si une relation existe déjà
  (ami, demande en cours, déjà suivi) — ces actions-là restent visibles.

### 2026-08-03 — Toutes les icônes en SVG (plus aucun emoji/symbole Unicode)
- Nouveau module partagé `frontend/src/components/icons.tsx` (feather-style,
  `viewBox 0 0 24 24`, `stroke="currentColor"`) : `CloseIcon`, `GearIcon`,
  `CrownIcon`, `ChevronIcon` (rotation via prop `direction`), `DragHandleIcon`,
  `GridIcon`/`SquareIcon`, `UngroupIcon`, `BellIcon`.
- Remplace tous les glyphes Unicode utilisés comme icônes dans l'app : badges
  VIP/admin (`AccountMenu`), boutons fermer/supprimer (`SessionPickerModal`,
  presets, sources externes, canaux), gear couleurs, poignée de drag,
  toggles combiné/séparé (pédales + corner split), dégroupement, chevrons de
  repli (`CollapsibleSection`, sidebar de `TelemetryViewer`), flèches de tri
  (`SessionTable`). Voir mémoire Claude `feedback_no_emoji_icons` pour la
  règle et la liste des glyphes concernés — nouvelles icônes à ajouter dans
  `icons.tsx`, pas en inline localement.

### 2026-08-03 — Système de notifications (cloche navbar)
- Cloche 🔔 dans la navbar (à côté du menu compte) : demandes d'ami entrantes +
  nouveaux followers, avec vrai état lu/non-lu (contrairement au point sur
  l'onglet "Friends", qui reste un simple indicateur "action en attente").
- Pas de table `notifications` dédiée — dérivé de `friend_requests`/`follows`
  existants + une seule colonne `users.notifications_seen_at` (défaut `now()`
  pour ne pas noyer les comptes existants sous l'historique complet des
  followers au déploiement). Item "non lu" = `created_at > notifications_seen_at`.
  Ouvrir la cloche marque tout comme vu (`POST /api/notifications/seen`) ; la
  liste elle-même (`GET /api/notifications`) ne modifie rien.
- Backend : `backend/src/notifications.ts` (`listNotifications`,
  `markNotificationsSeen`), routes ajoutées dans `social.ts` (pas de nouveau
  module `registerX` séparé). Frontend : `components/NotificationsBell.tsx`,
  même pattern popover clic-extérieur/Escape que `AccountMenu`.

### 2026-08-03 — Navigation SPA + petits fixes utilisateur
- Conversion complète de la navigation interne en SPA (React Router
  `Link`/`useNavigate`/`Navigate` au lieu de `<a href>`/`window.location`) —
  supprime le flash blanc et le rechargement complet du style/JS à chaque clic.
  `index.html` peint aussi un fond sombre avant que `styles.css` charge, pour
  qu'un vrai reload (F5) ne flashe plus blanc non plus.
- Pages avec un flash "vide"/faux état vide pendant leur propre fetch
  (Profile, Social) : ajout d'un vrai indicateur de chargement.
- Badge (point lumineux) sur l'onglet "Friends" de la navbar si une demande
  d'ami est en attente.
- q6vx défini administrateur (`is_admin = true` en DB, à la main).

### 2026-08-02/03 — Modal de sessions, thème néon, perf ChannelPlot, menu compte
- Modal "Charger une session" (remplace l'ancien `<select>`) : onglets Mes
  sessions / Publiques, colonnes triables, barre de quota de stockage (plans
  free 1Go / vip 20Go), suppression de session, réutilisée telle quelle sur
  `/browse`.
- Thème néon : couleur d'accent personnalisable (popover de presets, pas le
  color-picker natif de l'OS), boutons principaux avec contour lumineux —
  confiné aux boutons après un premier essai trop large (surfaces/navbar).
- Sidebar : chaque section repliable (préférence backend, pas localStorage).
  Menu de taille de canal (Small/Medium/Tall) par canal/groupe dans "Channels
  shown".
- Channels multi-colonnes (4 roues, ex. Brakes Force) : support des tours
  comparés + respect du colorMode via un toggle "split en 4 graphes séparés"
  (la vue combinée par défaut garde son style figé par coin).
- Fix perf majeur (ChannelPlot) : uPlot ne se reconstruit plus intégralement
  à chaque update de data (seulement sur un vrai changement structurel) — le
  rebuild systématique faisait freezer la page et cassait le drag-and-drop de
  réorganisation des canaux en cours de geste.
- Fix zoom : les bornes de zoom/pan étaient calculées sur les données propres
  du canal (faux pour un canal épars comme Gear) au lieu de l'axe X partagé.
- Fix axe X qui restait sur la session complète après sélection d'un tour
  (jusqu'à un zoom manuel) — course entre le scale de construction et le
  domaine réel pas encore chargé.
- Fix drag-and-drop de réorganisation des canaux qui "prenait" un groupe au
  passage de la souris — aperçu de réorganisation découplé de l'état commité.
- Menu déroulant sur le pseudo (navbar) : Mon profil / Paramètres / Mon
  abonnement / Administration (si admin) / Déconnexion. Badges couronne (VIP)
  et admin à côté du pseudo. Nouvelles pages Settings (stub lecture seule),
  Subscription (fonctionnelle, réutilise le quota de stockage), Admin
  (placeholder gated).

### Avant le 2026-08-02
Fondations : lecture/visualisation DuckDB, graphes uPlot synchronisés,
comparaison de tours (session courante ou fichier externe), canal de
delta-time, carte du circuit, comptes utilisateurs (amis/follows), partage de
tours/sessions (public/amis), i18n anglais. Détail complet dans `git log`.
