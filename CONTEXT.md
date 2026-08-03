# Contexte projet

## Objectif

Quentin (pilote sim, LMU) veut une webapp légère pour ouvrir ses fichiers de
télémétrie Le Mans Ultimate (.duckdb) et les visualiser comme dans MoTeC i2 :
tous les canaux disponibles, graphes, avec à terme un export vers MoTeC.

## Décisions prises

- **Stack** : Node.js/TypeScript de bout en bout (Fastify + package `duckdb` côté
  backend, Vite + React + uPlot côté frontend). Python explicitement écarté — même
  pour l'inspection ponctuelle du schéma, faite via un conteneur Node jetable.
- **Docker obligatoire** : toute la stack tourne en docker-compose, y compris en dev.
  L'hôte n'a pas Node installé — ne jamais proposer un `npm install`/`node` local.
- **Export MoTeC** : décision initiale = CSV compatible i2 (plus simple qu'un .ld
  binaire propriétaire). En creusant, deux problèmes sont apparus :
  1. le format CSV exact de MoTeC n'est pas documenté publiquement de façon fiable
     (recherches web infructueuses, seulement des bribes sur des forums) ;
  2. l'import CSV dans i2 Pro nécessite en plus une licence additionnelle
     ("Import MoTeC CSV Dataset").
  → **Mis de côté pour l'instant**, sur demande explicite de Quentin. Ne pas relancer
  de recherche dessus sans qu'il le redemande. Si repris un jour : partir d'un export
  réel généré par un i2 Pro pour reverse-engineer le format plutôt que de deviner.

## État d'avancement

**Voir [TASKS.md](TASKS.md) pour le détail à jour** (terminé / en cours / à faire) —
tenu à jour en continu, y compris entre deux conversations Claude Code différentes.

Le schéma DuckDB a été entièrement documenté dans `docs/SCHEMA.md` à partir d'un
vrai fichier fourni par Quentin (`data/Sebring International Raceway_R_2026-07-28T22_42_15Z.duckdb`,
session Race Sebring LMP3).

Grandes lignes de ce qui existe déjà (voir TASKS.md pour le détail) : lecture/
visualisation de télémétrie avec graphes synchronisés uPlot, comparaison de tours
(même session ou fichier externe), canal de delta-time, carte du circuit, comptes
utilisateurs (amis/follows, partage de tours/sessions publics ou entre amis), modal
de chargement de session avec quota de stockage (plans free/vip), thème néon
personnalisable, panel admin en cours de construction.

## Notes diverses

- Le fichier `metadata.CarSetup` contient un blob JSON complet du setup voiture —
  utile pour un panneau d'infos session, hors scope des graphes de canaux.
- Les noms de fichiers de session suivent le pattern
  `<Circuit>_<Session>_<horodatage ISO>.duckdb`.
