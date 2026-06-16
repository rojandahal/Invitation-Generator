"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, UploadCloud } from "lucide-react";

import { uploadToCloudinary } from "@/lib/upload-client";
import { prepareBaseUpload } from "@/lib/image-prep";
import { combinePdfPages } from "@/lib/pdf-combine";
import { createInvitationAction } from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,application/pdf";
// Outer guard before we even try to process. Large images get auto-downscaled
// to fit Cloudinary's 10 MB image limit; this just blocks absurd files early.
const MAX_BYTES = 40 * 1024 * 1024; // 40 MB

export function CreateInvitationDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  // Multi-page PDFs are combined into one tall image before the invitation is
  // created — so marking only ever happens on the finished, combined card.
  const [phase, setPhase] = useState<"upload" | "combine" | "create">("upload");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTitle("");
    setFile(null);
    setProgress(0);
    setPhase("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) {
      toast.error("Give your invitation a title.");
      return;
    }
    if (!file) {
      toast.error("Choose an image or PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("File is larger than 40 MB. Please use a smaller file.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setPhase("upload");
    try {
      // Downscale/compress large images to fit Cloudinary's 10 MB limit.
      const prepared = await prepareBaseUpload(file);
      const uploaded = await uploadToCloudinary(prepared.blob, "base", {
        filename: prepared.filename,
        onProgress: (f) => setProgress(Math.round(f * 100)),
      });

      // What we'll store as the base image. For a multi-page PDF we stitch all
      // pages into one tall image and upload THAT instead of using page 1 only.
      let baseImagePublicId = uploaded.publicId;
      let baseImageFormat = uploaded.format;
      let baseImageWidth = uploaded.width;
      let baseImageHeight = uploaded.height;
      // Original source asset to discard once it's been combined (so the
      // throwaway PDF doesn't linger in Cloudinary after the card is built).
      let cleanupPublicId: string | undefined;

      const isPdf =
        uploaded.format?.toLowerCase() === "pdf" ||
        file.type === "application/pdf";
      if (isPdf && uploaded.pages > 1) {
        setPhase("combine");
        const combined = await combinePdfPages(
          uploaded.publicId,
          uploaded.pages,
        );

        setPhase("upload");
        setProgress(0);
        const combinedUpload = await uploadToCloudinary(combined.blob, "base", {
          filename: combined.filename,
          onProgress: (f) => setProgress(Math.round(f * 100)),
        });

        baseImagePublicId = combinedUpload.publicId;
        baseImageFormat = combinedUpload.format;
        baseImageWidth = combinedUpload.width || combined.width;
        baseImageHeight = combinedUpload.height || combined.height;
        cleanupPublicId = uploaded.publicId; // discard the original PDF
      }

      setPhase("create");
      const res = await createInvitationAction({
        title: title.trim(),
        baseImagePublicId,
        baseImageFormat,
        baseImageWidth,
        baseImageHeight,
        cleanupPublicId,
      });

      if (!res.ok) {
        toast.error(res.error);
        return;
      }

      toast.success("Invitation created — now mark the name spot.");
      setOpen(false);
      reset();
      router.push(`/dashboard/${res.data!.invitationId}/mark`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Upload failed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          setOpen(o);
          if (!o) reset();
        }
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus />
            Create invitation
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create invitation</DialogTitle>
          <DialogDescription>
            Upload your card as a PNG, JPG, or PDF. Multi-page PDFs are combined
            into one tall card.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-title">Title</Label>
            <Input
              id="inv-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Anita & Rohan — Reception"
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="inv-file">Base image / PDF</Label>
            <Input
              id="inv-file"
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-muted-foreground text-xs">
                {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            ) : null}
          </div>

          {busy ? (
            <div className="flex flex-col gap-1">
              <Progress value={phase === "combine" ? null : progress} />
              <p className="text-muted-foreground text-xs">
                {phase === "combine"
                  ? "Combining PDF pages into one card…"
                  : phase === "create"
                    ? "Finishing up…"
                    : `Uploading… ${progress}%`}
              </p>
            </div>
          ) : null}

          <Button type="submit" className="mt-2" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <UploadCloud />}
            {busy
              ? phase === "combine"
                ? "Combining pages…"
                : "Uploading…"
              : "Upload & continue"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
