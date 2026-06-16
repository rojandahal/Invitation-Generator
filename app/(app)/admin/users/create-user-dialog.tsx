"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";

import { createUserAction } from "@/app/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function CreateUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await createUserAction({
        email: formData.get("email"),
        name: formData.get("name"),
        password: formData.get("password"),
        role: formData.get("role"),
      });
      if (res.ok) {
        toast.success("User created.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <UserPlus />
            Create user
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            They’ll sign in with this email and temporary password.
          </DialogDescription>
        </DialogHeader>

        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cu-email">Email</Label>
            <Input
              id="cu-email"
              name="email"
              type="email"
              placeholder="person@example.com"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cu-name">Name (optional)</Label>
            <Input id="cu-name" name="name" placeholder="Full name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cu-password">Temporary password</Label>
            <Input
              id="cu-password"
              name="password"
              type="text"
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cu-role">Role</Label>
            <NativeSelect id="cu-role" name="role" defaultValue="USER">
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </NativeSelect>
          </div>

          <DialogFooter className="mt-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
