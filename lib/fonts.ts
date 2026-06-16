/**
 * Font registry shared by the marking editor and the renderer.
 *
 * The DB stores stable font KEYs (e.g. "NotoSansDevanagari"). At render time we
 * resolve a key to a concrete CSS font-family string. For fonts loaded via
 * next/font we read the generated CSS variable off the document root so
 * <canvas> can reference the exact (hashed) family name.
 *
 * Fonts are grouped by SCRIPT. An invitation picks one Latin font (for English
 * text) and one Devanagari font (for Nepali text); the renderer splits the text
 * into script runs and draws each run with its own font (see lib/render.ts).
 */

export type FontScript = "latin" | "nepali";

export interface FontOption {
  key: string;
  label: string;
  /** Which script this font is offered for. */
  script: FontScript;
  /** CSS variable set by next/font, if any. */
  cssVar?: string;
  /** Fallback family list when the variable is unavailable. */
  fallback: string;
}

export const FONT_OPTIONS: FontOption[] = [
  // --- Latin / English -----------------------------------------------------
  {
    key: "Sans",
    label: "Sans (Geist)",
    script: "latin",
    cssVar: "--font-sans",
    fallback: "system-ui, sans-serif",
  },
  {
    key: "Serif",
    label: "Serif (Playfair Display)",
    script: "latin",
    cssVar: "--font-playfair",
    fallback: "Georgia, 'Times New Roman', serif",
  },
  {
    key: "Script",
    label: "Script (Great Vibes)",
    script: "latin",
    cssVar: "--font-greatvibes",
    fallback: "'Brush Script MT', cursive",
  },
  // --- Nepali / Devanagari -------------------------------------------------
  {
    key: "NotoSansDevanagari",
    label: "Noto Sans Devanagari (नेपाली)",
    script: "nepali",
    cssVar: "--font-devanagari",
    fallback: "'Noto Sans Devanagari', sans-serif",
  },
  {
    key: "NotoSerifDevanagari",
    label: "Noto Serif Devanagari (नेपाली)",
    script: "nepali",
    cssVar: "--font-noto-serif-devanagari",
    fallback: "'Noto Serif Devanagari', serif",
  },
  {
    key: "Mukta",
    label: "Mukta (नेपाली)",
    script: "nepali",
    cssVar: "--font-mukta",
    fallback: "'Mukta', sans-serif",
  },
];

export const DEFAULT_LATIN_FONT_KEY = "Sans";
export const DEFAULT_NEPALI_FONT_KEY = "NotoSansDevanagari";

export function defaultFontKey(script: FontScript): string {
  return script === "nepali" ? DEFAULT_NEPALI_FONT_KEY : DEFAULT_LATIN_FONT_KEY;
}

export function fontsForScript(script: FontScript): FontOption[] {
  return FONT_OPTIONS.filter((f) => f.script === script);
}

export function getFontOption(key: string): FontOption | undefined {
  return FONT_OPTIONS.find((f) => f.key === key);
}

/**
 * Return `key` if it names a font offered for `script`; otherwise fall back to
 * that script's default. Keeps older invitations (which stored a single
 * `fontFamily`) selectable in the right dropdown.
 */
export function coerceFontKey(key: string, script: FontScript): string {
  const option = getFontOption(key);
  if (option && option.script === script) return key;
  return defaultFontKey(script);
}

/**
 * Resolve a font key to a concrete CSS font-family string usable in
 * `ctx.font`. Browser-only (reads computed styles); falls back gracefully.
 */
export function resolveFontFamily(key: string): string {
  const option = getFontOption(key) ?? FONT_OPTIONS[0];
  if (typeof window !== "undefined" && option.cssVar) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(option.cssVar)
      .trim();
    if (value) return value;
  }
  return option.fallback;
}
