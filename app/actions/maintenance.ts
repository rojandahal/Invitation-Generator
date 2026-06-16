"use server";

import { prisma } from "@/lib/prisma";
import {
  CLOUDINARY_FOLDER,
  destroyAssets,
  listGeneratedAssets,
} from "@/lib/cloudinary";
import { requireAdmin } from "@/lib/session";
import { deleteOrphansSchema } from "@/lib/validators";
import { fail, firstZodError, ok, type ActionResult } from "@/lib/action-result";

// Leave very fresh uploads alone: a guest generated moments ago in another tab
// may have its Cloudinary asset uploaded before its DB row is written, which
// would briefly make it look orphaned. 15 minutes is far longer than any render.
const SAFETY_WINDOW_MS = 15 * 60 * 1000;

export type OrphanAsset = {
  publicId: string;
  bytes: number;
  createdAt: string;
};

export type OrphanScan = {
  scanned: number; // total generated assets found in Cloudinary
  referenced: number; // still linked to a guest
  skippedRecent: number; // too fresh to safely delete
  orphans: OrphanAsset[]; // safe-to-delete candidates (largest first)
  totalBytes: number; // reclaimable bytes across `orphans`
};

/**
 * Compare the generated images stored in Cloudinary against the guest rows that
 * reference them, returning every asset no guest points at any more. Read-only:
 * deletes nothing. Admin-only.
 */
export async function scanOrphanedAssetsAction(): Promise<
  ActionResult<OrphanScan>
> {
  await requireAdmin();

  let assets;
  try {
    assets = await listGeneratedAssets();
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "Could not list Cloudinary assets.",
    );
  }

  // Every generated public_id currently referenced by a guest.
  const rows = await prisma.invitationGuest.findMany({
    where: { generatedPublicId: { not: null } },
    select: { generatedPublicId: true },
  });
  const referenced = new Set(rows.map((r) => r.generatedPublicId as string));

  const cutoff = Date.now() - SAFETY_WINDOW_MS;
  let referencedCount = 0;
  let skippedRecent = 0;
  const orphans: OrphanAsset[] = [];

  for (const asset of assets) {
    if (referenced.has(asset.publicId)) {
      referencedCount++;
      continue;
    }
    const created = asset.createdAt ? new Date(asset.createdAt).getTime() : 0;
    if (created && created > cutoff) {
      skippedRecent++;
      continue;
    }
    orphans.push({
      publicId: asset.publicId,
      bytes: asset.bytes,
      createdAt: asset.createdAt,
    });
  }

  orphans.sort((a, b) => b.bytes - a.bytes);

  return ok({
    scanned: assets.length,
    referenced: referencedCount,
    skippedRecent,
    orphans,
    totalBytes: orphans.reduce((sum, o) => sum + o.bytes, 0),
  });
}

/**
 * Delete the given generated assets from Cloudinary. Re-validates at delete time
 * so we never remove an asset that is (a) outside our generated folders or
 * (b) referenced by a guest again since the scan. Admin-only.
 */
export async function deleteOrphanedAssetsAction(
  input: unknown,
): Promise<ActionResult<{ deleted: number }>> {
  await requireAdmin();

  const parsed = deleteOrphansSchema.safeParse(input);
  if (!parsed.success) return fail(firstZodError(parsed.error));

  // Scope guard: only ever touch generated images inside our own folder.
  const scoped = parsed.data.publicIds.filter(
    (id) => id.startsWith(`${CLOUDINARY_FOLDER}/`) && id.includes("/generated/"),
  );
  if (scoped.length === 0) return fail("No deletable images in the selection.");

  // Re-check references now (guard against a guest being generated between the
  // scan and this delete): drop anything a guest points at again.
  const stillReferenced = await prisma.invitationGuest.findMany({
    where: { generatedPublicId: { in: scoped } },
    select: { generatedPublicId: true },
  });
  const refSet = new Set(
    stillReferenced.map((r) => r.generatedPublicId as string),
  );
  const targets = scoped.filter((id) => !refSet.has(id));

  if (targets.length === 0) {
    return fail("Those images are referenced again — nothing deleted.");
  }

  await destroyAssets(targets, "orphan-cleanup");

  return ok({ deleted: targets.length });
}
