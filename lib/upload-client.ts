import { getUploadSignature } from "@/app/actions/upload";

export type CloudinaryUploadResult = {
  publicId: string;
  width: number;
  height: number;
  format: string;
  resourceType: string;
  bytes: number;
  pages: number; // >1 for multi-page PDFs; 1 otherwise
};

type CloudinaryRaw = {
  public_id: string;
  width: number;
  height: number;
  format: string;
  resource_type: string;
  bytes: number;
  pages?: number;
  error?: { message?: string };
};

/**
 * Upload a file or blob straight from the browser to Cloudinary using a
 * server-generated signature. Works for both base images/PDFs ("base") and
 * generated PNGs ("generated"). Reports coarse progress via `onProgress`.
 */
export async function uploadToCloudinary(
  file: Blob,
  kind: "base" | "generated",
  options?: { filename?: string; onProgress?: (fraction: number) => void },
): Promise<CloudinaryUploadResult> {
  const sig = await getUploadSignature({ kind });

  const form = new FormData();
  form.append("file", file, options?.filename);
  form.append("api_key", sig.apiKey);
  form.append("timestamp", String(sig.timestamp));
  form.append("folder", sig.folder);
  form.append("signature", sig.signature);

  // /auto/ lets Cloudinary detect images vs PDFs; PDFs are stored as the
  // "image" resource type so page 1 can be delivered as a raster.
  const endpoint = `https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`;

  const json = await xhrUpload(endpoint, form, options?.onProgress);

  if (json.error) {
    throw new Error(json.error.message ?? "Cloudinary upload failed.");
  }

  return {
    publicId: json.public_id,
    width: json.width,
    height: json.height,
    format: json.format,
    resourceType: json.resource_type,
    bytes: json.bytes,
    pages: typeof json.pages === "number" && json.pages > 0 ? json.pages : 1,
  };
}

// XHR (not fetch) so we can surface upload progress to the UI.
function xhrUpload(
  url: string,
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<CloudinaryRaw> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "json";

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      });
    }

    xhr.addEventListener("load", () => {
      const body = (xhr.response ??
        safeParse(xhr.responseText)) as CloudinaryRaw | null;
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        resolve(body);
      } else {
        reject(
          new Error(
            body?.error?.message ?? `Upload failed (HTTP ${xhr.status}).`,
          ),
        );
      }
    });
    xhr.addEventListener("error", () =>
      reject(new Error("Network error during upload.")),
    );
    xhr.send(form);
  });
}

function safeParse(text: string): CloudinaryRaw | null {
  try {
    return JSON.parse(text) as CloudinaryRaw;
  } catch {
    return null;
  }
}
