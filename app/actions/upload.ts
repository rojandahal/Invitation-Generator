"use server";

import { CLOUDINARY_FOLDER, signUpload } from "@/lib/cloudinary";
import { requireUser } from "@/lib/session";
import { signUploadSchema } from "@/lib/validators";

export type UploadSignature = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
};

/**
 * Return a short-lived signature so the browser can upload a file directly to
 * Cloudinary. We sign `folder` (and `timestamp`), so the client must send
 * exactly those params alongside the file — nothing else.
 */
export async function getUploadSignature(
  input: unknown,
): Promise<UploadSignature> {
  const user = await requireUser();

  const parsed = signUploadSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid upload request.");
  }

  // Scope uploads per user and per kind for easy auditing/cleanup.
  const folder = `${CLOUDINARY_FOLDER}/${user.id}/${parsed.data.kind}`;
  const { signature, timestamp, apiKey, cloudName } = signUpload({ folder });

  return { signature, timestamp, apiKey, cloudName, folder };
}
