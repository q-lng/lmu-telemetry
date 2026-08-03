# Suivi des tâches — lmu-telemetry

> Tenu à jour en continu (pas juste en fin de session) pour que le contexte
> survive même si on change de conversation Claude Code. Le détail complet de
> chaque changement reste dans `git log` — ce fichier sert à s'orienter vite,
> pas à dupliquer les messages de commit.

## En cours / à faire

- [ ] **Système de notifications** (cloche dans la navbar) : demandes d'ami +
      nouveaux followers, avec état lu/non-lu. Pas commencé — nécessite une
      vraie conception backend (table `notifications` dédiée, ou dérivé des
      tables `friend_requests`/`follows` existantes + un marqueur "vu par
      l'utilisateur"). Le badge sur l'onglet "Friends" (fait, voir plus bas)
      couvre déjà le cas "demande d'ami en attente" de façon simple ; la
      cloche est un système plus général en plus de ça.
- [ ] **Profil public/privé** : si un profil est privé, impossible de le
      suivre/envoyer une demande d'ami. Pas commencé — nécessite une colonne
      DB (ou preference), la logique d'enforcement côté back (endpoints
      follow/friend-request), et un toggle dans Settings.
- [ ] **Panel admin** : `/admin` est un placeholder gated sur `isAdmin` pour
      l'instant (pas de vraie gestion). À construire : liste des users,
      changer leur plan/isAdmin, "et certaines autres options" (à préciser).
      q6vx est déjà `is_admin=true` en DB pour pouvoir tester dès que la page
      existe.
- [ ] (Roadmap plus lointaine, voir aussi la mémoire Claude) : preset de vue
      "Default" partagé + presets utilisateur sauvegardant taille de canal —
      actuellement les presets sont en `localStorage`, ce qui contredit la
      règle "jamais de localStorage pour les prefs" ; à corriger si ce chantier
      est repris.

## Terminé

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
