# Schéma des fichiers de télémétrie DuckDB (Le Mans Ultimate)

Analysé à partir d'un export réel : `Sebring International Raceway_R_2026-07-28T22_42_15Z.duckdb`
(session Race, Sebring, LMP3, ~2032s / 16 tours).

## Vue d'ensemble

Contrairement à un fichier "plat" avec une grosse table (timestamp + colonnes),
LMU exporte **une table DuckDB par canal**. Il y a ~100 tables au total, plus
3 tables de métadonnées.

Deux familles de tables de canaux :

### 1. Canaux continus (échantillonnage à fréquence fixe)

Colonnes : `value` (ou `value1..value4` pour les canaux multi-roues/multi-pneus).
**Pas de colonne `ts`** — le temps doit être reconstruit (voir plus bas).

Exemples : `Brake Pos` (50Hz), `Engine RPM` (100Hz), `TyresPressure` (10Hz, 4 roues),
`GPS Time` (100Hz — sert de référence d'horloge absolue).

### 2. Canaux événementiels (valeur enregistrée au changement uniquement)

Colonnes : `ts` (DOUBLE, secondes) + `value` (ou `value1..value4`).
Beaucoup moins de lignes (ex: `Gear` n'a qu'une ligne par changement de rapport).

Exemples : `Lap`, `Gear`, `TC`, `Current Sector`, `Best LapTime`, `Sector1 Flag`.

### Tables de métadonnées

- **`channelsList`** (`channelName`, `frequency` INTEGER Hz, `unit`) — liste les canaux
  continus avec leur fréquence d'échantillonnage et leur unité.
- **`eventsList`** (`eventName`, `unit`) — liste les canaux événementiels et leur unité
  (pas de fréquence, par définition).
- **`metadata`** (`key`, `value` VARCHAR) — infos session : `DriverName`, `TrackName`,
  `CarName`, `CarClass`, `SessionType`, `WeatherConditions`, `RecordingTime`,
  `SessionTime`, `SteamID`, et **`CarSetup`** (un gros blob JSON avec tous les réglages
  de setup voiture — à afficher à part, pas dans les graphes de canaux).

## Reconstruction du temps pour les canaux continus

DuckDB fournit un pseudo-champ `rowid` qui reflète l'ordre d'insertion (confirmé par
sondage : `rowid` croissant = temps croissant, aucune donnée désordonnée observée).

Le canal `GPS Time` (100Hz, valeurs explicites) sert de référence absolue :

```
rowid=0   → value=6.97
rowid=1   → value=6.98
...
rowid=n   → value=6.97 + n/100
```

Règle générale pour un canal continu de fréquence `f` (Hz) :

```
ts(rowid) = START_TS + rowid / f
```

où `START_TS` = valeur au `rowid=0` du canal `GPS Time` (constant pour tout le fichier,
= décalage de début d'enregistrement, ici 6.97s). **Ne pas coder en dur 6.97** : le lire
dynamiquement depuis `GPS Time` à l'ouverture du fichier (ou depuis le premier `ts` de
n'importe quel canal événementiel, qui coïncide avec la même valeur).

Pour les canaux multi-valeurs (`value1..value4` = FL/FR/RL/RR ou similaire), la même
règle de temps s'applique — chaque ligne représente un instant commun aux 4 valeurs.

## Implication pour le backend

- Toujours interroger avec `SELECT rowid, value FROM "<table>" ORDER BY rowid` pour
  garantir l'ordre temporel (ne jamais se fier à un ordre implicite non trié).
- Noms de tables/canaux contiennent espaces et caractères spéciaux → toujours les
  quoter (`"Brake Pos"`) et les passer en paramètre bindé quand possible, sinon
  échapper strictement (whitelist contre `channelsList`/`eventsList` avant d'interpoler
  dans le SQL, jamais interpoler une entrée utilisateur brute).
- Le nom de fichier de session contient le circuit + type de session + date/heure
  (`<Track>_<SessionType initial>_<ISO date>.duckdb`), utile pour lister les sessions
  sans ouvrir chaque fichier.

## Exemple de canaux multi-valeurs observés

`Brake Thickness`, `Brakes Air Temp`, `Brakes Force`, `Brakes Temp`, `RideHeights`,
`Susp Pos`, `Tyres Wear`, `TyresCarcassTemp`, `TyresPressure`, `TyresRimTemp`,
`TyresRubberTemp`, `TyresTempCentre/Left/Right`, `Wheel Speed`, `SurfaceTypes`,
`TyresCompound`, `WheelsDetached` — tous à 4 valeurs (une par roue).
