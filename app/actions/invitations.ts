"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { CLOUDINARY_FOLDER, destroyAssets } from "@/lib/cloudinary";
import { requireUser } from "@/lib/session";
import { findOwnedInvitation } from "@/lib/ownership";
import {
  createInvitationSchema,
  deleteInvitationSchema,
  renameInvitationSchema,
  saveMarkSchema,
  saveGenerateSettingsSchema,
} from "@/lib/validators";
import { fail, firstZodError, ok, type ActionResult } from "@/lib/action-result";

export async function createInvitationAction(
  input: unknown,
): Promise<ActionResult<{ invitationId: string }>> {
  const user = await requireUser();

  const parsed = createInvitationSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const invitation = await prisma.invitation.create({
    data: {
      userId: user.id,
      title: parsed.data.title,
      baseImagePublicId: parsed.data.baseImagePublicId,
      baseImageFormat: parsed.data.baseImageFormat,
      baseImageWidth: parsed.data.baseImageWidth,
      baseImageHeight: parsed.data.baseImageHeight,
    },
    select: { id: true },
  });

  // Clean up the throwaway source (the original PDF we stitched into one image).
  // Scoped to the user's own folder so a client can't delete others' assets.
  const cleanupId = parsed.data.cleanupPublicId;
  if (
    cleanupId &&
    cleanupId !== parsed.data.baseImagePublicId &&
    cleanupId.startsWith(`${CLOUDINARY_FOLDER}/${user.id}/`)
  ) {
    await destroyAssets([cleanupId], "create-cleanup");
  }

  revalidatePath("/dashboard");
  return ok({ invitationId: invitation.id });
}

export async function saveMarkAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = saveMarkSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const owned = await findOwnedInvitation(user.id, parsed.data.invitationId);
  if (!owned) return fail("Invitation not found.");

  const {
    markX,
    markY,
    markWidth,
    markHeight,
    fontFamily,
    fontFamilyNepali,
    fontSizeRel,
    fontColor,
    fontWeight,
    fontItalic,
    lineHeightRel,
    align,
    valign,
    maxLines,
  } = parsed.data;
  await prisma.invitation.update({
    where: { id: owned.id },
    data: {
      markX,
      markY,
      markWidth,
      markHeight,
      fontFamily,
      fontFamilyNepali,
      fontSizeRel,
      fontColor,
      fontWeight,
      fontItalic,
      lineHeightRel,
      align,
      valign,
      maxLines,
      marked: true,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${owned.id}`);
  revalidatePath(`/dashboard/${owned.id}/mark`);
  return ok();
}

export async function saveGenerateSettingsAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = saveGenerateSettingsSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const owned = await findOwnedInvitation(user.id, parsed.data.invitationId);
  if (!owned) return fail("Invitation not found.");

  await prisma.invitation.update({
    where: { id: owned.id },
    data: {
      nameLanguage: parsed.data.nameLanguage,
      namePrefixEn: parsed.data.namePrefixEn,
      namePrefixNe: parsed.data.namePrefixNe,
      nameSuffixEn: parsed.data.nameSuffixEn,
      nameSuffixNe: parsed.data.nameSuffixNe,
    },
  });

  revalidatePath(`/dashboard/${owned.id}`);
  return ok();
}

export async function renameInvitationAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = renameInvitationSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const owned = await findOwnedInvitation(user.id, parsed.data.invitationId);
  if (!owned) return fail("Invitation not found.");

  await prisma.invitation.update({
    where: { id: owned.id },
    data: { title: parsed.data.title },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/${owned.id}`);
  return ok();
}

export async function deleteInvitationAction(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = deleteInvitationSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  const owned = await findOwnedInvitation(user.id, parsed.data.invitationId);
  if (!owned) return fail("Invitation not found.");

  // Best-effort cleanup of Cloudinary assets: the base image plus EVERY
  // generated guest image for this invitation.
  const generated = await prisma.invitationGuest.findMany({
    where: { invitationId: owned.id, generatedPublicId: { not: null } },
    select: { generatedPublicId: true },
  });
  // The base image plus EVERY generated guest image for this invitation.
  // destroyAssets logs anything it couldn't remove instead of failing.
  await destroyAssets(
    [owned.baseImagePublicId, ...generated.map((g) => g.generatedPublicId)],
    "delete-invitation",
  );

  // Cascades remove InvitationGuest rows (see schema onDelete: Cascade).
  await prisma.invitation.delete({ where: { id: owned.id } });

  revalidatePath("/dashboard");
  return ok();
}
