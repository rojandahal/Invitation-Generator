"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CopyPlus,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";

import { deletePersonAction } from "@/app/actions/people";
import { attachToAllInvitationsAction } from "@/app/actions/guests";
import {
  PersonDialog,
  type EditablePerson,
} from "@/components/person-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export type PersonRow = {
  id: string;
  nameEnglish: string;
  nameNepali: string | null;
  salutation: string | null;
  invitationCount: number;
};

export function PeopleClient({
  people,
  invitationCount,
}: {
  people: PersonRow[];
  invitationCount: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EditablePerson | null>(null);
  const [deleting, setDeleting] = useState<PersonRow | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.nameEnglish.toLowerCase().includes(q) ||
        (p.nameNepali ?? "").toLowerCase().includes(q) ||
        (p.salutation ?? "").toLowerCase().includes(q),
    );
  }, [people, query]);

  function addToAll(person: PersonRow) {
    startTransition(async () => {
      const res = await attachToAllInvitationsAction({ personIds: [person.id] });
      if (res.ok) {
        toast.success(
          res.data!.added > 0
            ? `Added to ${res.data!.added} invitation(s).`
            : "Already on all invitations.",
        );
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    startTransition(async () => {
      const res = await deletePersonAction({ personId: deleting.id });
      if (res.ok) {
        toast.success("Person deleted.");
        setDeleting(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow text-primary mb-2.5">
            {people.length} {people.length === 1 ? "Contact" : "Contacts"}
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            People
          </h1>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Your master contact list. Attach people to invitations from here or
            from an invitation’s People tab.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Add person
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="pl-8"
        />
      </div>

      {people.length === 0 ? (
        <EmptyState onAdd={() => setCreateOpen(true)} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Nepali</TableHead>
                <TableHead>Salutation</TableHead>
                <TableHead>On invitations</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nameEnglish}</TableCell>
                  <TableCell className="font-name">
                    {p.nameNepali || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.salutation || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.invitationCount}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending || invitationCount === 0}
                        title={
                          invitationCount === 0
                            ? "Create an invitation first"
                            : "Add to all invitations"
                        }
                        onClick={() => addToAll(p)}
                      >
                        <CopyPlus />
                        <span className="hidden sm:inline">Add to all</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Edit"
                        onClick={() =>
                          setEditing({
                            id: p.id,
                            nameEnglish: p.nameEnglish,
                            nameNepali: p.nameNepali,
                            salutation: p.salutation,
                          })
                        }
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete"
                        className="text-destructive"
                        onClick={() => setDeleting(p)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground py-8 text-center text-sm"
                  >
                    No people match “{query}”.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}

      <PersonDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => router.refresh()}
      />
      <PersonDialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        person={editing}
        onSaved={() => router.refresh()}
      />

      <Dialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (!o) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete person?</DialogTitle>
            <DialogDescription>
              This removes “{deleting?.nameEnglish}” and detaches them from all
              invitations (including any generated images).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border-border/70 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
      <div className="bg-muted flex size-12 items-center justify-center rounded-full">
        <Users className="text-muted-foreground size-6" />
      </div>
      <div>
        <p className="font-medium">No people yet</p>
        <p className="text-muted-foreground text-sm">
          Add your guests once, then attach them to any invitation.
        </p>
      </div>
      <Button onClick={onAdd}>
        <Plus />
        Add person
      </Button>
    </div>
  );
}
