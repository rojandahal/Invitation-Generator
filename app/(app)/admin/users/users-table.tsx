"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Ban, CircleCheck } from "lucide-react";
import type { Role, UserStatus } from "@prisma/client";

import {
  setUserRoleAction,
  setUserStatusAction,
} from "@/app/actions/users";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
};

export function UsersTable({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const disabled = user.status === "DISABLED";
            return (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="font-medium">{user.email}</div>
                  {user.name ? (
                    <div className="text-muted-foreground text-xs">
                      {user.name}
                    </div>
                  ) : null}
                  {isSelf ? (
                    <span className="text-muted-foreground text-xs">(you)</span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={disabled ? "destructive" : "outline"}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(user.createdAt)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setUserRoleAction({
                            userId: user.id,
                            role: user.role === "ADMIN" ? "USER" : "ADMIN",
                          }),
                        )
                      }
                    >
                      {user.role === "ADMIN" ? (
                        <>
                          <ShieldOff />
                          Make user
                        </>
                      ) : (
                        <>
                          <ShieldCheck />
                          Make admin
                        </>
                      )}
                    </Button>
                    <Button
                      variant={disabled ? "outline" : "destructive"}
                      size="sm"
                      disabled={pending || (isSelf && !disabled)}
                      onClick={() =>
                        run(() =>
                          setUserStatusAction({
                            userId: user.id,
                            status: disabled ? "ACTIVE" : "DISABLED",
                          }),
                        )
                      }
                    >
                      {disabled ? (
                        <>
                          <CircleCheck />
                          Enable
                        </>
                      ) : (
                        <>
                          <Ban />
                          Disable
                        </>
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
