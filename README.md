# lmu-telemetry

Webapp de lecture/visualisation de télémétrie **Le Mans Ultimate** (format DuckDB),
façon MoTeC i2 : ouverture d'une session, tous les canaux disponibles, graphes
synchronisés, carte du circuit, comparaison de tours — plus une couche compte
utilisateur (amis/follows, partage de sessions, notifications) et un panel
d'administration pour la configuration du site.

> Le projet évolue vers un **hub communautaire LMU** (tracking de sessions à
> l'échelle de la communauté, bot Discord, hébergement dédié) — voir
> [CONTEXT.md](CONTEXT.md) pour l'objectif détaillé et [TASKS.md](TASKS.md)
> pour l'avancement au jour le jour.

## Stack

- **TypeScript de bout en bout.** Pas de Python dans ce projet.
- **Backend** : Node.js + Fastify + PostgreSQL (comptes/social/préférences) +
  package `duckdb` (lecture directe des fichiers de télémétrie, pas d'ORM).
- **Frontend** : Vite + React + TypeScript, graphes avec **uPlot**.
- **Tout tourne en Docker / docker-compose**, y compris en dev.

## Démarrer

```bash
cp .env.example .env   # renseigner les secrets (voir ci-dessous)
docker compose up --build
```

- Frontend : http://localhost:5173
- Backend : http://localhost:3891
- Les fichiers de session (`.duckdb`) uploadés sont stockés dans `data/` (gitignoré).

### Variables d'environnement (`.env`)

| Variable | Description |
| --- | --- |
| `POSTGRES_PASSWORD` | Mot de passe de la base Postgres (comptes/social/préférences). |
| `COOKIE_SECRET` | Secret de signature des cookies de session. |
| `COOKIE_SECURE` | `true` en prod derrière HTTPS, `false` en local. |
| `PUBLIC_BASE_URL` | URL publique de l'app — utilisée pour les liens cliquables dans les emails (reset mot de passe). |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM` | SMTP. Laisser vide pour désactiver l'envoi d'email (loggé, jamais bloquant). |

## Structure

```
data/           fichiers .duckdb (gitignorés, montés en volume dans le conteneur backend)
backend/        API Fastify + TS
frontend/       app Vite + React + TS
docs/SCHEMA.md  schéma DuckDB des fichiers de télémétrie (référence technique)
CONTEXT.md      décisions de projet, objectif, état d'avancement
TASKS.md        suivi continu des tâches (terminé / en cours / à faire)
```

## Fonctionnalités

- Lecture/visualisation de télémétrie : graphes uPlot synchronisés, carte du
  circuit, comparaison de tours (même session ou fichier externe), canal de
  delta-time.
- Comptes utilisateurs : amis/follows, partage de sessions et de tours
  (public/amis/privé), profils publics ou privés, notifications (demandes
  d'ami, nouveaux followers).
- Presets d'affichage de la vue télémétrie, sauvegardés côté serveur (suivent
  le compte, pas le navigateur).
- Panel admin (`/admin`) : gestion des utilisateurs (plan, rôle admin,
  activation/désactivation, reset mot de passe) et configuration globale de
  l'affichage du site (police du site, police des affichages de données,
  taille de texte, couleur d'accent par défaut et palette proposée, effet
  néon).
- Export MoTeC : **non implémenté** (voir [CONTEXT.md](CONTEXT.md) — mis de
  côté volontairement, format pas assez documenté publiquement).

## Schéma des données

Voir [docs/SCHEMA.md](docs/SCHEMA.md) avant de toucher au backend — le format
DuckDB est inhabituel (une table par canal, pas une table plate), avec une
règle de reconstruction du temps à respecter pour les canaux continus.

## Conventions

- Noms de canaux/tables DuckDB avec espaces et caractères spéciaux → toujours
  quoter les identifiants SQL et whitelister avant toute interpolation.
- Préférences utilisateur toujours stockées côté backend, jamais en
  `localStorage`.
- Icônes : SVG inline uniquement, jamais d'emoji (voir
  `frontend/src/components/icons.tsx`).
