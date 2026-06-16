"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";

import { createPersonAction, updatePersonAction } from "@/app/actions/people";
import { transliterateToNepali } from "@/lib/transliterate-client";
import { NepaliInput } from "@/components/nepali-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type EditablePerson = {
  id: string;
  nameEnglish: string;
  nameNepali: string | null;
  salutation: string | null;
};

export function PersonDialog({
  open,
  onOpenChange,
  person,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person?: EditablePerson | null;
  onSaved?: () => void;
}) {
  const isEdit = Boolean(person);
  const [nameEnglish, setNameEnglish] = useState("");
  const [nameNepali, setNameNepali] = useState("");
  const [salutation, setSalutation] = useState("");
  const [autoFilling, setAutoFilling] = useState(false);
  const [pending, startTransition] = useTransition();

  // Once the user edits the Nepali field by hand, stop auto-overwriting it from
  // the English name — they're correcting it manually. Clearing it counts as a
  // manual edit too, so "remove and type again in Nepali" works.
  const nepaliTouched = useRef(false);

  useEffect(() => {
    if (open) {
      // Seed the form when the dialog opens (intentional prop → state sync).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNameEnglish(person?.nameEnglish ?? "");
      setNameNepali(person?.nameNepali ?? "");
      setSalutation(person?.salutation ?? "");
      // An existing Nepali name is treated as user-owned (don't clobber it).
      nepaliTouched.current = Boolean(person?.nameNepali?.trim());
    }
  }, [open, person]);

  // Auto-transliterate the English name → Nepali as the user types, until they
  // take over the Nepali field manually.
  useEffect(() => {
    if (!open || nepaliTouched.current) return;
    const english = nameEnglish.trim();
    if (!english) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNameNepali("");
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const nepali = await transliterateToNepali(english, controller.signal);
      if (nepali && !nepaliTouched.current) setNameNepali(nepali);
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [nameEnglish, open]);

  function onNepaliChange(value: string) {
    nepaliTouched.current = true;
    setNameNepali(value);
  }

  async function autoFillFromEnglish() {
    const english = nameEnglish.trim();
    if (!english) {
      toast.error("Type the English name first.");
      return;
    }
    setAutoFilling(true);
    const nepali = await transliterateToNepali(english);
    setAutoFilling(false);
    if (nepali) {
      // Re-enable live auto-translation from English after a manual reset.
      nepaliTouched.current = false;
      setNameNepali(nepali);
    } else {
      toast.error("Couldn't transliterate — type the Nepali name manually.");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const payload = {
        nameEnglish: nameEnglish.trim(),
        nameNepali: nameNepali.trim(),
        salutation: salutation.trim(),
      };
      const res =
        isEdit && person
          ? await updatePersonAction({ personId: person.id, ...payload })
          : await createPersonAction(payload);
      if (res.ok) {
        toast.success(isEdit ? "Person updated." : "Person added.");
        onOpenChange(false);
        onSaved?.();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit person" : "Add person"}</DialogTitle>
          <DialogDescription>
            Type the English name — the Nepali name fills in automatically. The
            Nepali name is what’s printed on invitations when present.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="p-name-en">Name (English)</Label>
            <Input
              id="p-name-en"
              value={nameEnglish}
              onChange={(e) => setNameEnglish(e.target.value)}
              placeholder="Anita Sharma"
              className="font-name"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="p-name-ne">Name (Nepali / Devanagari)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={autoFilling || !nameEnglish.trim()}
                onClick={autoFillFromEnglish}
              >
                {autoFilling ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Wand2 />
                )}
                Auto from English
              </Button>
            </div>
            <NepaliInput
              id="p-name-ne"
              value={nameNepali}
              onChange={onNepaliChange}
              placeholder="Type romanized, e.g. anita → अनिता"
            />
            <p className="text-muted-foreground text-xs">
              Auto-filled from the English name. Clear it and retype (or pick a
              suggestion) to correct the spelling.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="p-sal">Salutation (optional)</Label>
            <Input
              id="p-sal"
              value={salutation}
              onChange={(e) => setSalutation(e.target.value)}
              placeholder="Mr / Mrs / श्री / श्रीमती"
              list="salutation-options"
            />
            <datalist id="salutation-options">
              <option value="Mr" />
              <option value="Mrs" />
              <option value="Ms" />
              <option value="Dr" />
              <option value="श्री" />
              <option value="श्रीमती" />
              <option value="सुश्री" />
            </datalist>
          </div>

          <DialogFooter className="mt-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {isEdit ? "Save changes" : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
