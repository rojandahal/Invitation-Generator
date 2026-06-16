import { requireAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { CreateUserDialog } from "./create-user-dialog";
import { UsersTable, type AdminUserRow } from "./users-table";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  const rows: AdminUserRow[] = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Users</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create accounts, change roles, and enable or disable access.
          </p>
        </div>
        <CreateUserDialog />
      </div>

      <UsersTable users={rows} currentUserId={admin.id} />
    </div>
  );
}
