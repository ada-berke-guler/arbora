/**
 * Phone photos are 3–8 MB; stored raw they bloat the local DB, every sync and
 * the server quota. Downscale to MAX_SIDE on the long edge (plenty for a
 * phone/desktop wallpaper export) and re-encode. Keeps the original when it
 * can't do better: GIFs (may be animated), tiny files, no canvas support
 * (tests, old browsers), or when the result isn't smaller.
 */
export const MAX_SIDE = 2560;
const SKIP_BELOW = 400 * 1024;

export async function shrinkImage(data: ArrayBuffer, mime: string): Promise<{ data: ArrayBuffer; mime: string }> {
  const original = { data, mime };
  if (mime === "image/gif" || mime === "image/svg+xml" || data.byteLength < SKIP_BELOW) return original;
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") return original;
  try {
    const bmp = await createImageBitmap(new Blob([data], { type: mime }));
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    /* WebP keeps transparency; browsers that can't encode it hand back PNG,
     * in which case photos (no alpha) go JPEG instead. */
    let blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.86 });
    if (blob.type !== "image/webp" && mime !== "image/png") blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.86 });
    if (blob.size >= data.byteLength) return original;
    return { data: await blob.arrayBuffer(), mime: blob.type };
  } catch {
    return original;
  }
}
