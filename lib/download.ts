/** Safe filename that keeps Unicode letters (incl. Devanagari) and digits. */
export function sanitizeFilename(name: string): string {
  const cleaned = (name || "invitation")
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "invitation";
}

/** Trigger a browser download for a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Render a canvas to a PNG Blob (promise wrapper around toBlob). */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not export the canvas to PNG."));
    }, "image/png");
  });
}

/**
 * Export a canvas as a compressed JPEG Blob — what we store for generated
 * invitations. JPEG keeps file sizes small (well under Cloudinary's 10 MB
 * limit) and guarantees the result is an image, never a PDF.
 */
export function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality = 0.9,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not export the image.")),
      "image/jpeg",
      quality,
    );
  });
}
