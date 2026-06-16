/**
 * Client-safe Cloudinary delivery URL builder.
 *
 * Uses only the public cloud name (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME), so it
 * is safe to import in the browser. No SDK, no secrets.
 */

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

function joinTransforms(parts: string[]): string {
  const t = parts.filter(Boolean).join(",");
  return t ? `${t}/` : "";
}

/**
 * Delivery URL for an invitation's BASE image.
 *
 * Always transcodes to PNG so the browser <canvas> gets a clean raster. PDFs
 * are delivered as page 1 at a higher density for crisp output. Everything is
 * normalized (0..1) downstream, so the absolute pixel size never affects
 * placement — we always read the loaded image's natural dimensions at render.
 */
export function baseImageUrl(
  publicId: string,
  format: string,
  opts?: { width?: number },
): string {
  const isPdf = format?.toLowerCase() === "pdf";
  const transforms: string[] = [];
  if (isPdf) {
    transforms.push("pg_1", "dn_150");
  }
  if (opts?.width) {
    transforms.push(`w_${opts.width}`, "c_limit");
  }
  return `https://res.cloudinary.com/${CLOUD}/image/upload/${joinTransforms(
    transforms,
  )}${publicId}.png`;
}

/**
 * Delivery URL for a single PAGE of an uploaded PDF, rasterized to PNG. Used to
 * pull every page so we can stitch a multi-page PDF into one tall base image.
 * `dn_150` raster density keeps text crisp; `w_…,c_limit` bounds the width.
 */
export function pdfPageUrl(
  publicId: string,
  page: number,
  opts?: { width?: number },
): string {
  const transforms: string[] = [`pg_${page}`, "dn_150"];
  if (opts?.width) transforms.push(`w_${opts.width}`, "c_limit");
  return `https://res.cloudinary.com/${CLOUD}/image/upload/${joinTransforms(
    transforms,
  )}${publicId}.png`;
}

/**
 * Delivery URL for a generated invitation — served as a compressed JPEG.
 * `.jpg` works whether the stored asset is a JPEG or PNG (Cloudinary
 * transcodes), and `q_auto:good` keeps downloads small.
 */
export function generatedImageUrl(
  publicId: string,
  opts?: { width?: number },
): string {
  const transforms: string[] = ["q_auto:good"];
  if (opts?.width) transforms.push(`w_${opts.width}`, "c_limit");
  return `https://res.cloudinary.com/${CLOUD}/image/upload/${joinTransforms(
    transforms,
  )}${publicId}.jpg`;
}

/** Direct unsigned upload endpoint for this cloud (used with a server signature). */
export function uploadEndpoint(cloudName: string): string {
  return `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
}
