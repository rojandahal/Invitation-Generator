"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { destroyAssets } from "@/lib/cloudinary";
import { requireUser } from "@/lib/session";
import { findOwnedGuest } from "@/lib/ownership";
import { resetGeneratedSchema, saveGeneratedSchema } from "@/lib/validators";
import { fail, firstZodError, ok, type ActionResult } from "@/lib/action-result";

/**
 * Persist the result of a browser-side render: mark the guest GENERATED and
 * store the Cloudinary public_id. If they had a previous image, destroy it.
 */
export async function saveGeneratedAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = saveGeneratedSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const guest = await findOwnedGuest(user.id, parsed.data.guestId);
  if (!guest) return fail("Guest not found.");

  // Regeneration uploads a brand-new asset (unique public_id), so the previous
  // render is now orphaned — delete it so Cloudinary isn't left holding stale
  // generated images.
  if (
    guest.generatedPublicId &&
    guest.generatedPublicId !== parsed.data.generatedPublicId
  ) {
    await destroyAssets([guest.generatedPublicId], "regenerate");
  }

  await prisma.invitationGuest.update({
    where: { id: guest.id },
    data: {
      status: "GENERATED",
      generatedPublicId: parsed.data.generatedPublicId,
      generatedAt: new Date(),
    },
  });

  revalidatePath(`/dashboard/${guest.invitationId}`);
  revalidatePath("/dashboard");
  return ok();
}

export async function resetGeneratedAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = resetGeneratedSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const guest = await findOwnedGuest(user.id, parsed.data.guestId);
  if (!guest) return fail("Guest not found.");

  if (guest.generatedPublicId) {
    await destroyAssets([guest.generatedPublicId], "reset");
  }

  await prisma.invitationGuest.update({
    where: { id: guest.id },
    data: { status: "UNINVITED", generatedPublicId: null, generatedAt: null },
  });

  revalidatePath(`/dashboard/${guest.invitationId}`);
  revalidatePath("/dashboard");
  return ok();
}
