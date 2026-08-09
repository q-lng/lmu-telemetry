# lmu-telemetry

Webapp légère de lecture/visualisation de télémétrie **Le Mans Ultimate** (format DuckDB),
façon MoTeC i2 : ouverture d'une session, affichage de tous les canaux disponibles,
graphes synchronisés, carte du circuit.

## Stack

- **Tout en TypeScript.** Pas de Python dans ce projet — même les scripts d'inspection
  ponctuels du schéma DuckDB se font via Node (package `duckdb`), jamais `pip install`.
- **Backend** : Node.js + Fastify + package `duckdb` (accès direct au fichier, pas d'ORM).
- **Frontend** : Vite + React + TypeScript, graphes avec **uPlot** (perf sur séries denses,
  curseur synchronisé entre canaux).
- **Tout tourne en Docker / docker-compose** (dev comme prod). Ne pas proposer de lancer
  `node`/`npm` directement sur l'hôte — l'hôte n'a pas Node installé.

## Structure

```
data/           fichiers .duckdb (gitignorés, montés en volume dans le conteneur backend)
backend/        API Fastify+TS
frontend/       app Vite+React+TS
docs/SCHEMA.md  schéma DuckDB des fichiers de télémétrie (référence technique)
CONTEXT.md      décisions de projet et état d'avancement
TASKS.md        archive du suivi (jusqu'au 2026-08-03, remplacé depuis par le
                GitHub Project — voir ci-dessous)
```

## Suivi de l'avancement

**Depuis le 2026-08-03**, le suivi "en cours / à faire" se fait sur le GitHub Project
https://github.com/users/q-lng/projects/2 (colonnes Todo / In Progress / Done, une
carte = une issue du repo) — pas dans un fichier du repo. À chaque nouvelle tâche :
créer une issue (`gh`/API GitHub, token dans `.env`) et l'ajouter au board ; en fin de
tâche, la passer en Done. `TASKS.md` reste comme archive du suivi d'avant cette date,
plus mis à jour. La mémoire Claude (feedback/préférences/roadmap) complète mais ne
remplace pas le board.

## Schéma des données

Voir **[docs/SCHEMA.md](docs/SCHEMA.md)** avant de toucher au backend — le format est
inhabituel (une table DuckDB par canal, pas une table plate), avec une règle de
reconstruction du temps à respecter pour les canaux continus.

## Commandes

```
docker compose up --build     # lance backend + frontend
docker compose down
```

Pas de commandes npm sur l'hôte (Node absent) — tout passe par les conteneurs.

**Ajout d'une dépendance npm** : `docker compose exec frontend npm install <pkg>`
installe dans la couche writable du conteneur en cours d'exécution, pas dans l'image —
si le conteneur est recréé (pas juste redémarré) avant un rebuild, la dépendance
disparaît et l'app plante au démarrage (`Failed to resolve import`). Toujours finir par
`docker compose build frontend` (ou `backend`) pour que `npm install` tourne à nouveau
depuis le `package.json` à jour et que la dépendance soit bien dans l'image — copier
`package.json`/`package-lock.json` vers l'hôte ne suffit pas seul.

## Conventions

- Noms de canaux/tables DuckDB contiennent espaces et caractères spéciaux → toujours
  quoter les identifiants SQL et whitelister contre `channelsList`/`eventsList` avant
  toute interpolation (jamais interpoler une entrée venant directement de l'URL sans
  vérification).
- Export MoTeC : **non implémenté pour l'instant** (mis de côté volontairement, format
  CSV MoTeC i2 pas assez documenté publiquement pour être fiable sans un vrai i2 sous
  la main pour valider). Voir CONTEXT.md.
