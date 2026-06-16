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
import { saveNameAffixesAction } from "@/app/actions/invitations";
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
  invitationText: string;
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
  namePrefix: string;
  nameSuffix: string;
};

const RENDER_WIDTH = 2000;
const CONCURRENCY = 5;

/** Wrap the per-guest text with the optional honorifics, e.g. "श्री रोजन ज्यू". */
function composeText(prefix: string, text: string, suffix: string): string {
  return [prefix, text, suffix]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
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

  async function generateRows(
    targets: GuestRow[],
    prefix: string,
    suffix: string,
  ) {
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
        const blob = await renderRowToBlob(
          image,
          composeText(prefix, row.invitationText, suffix),
        );
        const uploaded = await uploadToCloudinary(blob, "generated", {
          filename: `${sanitizeFilename(row.name)}.jpg`,
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

  async function confirmGenerate(prefix: string, suffix: string) {
    const targets = genTargets ?? [];
    setGenTargets(null);
    // Remember the honorifics on the invitation so they pre-fill next time.
    await saveNameAffixesAction({
      invitationId: invitation.id,
      namePrefix: prefix,
      nameSuffix: suffix,
    }).catch(() => {});
    await generateRows(targets, prefix, suffix);
  }

  // ---- downloads ---------------------------------------------------------
  async function downloadOne(row: GuestRow) {
    if (!row.generatedPublicId) return;
    try {
      const res = await fetch(generatedImageUrl(row.generatedPublicId));
      const blob = await res.blob();
      downloadBlob(blob, `${sanitizeFilename(row.name)}.jpg`);
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
        let name = sanitizeFilename(row.name);
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
      <div className="rounded-xl border">
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
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-3.5" />
          All invitations
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold">
              {invitation.title}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {counts.total} guest{counts.total === 1 ? "" : "s"} ·{" "}
              {counts.generated} generated · {counts.uninvited} pending
            </p>
          </div>
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
        <TabsList>
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
        defaultPrefix={invitation.namePrefix}
        defaultSuffix={invitation.nameSuffix}
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
 * Asks for the optional honorifics to place before/after each name, then kicks
 * off generation. Both fields are optional; the preview shows the exact text
 * that will be printed, e.g. "श्री रोजन ज्यू" or "Mr Rojan Dahal".
 */
function GenerateDialog({
  targets,
  defaultPrefix,
  defaultSuffix,
  onClose,
  onConfirm,
}: {
  targets: GuestRow[] | null;
  defaultPrefix: string;
  defaultSuffix: string;
  onClose: () => void;
  onConfirm: (prefix: string, suffix: string) => void;
}) {
  const [prefix, setPrefix] = useState(defaultPrefix);
  const [suffix, setSuffix] = useState(defaultSuffix);

  useEffect(() => {
    // Re-seed from the saved honorifics each time the dialog opens.
    if (!targets) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefix(defaultPrefix);
    setSuffix(defaultSuffix);
  }, [targets, defaultPrefix, defaultSuffix]);

  const count = targets?.length ?? 0;
  const sampleName = targets?.[0]?.invitationText?.trim() || "नाम";
  const preview = composeText(prefix, sampleName, suffix);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onConfirm(prefix.trim(), suffix.trim());
  }

  return (
    <Dialog open={targets !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate {count} invitation{count === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Optionally add an honorific before and after each name. Leave blank to
            print just the name.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="gen-prefix">Before the name</Label>
              <Input
                id="gen-prefix"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder="श्री / Mr"
                className="font-name"
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="gen-suffix">After the name</Label>
              <Input
                id="gen-suffix"
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                placeholder="ज्यू / Jyu"
                className="font-name"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Preview</span>
            <div className="font-name bg-muted/50 rounded-lg border px-3 py-2 text-center text-base">
              {preview}
            </div>
            {count > 1 ? (
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
