"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import {
  createUserSchema,
  setUserRoleSchema,
  setUserStatusSchema,
} from "@/lib/validators";
import { fail, firstZodError, ok, type ActionResult } from "@/lib/action-result";

export async function createUserAction(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const { email, name, password, role } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.user.create({
      data: {
        email,
        name: name && name.length > 0 ? name : null,
        passwordHash,
        role,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail("A user with that email already exists.");
    }
    throw error;
  }

  revalidatePath("/admin/users");
  return ok();
}

export async function setUserStatusAction(
  input: unknown,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = setUserStatusSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const { userId, status } = parsed.data;
  if (userId === admin.id && status === "DISABLED") {
    return fail("You can't disable your own account.");
  }

  await prisma.user.update({ where: { id: userId }, data: { status } });
  revalidatePath("/admin/users");
  return ok();
}

export async function setUserRoleAction(input: unknown): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = setUserRoleSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const { userId, role } = parsed.data;
  if (userId === admin.id && role !== "ADMIN") {
    return fail("You can't remove your own admin role.");
  }

  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
  return ok();
}

export async function resetPasswordAction(input: {
  userId: string;
  password: string;
}): Promise<ActionResult> {
  await requireAdmin();

  if (!input?.userId || typeof input.password !== "string") {
    return fail("Invalid input.");
  }
  if (input.password.length < 8) {
    return fail("Use at least 8 characters.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  await prisma.user.update({
    where: { id: input.userId },
    data: { passwordHash },
  });
  return ok();
}
