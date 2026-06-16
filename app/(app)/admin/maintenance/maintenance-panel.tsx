"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Trash2, TriangleAlert } from "lucide-react";

import {
  deleteOrphanedAssetsAction,
  scanOrphanedAssetsAction,
  type OrphanScan,
} from "@/app/actions/maintenance";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

export function MaintenancePanel() {
  const [scan, setScan] = useState<OrphanScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function runScan() {
    setScanning(true);
    try {
      const res = await scanOrphanedAssetsAction();
      if (res.ok && res.data) {
        setScan(res.data);
        // Pre-select every orphan — deleting all of them is the common case.
        setSelected(new Set(res.data.orphans.map((o) => o.publicId)));
        toast.success(
          res.data.orphans.length === 0
            ? "No orphaned images — storage is clean."
            : `Found ${res.data.orphans.length} orphaned image(s).`,
        );
      } else if (!res.ok) {
        toast.error(res.error);
      }
    } finally {
      setScanning(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!scan) return;
    setSelected((prev) =>
      prev.size === scan.orphans.length
        ? new Set()
        : new Set(scan.orphans.map((o) => o.publicId)),
    );
  }

  async function runDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await deleteOrphanedAssetsAction({
        publicIds: Array.from(selected),
      });
      if (res.ok && res.data) {
        toast.success(`Deleted ${res.data.deleted} image(s).`);
        setConfirmOpen(false);
        await runScan(); // refresh counts from Cloudinary
      } else if (!res.ok) {
        toast.error(res.error);
      }
    } finally {
      setDeleting(false);
    }
  }

  const selectedBytes = scan
    ? scan.orphans
        .filter((o) => selected.has(o.publicId))
        .reduce((sum, o) => sum + o.bytes, 0)
    : 0;

  const allSelected =
    scan !== null && scan.orphans.length > 0 && selected.size === scan.orphans.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runScan} disabled={scanning || deleting}>
          {scanning ? <Loader2 className="animate-spin" /> : <Search />}
          {scan ? "Re-scan" : "Scan for orphaned images"}
        </Button>
        {scan ? (
          <Button
            variant="destructive"
            disabled={scanning || deleting || selected.size === 0}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 />
            Delete selected ({selected.size})
          </Button>
        ) : null}
      </div>

      {scan ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Generated assets" value={String(scan.scanned)} />
            <Stat label="Still in use" value={String(scan.referenced)} />
            <Stat
              label="Orphaned"
              value={String(scan.orphans.length)}
              hint={formatBytes(scan.totalBytes)}
            />
            <Stat
              label="Reclaim (selected)"
              value={formatBytes(selectedBytes)}
            />
          </div>

          {scan.skippedRecent > 0 ? (
            <p className="text-muted-foreground text-xs">
              {scan.skippedRecent} very recent upload(s) were left out to avoid
              touching in-flight generations.
            </p>
          ) : null}

          {scan.orphans.length === 0 ? (
            <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
              No orphaned images. Every generated image is linked to a guest.
            </div>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Image (Cloudinary public ID)</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scan.orphans.map((o) => (
                    <TableRow
                      key={o.publicId}
                      data-state={selected.has(o.publicId) ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(o.publicId)}
                          onCheckedChange={() => toggle(o.publicId)}
                          aria-label={`Select ${o.publicId}`}
                        />
                      </TableCell>
                      <TableCell className="max-w-[28rem] truncate font-mono text-xs">
                        {o.publicId}
                      </TableCell>
                      <TableCell className="text-right text-sm whitespace-nowrap">
                        {formatBytes(o.bytes)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {o.createdAt ? formatDateTime(o.createdAt) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      ) : (
        <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          Run a scan to list generated images that are no longer linked to any
          guest.
        </div>
      )}

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => !deleting && setConfirmOpen(o)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="text-destructive size-5" />
              Delete {selected.size} image(s)?
            </DialogTitle>
            <DialogDescription>
              This permanently removes {selected.size} generated image
              {selected.size === 1 ? "" : "s"} ({formatBytes(selectedBytes)})
              from Cloudinary. References are re-checked first, so any image
              linked to a guest again is skipped. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={runDelete} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? (
        <Badge variant="secondary" className="mt-1 font-normal">
          {hint}
        </Badge>
      ) : null}
    </div>
  );
}
