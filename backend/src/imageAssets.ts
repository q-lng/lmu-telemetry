import fs from 'node:fs';
import path from 'node:path';

// 'svg' is server-generated only (from an uploaded .mas track file, see
// masTrack.ts) — never a raw upload mimetype, so it's absent from
// UPLOAD_CONTENT_TYPES but still a valid resolved/served extension.
export type ImageExt = 'jpg' | 'png' | 'svg';

export const UPLOAD_CONTENT_TYPES: Record<string, ImageExt> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// Every extension writeImageAtomic should treat as "stale" once one of the
// others is (re)written — kept separate from UPLOAD_CONTENT_TYPES since that
// one only lists raw-upload mimetypes, not server-generated ones like svg.
const ALL_IMAGE_EXTS: ImageExt[] = ['jpg', 'png', 'svg'];

// Shared by tracks.ts and cars.ts — both catalogs resolve which extension
// actually exists on disk server-side rather than having the client guess
// (try .jpg, fall back to .png on 404), which used to spam the console with
// a 404 for every asset missing the guessed format.
export function resolveImageExt(dir: string, baseName: string): ImageExt | null {
  if (fs.existsSync(path.join(dir, `${baseName}.jpg`))) return 'jpg';
  if (fs.existsSync(path.join(dir, `${baseName}.png`))) return 'png';
  if (fs.existsSync(path.join(dir, `${baseName}.svg`))) return 'svg';
  return null;
}

// Shared by the admin photo/map/badge upload routes — writes to a `.uploading`
// temp file first and renames it into place (same pattern as
// /api/sessions/upload in files.ts). A plain writeFileSync straight to the
// served filename let a concurrent GET (or a double-submitted upload) read
// back a truncated file while the write was still in flight. Stale
// other-extension files are only cleared after the rename succeeds, so a
// failed upload never leaves the entry with no image at all.
export function writeImageAtomic(dir: string, baseName: string, ext: ImageExt, buffer: Buffer): void {
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${baseName}.${ext}`);
  const tmpDest = `${dest}.uploading`;
  fs.writeFileSync(tmpDest, buffer);
  fs.renameSync(tmpDest, dest);
  for (const otherExt of ALL_IMAGE_EXTS) {
    if (otherExt === ext) continue;
    fs.rmSync(path.join(dir, `${baseName}.${otherExt}`), { force: true });
  }
}

const CONTENT_TYPES_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

/** Shared GET handler for serving an uploaded image by filename — used for
 * both /api/track-photos/:filename and /api/car-photos/:filename. Public,
 * unauthenticated: these are site content, not user data. path.basename
 * guards against traversal; the extension allow-list doubles as the
 * content-type lookup. */
export function serveImage(dir: string, filename: string): { contentType: string; stream: fs.ReadStream } | null {
  const safeName = path.basename(filename);
  const ext = path.extname(safeName).toLowerCase();
  const contentType = CONTENT_TYPES_BY_EXT[ext];
  if (!contentType) return null;
  const filePath = path.join(dir, safeName);
  if (!fs.existsSync(filePath)) return null;
  return { contentType, stream: fs.createReadStream(filePath) };
}
