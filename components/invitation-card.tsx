"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MoreVertical,
  Pencil,
  Trash2,
  ImageOff,
  Loader2,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";

import { baseImageUrl } from "@/lib/cloudinary-url";
import {
  deleteInvitationAction,
  renameInvitationAction,
} from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type InvitationCardData = {
  id: string;
  title: string;
  baseImagePublicId: string;
  baseImageFormat: string;
  marked: boolean;
  guestCount: number;
  generatedCount: number;
};

export function InvitationCard({ invitation }: { invitation: InvitationCardData }) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(invitation.title);
  const [pending, startTransition] = useTransition();

  function doRename(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await renameInvitationAction({
        invitationId: invitation.id,
        title: title.trim(),
      });
      if (res.ok) {
        toast.success("Renamed.");
        setRenameOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function doDelete() {
    startTransition(async () => {
      const res = await deleteInvitationAction({ invitationId: invitation.id });
      if (res.ok) {
        toast.success("Invitation deleted.");
        setDeleteOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="group bg-card flex flex-col overflow-hidden rounded-xl border">
      <Link
        href={`/dashboard/${invitation.id}`}
        className="bg-muted relative flex aspect-[4/3] items-center justify-center overflow-hidden"
      >
        {invitation.baseImagePublicId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={baseImageUrl(invitation.baseImagePublicId, invitation.baseImageFormat, {
              width: 600,
            })}
            alt={invitation.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <ImageOff className="text-muted-foreground size-8" />
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/dashboard/${invitation.id}`}
            className="font-heading line-clamp-2 font-medium hover:underline"
          >
            {invitation.title}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label="Actions">
                  <MoreVertical />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                <Pencil />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {invitation.marked ? (
            <Badge variant="outline">
              <CheckCircle2 className="text-emerald-600" />
              Marked
            </Badge>
          ) : (
            <Badge variant="secondary">
              <CircleDashed />
              Not marked yet
            </Badge>
          )}
          <span className="text-muted-foreground text-xs">
            {invitation.guestCount} guest{invitation.guestCount === 1 ? "" : "s"}
            {invitation.generatedCount > 0
              ? ` · ${invitation.generatedCount} generated`
              : ""}
          </span>
        </div>

        <div className="mt-auto flex gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            nativeButton={false}
            render={<Link href={`/dashboard/${invitation.id}/mark`} />}
          >
            {invitation.marked ? "Edit mark" : "Mark name spot"}
          </Button>
          <Button
            size="sm"
            className="flex-1"
            nativeButton={false}
            render={<Link href={`/dashboard/${invitation.id}`} />}
          >
            Open
          </Button>
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename invitation</DialogTitle>
          </DialogHeader>
          <form onSubmit={doRename} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`rename-${invitation.id}`}>Title</Label>
              <Input
                id={`rename-${invitation.id}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
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

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete invitation?</DialogTitle>
            <DialogDescription>
              This permanently removes “{invitation.title}”, its guest list, and
              all generated images. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
