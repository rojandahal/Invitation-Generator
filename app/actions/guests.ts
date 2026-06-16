"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { destroyAssets } from "@/lib/cloudinary";
import { requireUser } from "@/lib/session";
import { findOwnedGuest, findOwnedInvitation } from "@/lib/ownership";
import { guestDefaultText } from "@/lib/person";
import {
  attachPeopleSchema,
  attachToAllInvitationsSchema,
  removeGuestSchema,
  updateGuestTextSchema,
} from "@/lib/validators";
import { fail, firstZodError, ok, type ActionResult } from "@/lib/action-result";

export async function attachPeopleAction(
  input: unknown,
): Promise<ActionResult<{ added: number }>> {
  const user = await requireUser();

  const parsed = attachPeopleSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const invitation = await findOwnedInvitation(
    user.id,
    parsed.data.invitationId,
  );
  if (!invitation) return fail("Invitation not found.");

  // Only attach people that actually belong to this user.
  const people = await prisma.person.findMany({
    where: { id: { in: parsed.data.personIds }, userId: user.id },
  });

  const result = await prisma.invitationGuest.createMany({
    data: people.map((p) => ({
      invitationId: invitation.id,
      personId: p.id,
      invitationText: guestDefaultText(p),
    })),
    skipDuplicates: true,
  });

  revalidatePath(`/dashboard/${invitation.id}`);
  revalidatePath("/dashboard");
  return ok({ added: result.count });
}

export async function attachToAllInvitationsAction(
  input: unknown,
): Promise<ActionResult<{ added: number }>> {
  const user = await requireUser();

  const parsed = attachToAllInvitationsSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const [people, invitations] = await Promise.all([
    prisma.person.findMany({
      where: { id: { in: parsed.data.personIds }, userId: user.id },
    }),
    prisma.invitation.findMany({
      where: { userId: user.id },
      select: { id: true },
    }),
  ]);

  if (invitations.length === 0) return fail("You have no invitations yet.");

  const data = invitations.flatMap((inv) =>
    people.map((p) => ({
      invitationId: inv.id,
      personId: p.id,
      invitationText: guestDefaultText(p),
    })),
  );

  const result = await prisma.invitationGuest.createMany({
    data,
    skipDuplicates: true,
  });

  revalidatePath("/dashboard");
  invitations.forEach((inv) => revalidatePath(`/dashboard/${inv.id}`));
  return ok({ added: result.count });
}

export async function updateGuestTextAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = updateGuestTextSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const guest = await findOwnedGuest(user.id, parsed.data.guestId);
  if (!guest) return fail("Guest not found.");

  await prisma.invitationGuest.update({
    where: { id: guest.id },
    data: { invitationText: parsed.data.invitationText },
  });

  revalidatePath(`/dashboard/${guest.invitationId}`);
  return ok();
}

export async function removeGuestAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = removeGuestSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const guest = await findOwnedGuest(user.id, parsed.data.guestId);
  if (!guest) return fail("Guest not found.");

  if (guest.generatedPublicId) {
    await destroyAssets([guest.generatedPublicId], "remove-guest");
  }

  await prisma.invitationGuest.delete({ where: { id: guest.id } });

  revalidatePath(`/dashboard/${guest.invitationId}`);
  revalidatePath("/dashboard");
  return ok();
}
