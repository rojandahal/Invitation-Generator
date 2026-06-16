import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";

import { auth } from "./auth";
import { prisma } from "./prisma";

/**
 * The current, *authoritative* user. Re-reads the database on every call so a
 * user who was disabled (or deleted) after their token was issued is caught
 * immediately. Returns null for anonymous OR disabled users.
 *
 * Wrapped in React `cache` so multiple calls within one request hit the DB once.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.status === "DISABLED") return null;
  return user;
});

/** Require a signed-in, active user — otherwise redirect to login. */
export async function requireUser(): Promise<User> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/login");
  if (user.status === "DISABLED") redirect("/login?disabled=1");
  return user;
}

/** Require an active ADMIN — otherwise redirect appropriately. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
