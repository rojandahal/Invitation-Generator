"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import JSZip from "jszip";
import {
  ArrowLeft,
  Download,
  FileArchive,
  Link2,
  Loader2,
  Pencil,
  PenLine,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
  UserPlus,
} from "lucide-react";

import { baseImageUrl, generatedImageUrl } from "@/lib/cloudinary-url";
import {
  ensureMarkFontsReady,
  loadImage,
  renderInvitation,
  type Mark,
} from "@/lib/render";
import { runPool } from "@/lib/pool";
import { canvasToJpegBlob, downloadBlob, sanitizeFilename } from "@/lib/download";
import { uploadToCloudinary } from "@/lib/upload-client";
import {
  removeGuestAction,
  updateGuestTextAction,
} from "@/app/actions/guests";
import {
  resetGeneratedAction,
  saveGeneratedAction,
} from "@/app/actions/generate";
import { saveGenerateSettingsAction } from "@/app/actions/invitations";
import { AddPeopleDialog } from "./add-people-dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type GuestRow = {
  id: string;
  personId: string;
  name: string;
  nameEnglish: string;
  nameNepali: string;
  invitationText: string;
  // The auto-generated default text. When invitationText differs from this the
  // guest is "customized" and renders verbatim (ignoring language/honorifics).
  // Kept as data (not a snapshot flag) so the check stays live as the user edits.
  defaultText: string;
  status: "UNINVITED" | "GENERATED";
  generatedPublicId: string | null;
};

export type DetailInvitation = {
  id: string;
  title: string;
  marked: boolean;
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
  nameLanguage: "en" | "ne";
  namePrefixEn: string;
  namePrefixNe: string;
  nameSuffixEn: string;
  nameSuffixNe: string;
};

const RENDER_WIDTH = 2000;
const CONCURRENCY = 5;

type Language = "en" | "ne";

/** What the user picks in the Generate dialog for one generation run. */
type GenSettings = {
  language: Language;
  prefixEn: string;
  prefixNe: string;
  suffixEn: string;
  suffixNe: string;
};

/** The guest's name in the chosen language (Nepali falls back to English). */
function guestName(row: GuestRow, language: Language): string {
  if (language === "en") return row.nameEnglish.trim();
  return row.nameNepali.trim() || row.nameEnglish.trim();
}

/**
 * Whether the guest's text was hand-edited away from the auto default. Derived
 * live (not a stored flag) so it stays correct the instant the user edits the
 * text — otherwise a freshly saved multiline override would be ignored until a
 * full page refresh.
 */
function isCustomized(row: GuestRow): boolean {
  return row.invitationText.trim() !== row.defaultText.trim();
}

/**
 * The exact text printed for a guest: a hand-edited override is used verbatim
 * (preserving any line breaks); otherwise it's [prefix] [name] [suffix] in the
 * selected language, e.g. "श्री रोजन ज्यू" or "Mr Rojan".
 */
function composeForGen(row: GuestRow, s: GenSettings): string {
  if (isCustomized(row)) return row.invitationText.trim();
  const prefix = (s.language === "en" ? s.prefixEn : s.prefixNe).trim();
  const suffix = (s.language === "en" ? s.suffixEn : s.suffixNe).trim();
  return [prefix, guestName(row, s.language), suffix].filter(Boolean).join(" ");
}

function guestFilenameBase(row: GuestRow): string {
  return sanitizeFilename(row.nameEnglish.trim() || row.name);
}

export function InvitationDetail({
  invitation,
  guests,
  availablePeople,
}: {
  invitation: DetailInvitation;
  guests: GuestRow[];
  availablePeople: { id: string; name: string }[];
}) {
  const router = useRouter();

  // Local copy so generation can update statuses optimistically; re-synced
  // whenever the server sends fresh data.
  const [rows, setRows] = useState<GuestRow[]>(guests);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setRows(guests), [guests]);

  const [tab, setTab] = useState("guests");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<GuestRow | null>(null);
  const [removing, setRemoving] = useState<GuestRow | null>(null);
  // Non-null while the "Generate" dialog (Pre/Post honorifics) is open.
  const [genTargets, setGenTargets] = useState<GuestRow[] | null>(null);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(
    null,
  );

  // ---- base image (load once, memoized) ---------------------------------
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const basePromiseRef = useRef<Promise<HTMLImageElement> | null>(null);
  const baseUrl = baseImageUrl(
    invitation.baseImagePublicId,
    invitation.baseImageFormat,
    { width: RENDER_WIDTH },
  );

  function ensureBaseImage(): Promise<HTMLImageElement> {
    if (baseImgRef.current) return Promise.resolve(baseImgRef.current);
    if (!basePromiseRef.current) {
      basePromiseRef.current = loadImage(baseUrl).then((img) => {
        baseImgRef.current = img;
        return img;
      });
    }
    return basePromiseRef.current;
  }

  const mark: Mark = useMemo(
    () => ({
      markX: invitation.markX,
      markY: invitation.markY,
      markWidth: invitation.markWidth,
      markHeight: invitation.markHeight,
      fontFamily: invitation.fontFamily,
      fontFamilyNepali: invitation.fontFamilyNepali,
      fontSizeRel: invitation.fontSizeRel,
      fontColor: invitation.fontColor,
      fontWeight: invitation.fontWeight,
      fontItalic: invitation.fontItalic,
      lineHeightRel: invitation.lineHeightRel,
      align: invitation.align as Mark["align"],
      valign: invitation.valign as Mark["valign"],
      maxLines: invitation.maxLines,
    }),
    [invitation],
  );

  // ---- filtering ---------------------------------------------------------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.invitationText.toLowerCase().includes(q),
        )
      : rows;
  }, [rows, query]);

  // Once a guest is generated they leave the pending list and live only under
  // the "Generated" tab.
  const pendingRows = useMemo(
    () => filtered.filter((r) => r.status === "UNINVITED"),
    [filtered],
  );
  const generatedRows = useMemo(
    () => filtered.filter((r) => r.status === "GENERATED"),
    [filtered],
  );

  const counts = useMemo(() => {
    const generated = rows.filter((r) => r.status === "GENERATED").length;
    return { total: rows.length, generated, uninvited: rows.length - generated };
  }, [rows]);

  const busy = progress !== null || zipping !== null;

  // ---- selection ---------------------------------------------------------
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(list: GuestRow[]) {
    setSelected((prev) => {
      const allSelected = list.every((r) => prev.has(r.id));
      const next = new Set(prev);
      if (allSelected) list.forEach((r) => next.delete(r.id));
      else list.forEach((r) => next.add(r.id));
      return next;
    });
  }

  // ---- generation --------------------------------------------------------
  async function renderRowToBlob(
    image: HTMLImageElement,
    text: string,
  ): Promise<Blob> {
    const canvas = document.createElement("canvas");
    renderInvitation(canvas, image, mark, text);
    return canvasToJpegBlob(canvas, 0.9);
  }

  async function generateRows(targets: GuestRow[], settings: GenSettings) {
    if (!invitation.marked) {
      toast.error("Mark the name spot before generating.");
      return;
    }
    if (targets.length === 0) return;

    const image = await ensureBaseImage().catch((e) => {
      toast.error(e instanceof Error ? e.message : "Could not load base image.");
      return null;
    });
    if (!image) return;

    const fontPx = mark.fontSizeRel * (image.naturalHeight || image.height);
    await ensureMarkFontsReady(mark, fontPx, "अआ Aa");

    setProgress({ done: 0, total: targets.length });
    const { errors } = await runPool(
      targets,
      async (row) => {
        const blob = await renderRowToBlob(image, composeForGen(row, settings));
        const uploaded = await uploadToCloudinary(blob, "generated", {
          filename: `${guestFilenameBase(row)}.jpg`,
        });
        const res = await saveGeneratedAction({
          guestId: row.id,
          generatedPublicId: uploaded.publicId,
        });
        if (!res.ok) throw new Error(res.error);
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  status: "GENERATED",
                  generatedPublicId: uploaded.publicId,
                }
              : r,
          ),
        );
      },
      CONCURRENCY,
      (done, total) => setProgress({ done, total }),
    );
    setProgress(null);

    if (errors.length > 0) {
      toast.error(
        `${targets.length - errors.length} generated, ${errors.length} failed.`,
      );
    } else {
      toast.success(`Generated ${targets.length} invitation(s).`);
    }
    router.refresh();
  }

  // Open the generate dialog (where the user sets the optional Pre/Post text)
  // for the given targets. The dialog calls back into confirmGenerate.
  function requestGenerate(targets: GuestRow[]) {
    if (!invitation.marked) {
      toast.error("Mark the name spot before generating.");
      return;
    }
    if (targets.length === 0) return;
    setGenTargets(targets);
  }

  function generateSelected() {
    requestGenerate(rows.filter((r) => selected.has(r.id)));
  }

  async function confirmGenerate(settings: GenSettings) {
    const targets = genTargets ?? [];
    setGenTargets(null);
    // Remember the language + honorifics so they pre-fill next time.
    await saveGenerateSettingsAction({
      invitationId: invitation.id,
      nameLanguage: settings.language,
      namePrefixEn: settings.prefixEn,
      namePrefixNe: settings.prefixNe,
      nameSuffixEn: settings.suffixEn,
      nameSuffixNe: settings.suffixNe,
    }).catch(() => {});
    await generateRows(targets, settings);
  }

  // ---- downloads ---------------------------------------------------------
  async function downloadOne(row: GuestRow) {
    if (!row.generatedPublicId) return;
    try {
      const res = await fetch(generatedImageUrl(row.generatedPublicId));
      const blob = await res.blob();
      downloadBlob(blob, `${guestFilenameBase(row)}.jpg`);
    } catch {
      toast.error("Download failed.");
    }
  }

  async function downloadZip(targets: GuestRow[]) {
    const withImages = targets.filter((r) => r.generatedPublicId);
    if (withImages.length === 0) {
      toast.error("None of the selected guests are generated yet.");
      return;
    }
    setZipping({ done: 0, total: withImages.length });
    const zip = new JSZip();
    const used = new Map<string, number>();

    await runPool(
      withImages,
      async (row) => {
        const res = await fetch(generatedImageUrl(row.generatedPublicId!));
        const blob = await res.blob();
        let name = guestFilenameBase(row);
        const seen = used.get(name) ?? 0;
        used.set(name, seen + 1);
        if (seen > 0) name = `${name}_${seen + 1}`;
        zip.file(`${name}.jpg`, blob);
      },
      CONCURRENCY,
      (done, total) => setZipping({ done, total }),
    );

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${sanitizeFilename(invitation.title)}.zip`);
    setZipping(null);
    toast.success(`Zipped ${withImages.length} image(s).`);
  }

  function copyLink(row: GuestRow) {
    if (!row.generatedPublicId) return;
    navigator.clipboard
      .writeText(generatedImageUrl(row.generatedPublicId))
      .then(() => toast.success("Preview link copied."))
      .catch(() => toast.error("Couldn't copy link."));
  }

  // ---- guest text + remove ----------------------------------------------
  const [pendingMutation, startMutation] = useTransition();

  function regenerate(row: GuestRow) {
    requestGenerate([row]);
  }

  function reset(row: GuestRow) {
    startMutation(async () => {
      const res = await resetGeneratedAction({ guestId: row.id });
      if (res.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, status: "UNINVITED", generatedPublicId: null }
              : r,
          ),
        );
        toast.success("Reset to not generated.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function confirmRemove() {
    if (!removing) return;
    startMutation(async () => {
      const res = await removeGuestAction({ guestId: removing.id });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== removing.id));
        toast.success("Guest removed.");
        setRemoving(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  // ---- rendering helpers -------------------------------------------------
  // A render function (not a component) so it shares the closure without
  // remounting the table on every parent render.
  const renderGuestTable = (list: GuestRow[], emptyLabel: string) => {
    const allSelected = list.length > 0 && list.every((r) => selected.has(r.id));
    return (
      <div className="bg-card ring-gold/20 shadow-sm shadow-foreground/[0.03] overflow-hidden rounded-xl px-2 ring-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => toggleSelectAll(list)}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Guest</TableHead>
              <TableHead>Invitation text</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((row) => (
              <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => toggleSelect(row.id)}
                    aria-label={`Select ${row.name}`}
                  />
                </TableCell>
                <TableCell className="font-name font-medium">
                  {row.name}
                </TableCell>
                <TableCell className="font-name text-muted-foreground max-w-[18rem] truncate">
                  {row.invitationText}
                </TableCell>
                <TableCell>
                  {row.status === "GENERATED" ? (
                    <Badge variant="outline">
                      <Sparkles className="text-emerald-600" />
                      Generated
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not generated</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {row.status === "UNINVITED" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || !invitation.marked}
                        onClick={() => regenerate(row)}
                      >
                        <Sparkles />
                        Generate
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Download"
                          onClick={() => downloadOne(row)}
                        >
                          <Download />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Copy preview link"
                          onClick={() => copyLink(row)}
                        >
                          <Link2 />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Regenerate"
                          disabled={busy}
                          onClick={() => regenerate(row)}
                        >
                          <RefreshCw />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title="Reset"
                          disabled={busy || pendingMutation}
                          onClick={() => reset(row)}
                        >
                          <PenLine />
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Edit text"
                      onClick={() => setEditing(row)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Remove"
                      className="text-destructive"
                      onClick={() => setRemoving(row)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {list.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-10 text-center text-sm"
                >
                  {rows.length === 0
                    ? "No guests yet — add people to this invitation."
                    : query
                      ? "No guests match your search."
                      : emptyLabel}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    );
  };

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
          >
            <ArrowLeft className="size-3.5" />
            All invitations
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="font-heading max-w-xl text-3xl font-semibold tracking-tight text-balance">
              {invitation.title}
            </h1>
            <div className="flex gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/dashboard/${invitation.id}/mark`} />}
              >
                <PenLine />
                {invitation.marked ? "Edit mark" : "Mark name spot"}
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus />
                Add people
              </Button>
            </div>
          </div>
        </div>

        {/* stat strip — the counts as an editorial ledger */}
        <div className="flex items-center gap-5">
          {[
            { n: counts.total, label: counts.total === 1 ? "Guest" : "Guests" },
            { n: counts.generated, label: "Generated" },
            { n: counts.uninvited, label: "Pending" },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-5">
              {i > 0 ? (
                <span aria-hidden className="bg-gold/30 h-7 w-px" />
              ) : null}
              <div>
                <div className="font-heading text-foreground text-lg leading-none font-semibold tabular-nums">
                  {s.n}
                </div>
                <div className="eyebrow mt-1.5">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!invitation.marked ? (
        <div className="border-amber-300/60 bg-amber-50 text-amber-900 flex items-center gap-2 rounded-lg border p-3 text-sm dark:bg-amber-950/30 dark:text-amber-200">
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            Mark where the name should appear before generating.{" "}
            <Link
              href={`/dashboard/${invitation.id}/mark`}
              className="font-medium underline"
            >
              Mark it now
            </Link>
            .
          </span>
        </div>
      ) : null}

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guests…"
            className="pl-8"
          />
        </div>
        <Button
          variant="default"
          disabled={busy || selectedCount === 0 || !invitation.marked}
          onClick={generateSelected}
        >
          <Sparkles />
          Generate{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </Button>
        <Button
          variant="outline"
          disabled={busy || selectedCount === 0}
          onClick={() => downloadZip(rows.filter((r) => selected.has(r.id)))}
        >
          <FileArchive />
          Download .zip
        </Button>
      </div>

      {progress ? (
        <ProgressBar
          label={`Generating ${progress.done}/${progress.total}…`}
          done={progress.done}
          total={progress.total}
        />
      ) : null}
      {zipping ? (
        <ProgressBar
          label={`Zipping ${zipping.done}/${zipping.total}…`}
          done={zipping.done}
          total={zipping.total}
        />
      ) : null}

      {/* tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="mb-1 gap-4">
          <TabsTrigger value="guests">Pending ({counts.uninvited})</TabsTrigger>
          <TabsTrigger value="generated">
            Generated ({counts.generated})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="guests" className="mt-4">
          {renderGuestTable(
            pendingRows,
            "Everyone has been generated — see the Generated tab.",
          )}
        </TabsContent>
        <TabsContent value="generated" className="mt-4">
          {renderGuestTable(generatedRows, "No invitations generated yet.")}
        </TabsContent>
      </Tabs>

      {/* dialogs */}
      <AddPeopleDialog
        invitationId={invitation.id}
        people={availablePeople}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => setSelected(new Set())}
      />

      <EditTextDialog
        guest={editing}
        maxLines={invitation.maxLines}
        onClose={() => setEditing(null)}
        onSaved={(id, text) => {
          setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, invitationText: text } : r)),
          );
          router.refresh();
        }}
      />

      <GenerateDialog
        targets={genTargets}
        defaultLanguage={invitation.nameLanguage}
        defaultPrefixEn={invitation.namePrefixEn}
        defaultPrefixNe={invitation.namePrefixNe}
        defaultSuffixEn={invitation.nameSuffixEn}
        defaultSuffixNe={invitation.nameSuffixNe}
        onClose={() => setGenTargets(null)}
        onConfirm={confirmGenerate}
      />

      <Dialog
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o) setRemoving(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove guest?</DialogTitle>
            <DialogDescription>
              This removes “{removing?.name}” from this invitation and deletes
              any generated image for them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoving(null)}
              disabled={pendingMutation}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemove}
              disabled={pendingMutation}
            >
              {pendingMutation ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgressBar({
  label,
  done,
  total,
}: {
  label: string;
  done: number;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Progress value={total ? Math.round((done / total) * 100) : 0} />
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

/**
 * Keep at most `maxLines` lines: merge any overflow into the last allowed line,
 * mirroring how the renderer caps wrapping. For maxLines=1 this collapses every
 * line break to a space, so the field stays effectively single-line.
 */
function clampToLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  const head = lines.slice(0, maxLines - 1);
  const tail = lines.slice(maxLines - 1).join(" ");
  return [...head, tail].join("\n");
}

function EditTextDialog({
  guest,
  maxLines,
  onClose,
  onSaved,
}: {
  guest: GuestRow | null;
  maxLines: number;
  onClose: () => void;
  onSaved: (id: string, text: string) => void;
}) {
  const lines = Math.max(1, maxLines);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (guest) setText(guest.invitationText);
  }, [guest]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!guest) return;
    const value = clampToLines(text, lines).trim();
    startTransition(async () => {
      const res = await updateGuestTextAction({
        guestId: guest.id,
        invitationText: value,
      });
      if (res.ok) {
        toast.success("Updated.");
        onSaved(guest.id, value);
        onClose();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={guest !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit invitation text</DialogTitle>
          <DialogDescription>
            This is the exact text printed on {guest?.name}’s card.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="guest-text">Text</Label>
            <textarea
              id="guest-text"
              value={text}
              onChange={(e) => setText(clampToLines(e.target.value, lines))}
              rows={lines}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 font-name w-full resize-none rounded-lg border bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none focus-visible:ring-3 md:text-sm"
              autoFocus
            />
            <p className="text-muted-foreground text-xs">
              {lines > 1
                ? `Up to ${lines} lines — press Enter for a line break.`
                : "Single line for this card."}
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Picks the generation language and the optional honorifics around each name,
 * then kicks off generation. The whole text renders in the chosen language:
 * the name comes from each guest's English or Nepali name, and the honorifics
 * use that language's values. The preview shows the exact text for the first
 * target, e.g. "श्री रोजन ज्यू" or "Mr Rojan".
 */
function GenerateDialog({
  targets,
  defaultLanguage,
  defaultPrefixEn,
  defaultPrefixNe,
  defaultSuffixEn,
  defaultSuffixNe,
  onClose,
  onConfirm,
}: {
  targets: GuestRow[] | null;
  defaultLanguage: Language;
  defaultPrefixEn: string;
  defaultPrefixNe: string;
  defaultSuffixEn: string;
  defaultSuffixNe: string;
  onClose: () => void;
  onConfirm: (settings: GenSettings) => void;
}) {
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [prefixEn, setPrefixEn] = useState(defaultPrefixEn);
  const [prefixNe, setPrefixNe] = useState(defaultPrefixNe);
  const [suffixEn, setSuffixEn] = useState(defaultSuffixEn);
  const [suffixNe, setSuffixNe] = useState(defaultSuffixNe);

  useEffect(() => {
    // Re-seed from the saved settings each time the dialog opens.
    if (!targets) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLanguage(defaultLanguage);
    setPrefixEn(defaultPrefixEn);
    setPrefixNe(defaultPrefixNe);
    setSuffixEn(defaultSuffixEn);
    setSuffixNe(defaultSuffixNe);
  }, [
    targets,
    defaultLanguage,
    defaultPrefixEn,
    defaultPrefixNe,
    defaultSuffixEn,
    defaultSuffixNe,
  ]);

  const settings: GenSettings = { language, prefixEn, prefixNe, suffixEn, suffixNe };
  const count = targets?.length ?? 0;
  const first = targets?.[0];
  const preview = first ? composeForGen(first, settings) : "";

  // The prefix/suffix inputs edit whichever language is selected.
  const activePrefix = language === "en" ? prefixEn : prefixNe;
  const activeSuffix = language === "en" ? suffixEn : suffixNe;
  const setActivePrefix = language === "en" ? setPrefixEn : setPrefixNe;
  const setActiveSuffix = language === "en" ? setSuffixEn : setSuffixNe;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm(settings);
  }

  return (
    <Dialog open={targets !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate {count} invitation{count === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Pick the language and optional honorifics. Names come from each
            guest&apos;s English or Nepali name; the honorifics use the same
            language.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Language</Label>
            <div className="grid grid-cols-2 gap-1">
              <Button
                type="button"
                variant={language === "en" ? "default" : "outline"}
                onClick={() => setLanguage("en")}
              >
                English
              </Button>
              <Button
                type="button"
                variant={language === "ne" ? "default" : "outline"}
                className="font-name"
                onClick={() => setLanguage("ne")}
              >
                नेपाली
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="gen-prefix">Before the name</Label>
              <Input
                id="gen-prefix"
                value={activePrefix}
                onChange={(e) => setActivePrefix(e.target.value)}
                placeholder={language === "en" ? "Mr" : "श्री"}
                className="font-name"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="gen-suffix">After the name</Label>
              <Input
                id="gen-suffix"
                value={activeSuffix}
                onChange={(e) => setActiveSuffix(e.target.value)}
                placeholder={language === "en" ? "Jr" : "ज्यू"}
                className="font-name"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              Preview ({language === "en" ? "English" : "नेपाली"})
            </span>
            <div className="font-name bg-muted/50 rounded-lg border px-3 py-2 text-center text-base whitespace-pre-line">
              {preview}
            </div>
            {first && isCustomized(first) ? (
              <p className="text-muted-foreground text-xs">
                This guest has custom text, so it prints as-is (line breaks kept)
                regardless of language.
              </p>
            ) : count > 1 ? (
              <p className="text-muted-foreground text-xs">
                Applies to all {count} selected guests (each with their own name).
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              <Sparkles />
              Generate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
