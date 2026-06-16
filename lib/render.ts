import { resolveFontFamily } from "./fonts";

/**
 * THE shared renderer. Used by BOTH the marking-editor live preview and batch
 * generation, so what the user marks is exactly what every guest gets.
 *
 * All geometry is stored normalized (0..1) against the natural image size, so
 * it maps to any output resolution. We always draw at the image's natural
 * resolution and let CSS scale the <canvas> down for display.
 *
 * Text may mix scripts (English + Nepali). We split each line into runs of
 * Devanagari vs. non-Devanagari characters and draw every run with its own
 * font, so a single card can use one font for English and another for Nepali.
 */

export type Mark = {
  markX: number; // top-left, fraction of width
  markY: number; // top-left, fraction of height
  markWidth: number; // fraction of width
  markHeight: number; // fraction of height
  fontFamily: string; // Latin/English font KEY (see lib/fonts.ts)
  fontFamilyNepali?: string; // Devanagari/Nepali font KEY
  fontSizeRel: number; // fraction of image HEIGHT
  fontColor: string;
  fontWeight?: number; // 100..900 (how bold)
  fontItalic?: boolean;
  lineHeightRel?: number; // line box as a multiple of the font size (the line gap)
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
  maxLines?: number; // wrap the name across up to this many lines (default 1)
};

const DEFAULT_WEIGHT = 600;
const DEFAULT_LINE_HEIGHT = 1.18;
const MIN_FONT_PX = 6;

// Devanagari + Devanagari Extended + Vedic Extensions. Characters in this range
// render with the Nepali font; everything else (Latin, digits, punctuation,
// spaces) renders with the English font.
const DEVANAGARI = /[ऀ-ॿ꣠-ꣿ᳐-᳿]/;

/** Concrete fonts + style resolved once per render, reused by every run. */
type ResolvedFonts = {
  latin: string;
  nepali: string;
  weight: number;
  italic: boolean;
};

function resolveFonts(mark: Mark): ResolvedFonts {
  return {
    latin: resolveFontFamily(mark.fontFamily),
    nepali: resolveFontFamily(mark.fontFamilyNepali ?? mark.fontFamily),
    weight: mark.fontWeight ?? DEFAULT_WEIGHT,
    italic: mark.fontItalic ?? false,
  };
}

function fontSpec(
  fonts: ResolvedFonts,
  script: "latin" | "nepali",
  fontPx: number,
): string {
  const family = script === "nepali" ? fonts.nepali : fonts.latin;
  const style = fonts.italic ? "italic " : "";
  return `${style}${fonts.weight} ${fontPx}px ${family}`;
}

type Run = { text: string; script: "latin" | "nepali" };

/** Split a string into consecutive runs of Devanagari vs. non-Devanagari. */
function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (const ch of text) {
    const script: Run["script"] = DEVANAGARI.test(ch) ? "nepali" : "latin";
    const last = runs[runs.length - 1];
    if (last && last.script === script) last.text += ch;
    else runs.push({ text: ch, script });
  }
  return runs;
}

/** Width of one line, measuring each script run with its own font. */
function measureLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  fonts: ResolvedFonts,
  fontPx: number,
): number {
  let width = 0;
  for (const run of splitRuns(line)) {
    ctx.font = fontSpec(fonts, run.script, fontPx);
    width += ctx.measureText(run.text).width;
  }
  return width;
}

/** Draw one line left-to-right, switching fonts per run. `startX` is the left edge. */
function drawLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  fonts: ResolvedFonts,
  fontPx: number,
  startX: number,
  y: number,
): void {
  let x = startX;
  for (const run of splitRuns(line)) {
    ctx.font = fontSpec(fonts, run.script, fontPx);
    ctx.fillText(run.text, x, y);
    x += ctx.measureText(run.text).width;
  }
}

/** Load an image with CORS enabled so the canvas stays untainted (toBlob works). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Could not load the base image. Check the URL / CORS."));
    img.src = src;
  });
}

/**
 * Make sure a single font (at roughly the right size/weight) is actually loaded
 * before we draw — otherwise canvas silently falls back and Devanagari renders
 * as boxes.
 */
export async function ensureFontReady(
  family: string,
  fontSizePx: number,
  sampleText: string,
  weight: number = DEFAULT_WEIGHT,
  italic = false,
): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const style = italic ? "italic " : "";
  const spec = `${style}${weight} ${Math.max(1, Math.ceil(fontSizePx))}px ${family}`;
  try {
    await document.fonts.load(spec, sampleText || "ABC");
    await document.fonts.ready;
  } catch {
    // Best effort — fall through and draw with whatever is available.
  }
}

/**
 * Ensure BOTH the Latin and Nepali fonts for a mark are loaded at the given
 * size/weight before rendering.
 */
export async function ensureMarkFontsReady(
  mark: Mark,
  fontSizePx: number,
  sampleText: string,
): Promise<void> {
  const fonts = resolveFonts(mark);
  await Promise.all([
    ensureFontReady(fonts.latin, fontSizePx, `${sampleText} Aa`, fonts.weight, fonts.italic),
    ensureFontReady(fonts.nepali, fontSizePx, `${sampleText} अआ`, fonts.weight, fonts.italic),
  ]);
}

/**
 * Draw the base image and place `text` inside the marked box. Auto-shrinks the
 * font until the wrapped block fits the box. Returns the pixel font size used.
 */
export function renderInvitation(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  mark: Mark,
  text: string,
): number {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;

  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;

  ctx.clearRect(0, 0, w, h);
  // White backdrop so transparent sources (e.g. a PDF page) never export with
  // black areas when we encode the result as JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);

  // Normalize line breaks; collapse trailing/leading whitespace per line.
  const value = (text ?? "").replace(/\r\n?/g, "\n").trim();
  const fonts = resolveFonts(mark);
  const maxLines = Math.max(1, Math.floor(mark.maxLines ?? 1));
  const lineHeight = mark.lineHeightRel ?? DEFAULT_LINE_HEIGHT;

  // Box in pixels.
  const bx = mark.markX * w;
  const by = mark.markY * h;
  const bw = mark.markWidth * w;
  const bh = mark.markHeight * h;

  let fontPx = mark.fontSizeRel * h;

  if (value.length > 0) {
    // Auto-shrink so the wrapped block fits both the box WIDTH and HEIGHT.
    const maxWidth = bw * 0.98;
    const maxHeight = bh * 0.98;

    let lines = layoutLines(ctx, value, fonts, fontPx, maxWidth, maxLines);
    for (let i = 0; i < 100 && fontPx > MIN_FONT_PX; i++) {
      const widest = widestLine(ctx, lines, fonts, fontPx);
      const lh = fontPx * lineHeight;
      const blockH = lines.length * lh;
      // For "middle" the FIRST line is pinned to the box centre and extra lines
      // grow downward (adding a line must never push earlier lines up). The
      // block therefore only has the space from the centre down to work with,
      // not the whole box — fit against that so it still can't overflow.
      const availH =
        mark.valign === "middle" ? maxHeight / 2 + lh / 2 : maxHeight;
      const widthRatio = widest > maxWidth ? maxWidth / widest : 1;
      const heightRatio = blockH > availH ? availH / blockH : 1;
      const ratio = Math.min(widthRatio, heightRatio);
      if (ratio >= 0.999) break; // already fits
      fontPx = Math.max(MIN_FONT_PX, fontPx * ratio * 0.98);
      lines = layoutLines(ctx, value, fonts, fontPx, maxWidth, maxLines);
    }

    ctx.fillStyle = mark.fontColor;
    ctx.textAlign = "left"; // runs are positioned manually (see drawLine)
    ctx.textBaseline = "middle";

    const lineH = fontPx * lineHeight;
    const blockH = lines.length * lineH;
    // Anchor by the FIRST line for top/middle so it stays put as lines are
    // added (they then grow downward); anchor by the LAST line for bottom.
    // Note the middle case uses lineH, NOT blockH: the first line's centre lands
    // at by + bh/2 regardless of how many lines follow.
    const blockTop =
      mark.valign === "top"
        ? by
        : mark.valign === "bottom"
          ? by + bh - blockH
          : by + (bh - lineH) / 2;

    lines.forEach((line, i) => {
      const lineWidth = measureLine(ctx, line, fonts, fontPx);
      const startX =
        mark.align === "left"
          ? bx
          : mark.align === "right"
            ? bx + bw - lineWidth
            : bx + (bw - lineWidth) / 2;
      drawLine(ctx, line, fonts, fontPx, startX, blockTop + lineH * i + lineH / 2);
    });
  }

  return fontPx;
}

/** Greedily word-wrap `value` to `maxWidth` at `fontPx`, capped at `maxLines`. */
function layoutLines(
  ctx: CanvasRenderingContext2D,
  value: string,
  fonts: ResolvedFonts,
  fontPx: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const measure = (s: string) => measureLine(ctx, s, fonts, fontPx);

  // Honour explicit line breaks as hard wraps, word-wrapping within each.
  const segments = value.split("\n");
  const lines: string[] = [];
  for (const seg of segments) {
    const words = seg.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const trial = `${current} ${words[i]}`;
      if (measure(trial) <= maxWidth) current = trial;
      else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }

  if (lines.length <= maxLines) return lines.length ? lines : [""];
  // Too many lines: keep the first (maxLines-1) and pack the rest onto the last,
  // letting the shrink loop scale the whole block down to fit.
  const head = lines.slice(0, maxLines - 1);
  const tail = lines.slice(maxLines - 1).join(" ");
  return [...head, tail];
}

function widestLine(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  fonts: ResolvedFonts,
  fontPx: number,
): number {
  let widest = 0;
  for (const line of lines) {
    const wpx = measureLine(ctx, line, fonts, fontPx);
    if (wpx > widest) widest = wpx;
  }
  return widest;
}

/** Convenience: load image + fonts, then render. Returns nothing. */
export async function renderInvitationFromUrl(
  canvas: HTMLCanvasElement,
  imageUrl: string,
  mark: Mark,
  text: string,
): Promise<void> {
  const image = await loadImage(imageUrl);
  const fontPx = mark.fontSizeRel * (image.naturalHeight || image.height);
  await ensureMarkFontsReady(mark, fontPx, text);
  renderInvitation(canvas, image, mark, text);
}
