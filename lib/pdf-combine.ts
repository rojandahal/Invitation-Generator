/**
 * Stitch every page of an uploaded multi-page PDF into ONE tall base image.
 *
 * Cloudinary stores a PDF as an image asset and can deliver each page as a
 * raster (`pg_N`). We pull all pages, stack them vertically on a canvas, and
 * re-encode the result as a single JPEG so the rest of the app treats it as a
 * normal flat base image (no per-page delivery, one mark, one render).
 */

import { pdfPageUrl } from "./cloudinary-url";
import { loadImage } from "./render";

const MAX_PAGE_WIDTH = 1600; // bound each page's width to keep memory/size sane
const MAX_PAGES = 20; // safety cap; invitation PDFs are a handful of pages
const HARD_BYTES = 10 * 1024 * 1024; // Cloudinary free-tier image limit

export type CombinedPdf = {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
};

export async function combinePdfPages(
  publicId: string,
  pages: number,
): Promise<CombinedPdf> {
  const count = Math.max(1, Math.min(Math.floor(pages), MAX_PAGES));

  // Load every page raster (in parallel) at a bounded width.
  const images = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      loadImage(pdfPageUrl(publicId, i + 1, { width: MAX_PAGE_WIDTH })),
    ),
  );

  // Stack on a common width (the widest page, capped), preserving each aspect.
  const targetW = Math.min(
    MAX_PAGE_WIDTH,
    Math.max(...images.map((img) => img.naturalWidth || img.width)),
  );
  const placed = images.map((img) => {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const scale = targetW / iw;
    return { img, w: targetW, h: Math.max(1, Math.round(ih * scale)) };
  });
  const totalH = placed.reduce((sum, p) => sum + p.h, 0);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not combine the PDF pages (canvas unavailable).");
  }
  // White backdrop so any transparent page never exports with black areas.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, totalH);

  let y = 0;
  for (const p of placed) {
    ctx.drawImage(p.img, 0, y, p.w, p.h);
    y += p.h;
  }

  // Encode as JPEG, stepping quality down until it fits Cloudinary's limit.
  for (const quality of [0.92, 0.88, 0.82, 0.75, 0.65]) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= HARD_BYTES) {
      return {
        blob,
        filename: "invitation-combined.jpg",
        width: targetW,
        height: totalH,
      };
    }
  }

  throw new Error(
    "Combined image is too large even after compression. Try a smaller PDF.",
  );
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
