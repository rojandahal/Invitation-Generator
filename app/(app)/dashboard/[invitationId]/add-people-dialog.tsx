"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

import { attachPeopleAction } from "@/app/actions/guests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SelectablePerson = { id: string; name: string };

export function AddPeopleDialog({
  invitationId,
  people,
  open,
  onOpenChange,
  onAdded,
}: {
  invitationId: string;
  people: SelectablePerson[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  }, [people, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (selected.size === 0) return;
    startTransition(async () => {
      const res = await attachPeopleAction({
        invitationId,
        personIds: [...selected],
      });
      if (res.ok) {
        toast.success(`Added ${res.data!.added} guest(s).`);
        setSelected(new Set());
        setQuery("");
        onOpenChange(false);
        onAdded();
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add people to this invitation</DialogTitle>
          <DialogDescription>
            Pick from your contacts. Each becomes a guest you can generate for.
          </DialogDescription>
        </DialogHeader>

        {people.length === 0 ? (
          <div className="text-muted-foreground py-6 text-center text-sm">
            Everyone in your list is already added.{" "}
            <Link href="/people" className="text-foreground underline">
              Add more people
            </Link>
            .
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search contacts…"
                className="pl-8"
              />
            </div>

            <div className="max-h-72 overflow-auto rounded-lg border">
              {filtered.map((p) => (
                <label
                  key={p.id}
                  className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 border-b px-3 py-2 last:border-b-0"
                >
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={() => toggle(p.id)}
                  />
                  <span className="font-name text-sm">{p.name}</span>
                </label>
              ))}
              {filtered.length === 0 ? (
                <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                  No matches.
                </p>
              ) : null}
            </div>
          </>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || selected.size === 0}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            Add {selected.size > 0 ? selected.size : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
