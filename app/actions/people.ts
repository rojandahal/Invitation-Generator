"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { findOwnedPerson } from "@/lib/ownership";
import {
  deletePersonSchema,
  personSchema,
  updatePersonSchema,
} from "@/lib/validators";
import { fail, firstZodError, ok, type ActionResult } from "@/lib/action-result";

function normalize(value?: string) {
  const v = value?.trim();
  return v && v.length > 0 ? v : null;
}

export async function createPersonAction(
  input: unknown,
): Promise<ActionResult<{ personId: string }>> {
  const user = await requireUser();

  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const person = await prisma.person.create({
    data: {
      userId: user.id,
      nameEnglish: parsed.data.nameEnglish,
      nameNepali: normalize(parsed.data.nameNepali),
      salutation: normalize(parsed.data.salutation),
    },
    select: { id: true },
  });

  revalidatePath("/people");
  return ok({ personId: person.id });
}

export async function updatePersonAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = updatePersonSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const owned = await findOwnedPerson(user.id, parsed.data.personId);
  if (!owned) return fail("Person not found.");

  await prisma.person.update({
    where: { id: owned.id },
    data: {
      nameEnglish: parsed.data.nameEnglish,
      nameNepali: normalize(parsed.data.nameNepali),
      salutation: normalize(parsed.data.salutation),
    },
  });

  revalidatePath("/people");
  return ok();
}

export async function deletePersonAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = deletePersonSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const owned = await findOwnedPerson(user.id, parsed.data.personId);
  if (!owned) return fail("Person not found.");

  // Cascade removes the InvitationGuest links (schema onDelete: Cascade).
  await prisma.person.delete({ where: { id: owned.id } });

  revalidatePath("/people");
  return ok();
}
