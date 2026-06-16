import "server-only";
import { v2 as cloudinary } from "cloudinary";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

export const CLOUDINARY_FOLDER =
  process.env.CLOUDINARY_FOLDER || "invitation-generator";

const destroySucceeded = (res: { result?: string } | undefined) =>
  res?.result === "ok" || res?.result === "not found";

async function destroyOne(publicId: string, context: string): Promise<void> {
  try {
    const res = await cloudinary.uploader.destroy(publicId, { invalidate: true });
    if (destroySucceeded(res)) return;
    // Some plans reject CDN invalidation; retry a plain destroy before giving up
    // so the stored asset is still removed.
    const retry = await cloudinary.uploader.destroy(publicId);
    if (!destroySucceeded(retry)) {
      console.warn(
        `Cloudinary destroy for ${publicId} (${context}) returned: ${retry?.result}`,
      );
    }
  } catch (err) {
    console.warn(`Cloudinary destroy failed for ${publicId} (${context}):`, err);
  }
}

export type CloudinaryAsset = {
  publicId: string;
  bytes: number;
  createdAt: string; // ISO string from Cloudinary
  url: string; // secure delivery URL (for previews)
};

type RawResource = {
  public_id: string;
  bytes?: number;
  created_at?: string;
  secure_url?: string;
  url?: string;
};

/**
 * List every *generated* image asset stored under our folder, paging through
 * the Cloudinary Admin API. Generated images live at
 * `${CLOUDINARY_FOLDER}/<userId>/generated/<id>`, so we list the whole folder by
 * public_id prefix and keep only the ones sitting in a `/generated/` subfolder
 * (i.e. not the base invitation images). Used by the admin orphan-cleanup tool.
 */
export async function listGeneratedAssets(): Promise<CloudinaryAsset[]> {
  assertCloudinaryConfigured();
  const prefix = `${CLOUDINARY_FOLDER}/`;
  const assets: CloudinaryAsset[] = [];
  let nextCursor: string | undefined;

  do {
    const res = await cloudinary.api.resources({
      resource_type: "image",
      type: "upload",
      prefix,
      max_results: 500,
      next_cursor: nextCursor,
    });

    for (const raw of (res.resources ?? []) as RawResource[]) {
      const publicId = raw.public_id;
      if (!publicId || !publicId.includes("/generated/")) continue;
      assets.push({
        publicId,
        bytes: raw.bytes ?? 0,
        createdAt: raw.created_at ?? "",
        url: raw.secure_url ?? raw.url ?? "",
      });
    }

    nextCursor = res.next_cursor as string | undefined;
  } while (nextCursor);

  return assets;
}

/**
 * Best-effort deletion of generated/base assets from Cloudinary so stale images
 * don't pile up (e.g. the previous render when a guest is regenerated). Never
 * throws — a failed cleanup must not break the user-facing action — but unlike a
 * silent `.catch()` it LOGS anything it couldn't remove, so leftover assets are
 * visible in the server logs instead of quietly accumulating. A `not found`
 * result counts as success (the asset is already gone). Null/blank ids and
 * duplicates are ignored.
 */
export async function destroyAssets(
  publicIds: Array<string | null | undefined>,
  context = "asset",
): Promise<void> {
  const ids = Array.from(
    new Set(publicIds.filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) return;
  await Promise.all(ids.map((id) => destroyOne(id, context)));
}

/**
 * Throws a clear error early if Cloudinary credentials are missing, so server
 * actions fail with an actionable message instead of a cryptic SDK error.
 */
export function assertCloudinaryConfigured() {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    );
  }
}

/**
 * Produce a signature for a direct (browser → Cloudinary) signed upload.
 * The browser sends `file`, `api_key`, `timestamp`, `signature` and whatever
 * params we signed here. Only params included here may be sent by the client.
 */
export function signUpload(params: Record<string, string | number>) {
  assertCloudinaryConfigured();
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign: Record<string, string | number> = { timestamp, ...params };
  const signature = cloudinary.utils.api_sign_request(
    toSign,
    apiSecret as string,
  );
  return {
    signature,
    timestamp,
    apiKey: apiKey as string,
    cloudName: cloudName as string,
  };
}

export { cloudinary };
