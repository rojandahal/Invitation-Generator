"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Italic,
  Loader2,
  Save,
} from "lucide-react";

import { baseImageUrl } from "@/lib/cloudinary-url";
import {
  ensureMarkFontsReady,
  loadImage,
  renderInvitation,
  type Mark,
} from "@/lib/render";
import { fontsForScript, coerceFontKey } from "@/lib/fonts";
import { saveMarkAction } from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";

export type EditorInvitation = {
  id: string;
  title: string;
  baseImagePublicId: string;
  baseImageFormat: string;
  baseImageWidth: number;
  baseImageHeight: number;
  markX: number;
  markY: number;
  markWidth: number;
  markHeight: number;
  fontFamily: string;
  fontFamilyNepali: string;
  fontSizeRel: number;
  fontColor: string;
  fontWeight: number;
  fontItalic: boolean;
  lineHeightRel: number;
  align: string;
  valign: string;
  maxLines: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const LATIN_FONTS = fontsForScript("latin");
const NEPALI_FONTS = fontsForScript("nepali");

const WEIGHT_OPTIONS = [
  { value: 300, label: "Light" },
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extrabold" },
];

export function MarkingEditor({ invitation }: { invitation: EditorInvitation }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [sampleText, setSampleText] = useState("Rojan Dahal");
  const [saving, setSaving] = useState(false);

  const [mark, setMark] = useState<Mark>({
    markX: invitation.markX,
    markY: invitation.markY,
    markWidth: invitation.markWidth,
    markHeight: invitation.markHeight,
    fontFamily: coerceFontKey(invitation.fontFamily, "latin"),
    fontFamilyNepali: coerceFontKey(invitation.fontFamilyNepali, "nepali"),
    fontSizeRel: invitation.fontSizeRel,
    fontColor: invitation.fontColor,
    fontWeight: invitation.fontWeight ?? 600,
    fontItalic: invitation.fontItalic ?? false,
    lineHeightRel: invitation.lineHeightRel ?? 1.18,
    align: (invitation.align as Mark["align"]) ?? "center",
    valign: (invitation.valign as Mark["valign"]) ?? "middle",
    maxLines: invitation.maxLines ?? 2,
  });

  const imageUrl = baseImageUrl(
    invitation.baseImagePublicId,
    invitation.baseImageFormat,
    { width: 1600 },
  );

  // Load the base image once.
  useEffect(() => {
    let cancelled = false;
    loadImage(imageUrl)
      .then((img) => {
        if (!cancelled) setImage(img);
      })
      .catch((err) => {
        if (!cancelled) setImageError(err.message ?? "Failed to load image.");
      });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  // Redraw the preview whenever the mark, sample text, or image changes.
  useEffect(() => {
    if (!image) return;
    const raf = requestAnimationFrame(async () => {
      const fontPx = mark.fontSizeRel * (image.naturalHeight || image.height);
      await ensureMarkFontsReady(mark, fontPx, sampleText);
      if (canvasRef.current) renderInvitation(canvasRef.current, image, mark, sampleText);
    });
    return () => cancelAnimationFrame(raf);
  }, [image, mark, sampleText]);

  // ---- Drag / resize of the mark box ------------------------------------
  const dragRef = useRef<
    | null
    | {
        mode: "move" | "resize";
        startX: number;
        startY: number;
        rect: DOMRect;
        orig: { x: number; y: number; w: number; h: number };
      }
  >(null);

  function startDrag(mode: "move" | "resize", e: React.PointerEvent) {
    if (!stageRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      rect: stageRef.current.getBoundingClientRect(),
      orig: {
        x: mark.markX,
        y: mark.markY,
        w: mark.markWidth,
        h: mark.markHeight,
      },
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    if (d.mode === "move") {
      setMark((m) => ({
        ...m,
        markX: clamp(d.orig.x + dx, 0, 1 - m.markWidth),
        markY: clamp(d.orig.y + dy, 0, 1 - m.markHeight),
      }));
    } else {
      setMark((m) => ({
        ...m,
        markWidth: clamp(d.orig.w + dx, 0.03, 1 - m.markX),
        markHeight: clamp(d.orig.h + dy, 0.02, 1 - m.markY),
      }));
    }
  }

  function onPointerUp() {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  function save() {
    setSaving(true);
    saveMarkAction({ invitationId: invitation.id, ...mark })
      .then((res) => {
        if (res.ok) {
          toast.success("Mark saved.");
          router.refresh();
        } else {
          toast.error(res.error);
        }
      })
      .finally(() => setSaving(false));
  }

  const aspect = invitation.baseImageWidth / invitation.baseImageHeight || 4 / 3;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* Stage */}
      <div className="flex flex-col gap-3">
        {imageError ? (
          <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-xl border p-6 text-sm">
            {imageError}
          </div>
        ) : (
          <div
            ref={stageRef}
            className="bg-muted ring-gold/30 relative w-full overflow-hidden rounded-xl shadow-sm shadow-foreground/[0.04] ring-1 select-none"
            style={{ aspectRatio: String(aspect) }}
          >
            {!image ? (
              <Skeleton className="absolute inset-0" />
            ) : (
              <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
              />
            )}

            {image ? (
              <div
                onPointerDown={(e) => startDrag("move", e)}
                className="border-primary bg-primary/10 absolute touch-none rounded-sm border-2 border-dashed"
                style={{
                  left: `${mark.markX * 100}%`,
                  top: `${mark.markY * 100}%`,
                  width: `${mark.markWidth * 100}%`,
                  height: `${mark.markHeight * 100}%`,
                  cursor: "move",
                }}
              >
                <span className="bg-primary text-primary-foreground absolute -top-5 left-0 rounded px-1 text-[10px] leading-4 font-medium">
                  name
                </span>
                <div
                  onPointerDown={(e) => startDrag("resize", e)}
                  className="border-primary bg-background absolute -right-1.5 -bottom-1.5 size-3.5 rounded-sm border-2"
                  style={{ cursor: "nwse-resize" }}
                />
              </div>
            ) : null}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Drag the box to move it; drag the corner handle to resize. The preview
          shows your sample text exactly as guests will see it.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-card ring-gold/20 shadow-sm shadow-foreground/[0.03] flex h-fit flex-col gap-5 rounded-xl p-5 ring-1 lg:sticky lg:top-20">
        <p className="eyebrow text-primary">Mark &amp; style</p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sample">Preview text</Label>
          <textarea
            id="sample"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder="Type a sample name"
            rows={2}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 font-name w-full resize-none rounded-lg border bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none focus-visible:ring-3 md:text-sm"
          />
          <p className="text-muted-foreground text-xs">
            Long names wrap automatically; press Enter to force a line break.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="font-latin">English font (Latin)</Label>
          <NativeSelect
            id="font-latin"
            value={mark.fontFamily}
            onChange={(e) =>
              setMark((m) => ({ ...m, fontFamily: e.target.value }))
            }
          >
            {LATIN_FONTS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="font-nepali">Nepali font (Devanagari)</Label>
          <NativeSelect
            id="font-nepali"
            value={mark.fontFamilyNepali}
            onChange={(e) =>
              setMark((m) => ({ ...m, fontFamilyNepali: e.target.value }))
            }
          >
            {NEPALI_FONTS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
          <p className="text-muted-foreground text-xs">
            English and Nepali characters in the same name each use their own
            font.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="weight">Weight & style</Label>
          <div className="flex items-center gap-2">
            <NativeSelect
              id="weight"
              className="flex-1"
              value={mark.fontWeight}
              onChange={(e) =>
                setMark((m) => ({ ...m, fontWeight: Number(e.target.value) }))
              }
            >
              {WEIGHT_OPTIONS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label} ({w.value})
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              size="icon"
              variant={mark.fontItalic ? "default" : "outline"}
              title="Italic"
              aria-pressed={mark.fontItalic}
              onClick={() =>
                setMark((m) => ({ ...m, fontItalic: !m.fontItalic }))
              }
            >
              <Italic />
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Higher weight = bolder. Toggle italic on the right.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="size">
            Font size — {(mark.fontSizeRel * 100).toFixed(1)}% of height
          </Label>
          <input
            id="size"
            type="range"
            min={1}
            max={20}
            step={0.5}
            value={mark.fontSizeRel * 100}
            onChange={(e) =>
              setMark((m) => ({
                ...m,
                fontSizeRel: Number(e.target.value) / 100,
              }))
            }
            className="accent-primary w-full"
          />
          <p className="text-muted-foreground text-xs">
            Text auto-shrinks to fit the box width if a name is too long.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="color">Colour</Label>
          <div className="flex items-center gap-2">
            <input
              id="color"
              type="color"
              value={mark.fontColor}
              onChange={(e) =>
                setMark((m) => ({ ...m, fontColor: e.target.value }))
              }
              className="border-input h-8 w-12 rounded-md border bg-transparent"
            />
            <Input
              value={mark.fontColor}
              onChange={(e) =>
                setMark((m) => ({ ...m, fontColor: e.target.value }))
              }
              className="w-28 font-mono"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="linegap">
            Line gap — {(mark.lineHeightRel ?? 1.18).toFixed(2)}×
          </Label>
          <input
            id="linegap"
            type="range"
            min={0.9}
            max={2.5}
            step={0.05}
            value={mark.lineHeightRel ?? 1.18}
            onChange={(e) =>
              setMark((m) => ({ ...m, lineHeightRel: Number(e.target.value) }))
            }
            className="accent-primary w-full"
          />
          <p className="text-muted-foreground text-xs">
            Spacing between lines when a name wraps (needs Max lines &gt; 1).
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Horizontal align</Label>
          <div className="grid grid-cols-3 gap-1">
            {(
              [
                { v: "left", icon: AlignLeft },
                { v: "center", icon: AlignCenter },
                { v: "right", icon: AlignRight },
              ] as const
            ).map(({ v, icon: Icon }) => (
              <Button
                key={v}
                type="button"
                variant={mark.align === v ? "default" : "outline"}
                size="sm"
                onClick={() => setMark((m) => ({ ...m, align: v }))}
              >
                <Icon />
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Vertical align</Label>
          <div className="grid grid-cols-3 gap-1">
            {(["top", "middle", "bottom"] as const).map((v) => (
              <Button
                key={v}
                type="button"
                variant={mark.valign === v ? "default" : "outline"}
                size="sm"
                className="capitalize"
                onClick={() => setMark((m) => ({ ...m, valign: v }))}
              >
                {v}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Max lines</Label>
          <div className="grid grid-cols-3 gap-1">
            {([1, 2, 3] as const).map((n) => (
              <Button
                key={n}
                type="button"
                variant={mark.maxLines === n ? "default" : "outline"}
                size="sm"
                onClick={() => setMark((m) => ({ ...m, maxLines: n }))}
              >
                {n}
              </Button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Allow the name to wrap onto up to this many lines before shrinking.
          </p>
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <Button onClick={save} disabled={saving || !image}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            Save mark
          </Button>
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={`/dashboard/${invitation.id}`} />}
          >
            <ArrowLeft />
            Back to invitation
          </Button>
        </div>
      </div>
    </div>
  );
}
