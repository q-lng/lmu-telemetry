// Track map photos are uploaded per-track and vary wildly in their own
// colors/style — normalizing every one of them to the same flat white
// silhouette with a black outline keeps them equally readable at the same
// translucency under the GPS trace (see trackMapDraw.ts), regardless of
// source. Done once per image load and cached as a canvas, not redone on
// every redraw (recoloring via getImageData/putImageData on every animation
// frame would be far too slow).

// ~0.8% of the image's smaller dimension — scales with resolution instead of
// a fixed pixel count, so the outline reads the same whether the uploaded
// photo is a small sketch or a large hi-res scan.
const OUTLINE_RATIO = 0.008;
const OUTLINE_STEPS = 16;

function silhouette(img: HTMLImageElement, width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function buildOutlinedMapImage(img: HTMLImageElement): HTMLCanvasElement {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const thickness = Math.max(2, Math.round(Math.min(width, height) * OUTLINE_RATIO));
  const black = silhouette(img, width, height, '#000000');
  for (let i = 0; i < OUTLINE_STEPS; i++) {
    const angle = (i / OUTLINE_STEPS) * Math.PI * 2;
    ctx.drawImage(black, Math.cos(angle) * thickness, Math.sin(angle) * thickness);
  }

  const white = silhouette(img, width, height, '#ffffff');
  ctx.drawImage(white, 0, 0);

  return canvas;
}

/** Loads a track map image from `src` and returns it recolored (white fill,
 * black outline) as an off-screen canvas ready to hand to drawTrackMap. */
export function loadOutlinedMapImage(src: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(buildOutlinedMapImage(img));
    img.onerror = () => reject(new Error(`failed to load map image: ${src}`));
    img.src = src;
  });
}
