/**
 * Prepare a base file for Cloudinary upload.
 *
 * Cloudinary's free tier rejects image uploads over 10 MB. Base images are just
 * templates we render onto, so for large photos we transparently downscale to a
 * sensible max dimension and re-encode (as JPEG, on a white background) until
 * the result fits — preserving plenty of resolution for print. Small images and
 * PDFs pass through untouched.
 */

const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const TARGET_BYTES = 9_500_000; // leave headroom under the hard limit
const MAX_DIMENSION = 3000; // longest side, px — ample for invitation cards

export type PreparedUpload = { blob: Blob; filename: string };

export async function prepareBaseUpload(file: File): Promise<PreparedUpload> {
  // PDFs: can't process client-side; just enforce the size limit clearly.
  if (file.type === "application/pdf") {
    if (file.size > CLOUDINARY_MAX_BYTES) {
      throw new Error(
        "PDF is larger than 10 MB. Please compress it (or export a lower-res copy) and try again.",
      );
    }
    return { blob: file, filename: file.name };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Can't decode — pass through and let Cloudinary validate.
    return { blob: file, filename: file.name };
  }

  const longest = Math.max(bitmap.width, bitmap.height);
  const needsResize = longest > MAX_DIMENSION;
  const needsRecompress = file.size > TARGET_BYTES;

  if (!needsResize && !needsRecompress) {
    bitmap.close?.();
    return { blob: file, filename: file.name };
  }

  const scale = needsResize ? MAX_DIMENSION / longest : 1;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return { blob: file, filename: file.name };
  }
  // White background so transparent PNGs don't become black when re-encoded.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const base = file.name.replace(/\.[^.]+$/, "") || "invitation";
  for (const quality of [0.95, 0.9, 0.85, 0.8, 0.7]) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= CLOUDINARY_MAX_BYTES) {
      return { blob, filename: `${base}.jpg` };
    }
  }

  throw new Error(
    "Image is too large even after compression. Please resize it below 10 MB and try again.",
  );
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
