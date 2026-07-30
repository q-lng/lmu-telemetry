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
```

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

## Conventions

- Noms de canaux/tables DuckDB contiennent espaces et caractères spéciaux → toujours
  quoter les identifiants SQL et whitelister contre `channelsList`/`eventsList` avant
  toute interpolation (jamais interpoler une entrée venant directement de l'URL sans
  vérification).
- Export MoTeC : **non implémenté pour l'instant** (mis de côté volontairement, format
  CSV MoTeC i2 pas assez documenté publiquement pour être fiable sans un vrai i2 sous
  la main pour valider). Voir CONTEXT.md.
