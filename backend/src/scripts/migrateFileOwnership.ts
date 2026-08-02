import fs from 'node:fs';
import path from 'node:path';
import { listSessionFiles, DATA_DIR } from '../db.js';
import { getSessionMetadata, type SessionMetadata } from '../metadata.js';
import { findUserByPseudo } from '../users.js';
import { upsertFileRecord, setFileVisibility } from '../access.js';
import { pool } from '../pg.js';

async function main() {
  const [ownerPseudo, ...excludeFiles] = process.argv.slice(2);
  if (!ownerPseudo) {
    console.error('Usage: tsx src/scripts/migrateFileOwnership.ts <owner-pseudo> [fichier-a-exclure ...]');
    process.exit(1);
  }
  const owner = await findUserByPseudo(ownerPseudo);
  if (!owner) {
    console.error(`Utilisateur "${ownerPseudo}" introuvable`);
    process.exit(1);
  }

  const files = listSessionFiles();
  for (const filename of files) {
    const excluded = excludeFiles.includes(filename);
    const meta = await getSessionMetadata(filename).catch((): SessionMetadata => ({ info: {}, carSetup: null }));
    const track = meta.info.TrackName ?? null;
    const car = meta.info.CarName ?? null;
    const sizeBytes = fs.statSync(path.join(DATA_DIR, filename)).size;
    await upsertFileRecord(filename, { ownerId: excluded ? null : owner.id, track, car, sizeBytes });
    await setFileVisibility(filename, excluded ? 'public' : 'private');
    console.log(
      `${filename} -> owner=${excluded ? 'NULL (orphelin)' : owner.pseudo}, visibility=${excluded ? 'public' : 'private'}`,
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
