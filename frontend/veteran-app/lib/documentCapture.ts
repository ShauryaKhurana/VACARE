// Real, working browser logic for HEIC detection and client-side image
// compression, per Frontend Deep Dives Section 2. This is deliberately not
// stubbed out even though the "upload" it feeds is mocked -- it's the one
// piece of frontend logic the spec calls out as genuinely tricky.

const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"];

/**
 * Detects HEIC/HEIF by reading the file's ISOBMFF "ftyp" box brand, not by
 * file extension or MIME type (both can be missing or wrong for photos
 * exported from iOS). The Canvas API cannot decode HEIC at all, so this
 * must run before any compression is attempted.
 */
export async function isHeicFile(file: File): Promise<boolean> {
  const header = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(header);
  if (bytes.length < 12) return false;

  // Bytes 4-7 must spell "ftyp"; bytes 8-11 are the major brand.
  const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (ftyp !== "ftyp") return false;

  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
  return HEIC_BRANDS.includes(brand);
}

export interface CompressedImage {
  blob: Blob;
  originalFormat: string;
  compressedClientSide: boolean;
}

const MAX_LONG_EDGE = 2000;
const JPEG_QUALITY = 0.8;

/**
 * Re-encodes a non-HEIC image to JPEG, capped at a 2000px long edge, ~80%
 * quality. `imageOrientation: "from-image"` makes the browser apply the
 * photo's EXIF orientation before it ever reaches pixels we draw -- without
 * it, portrait photos from a phone camera come out sideways once EXIF is
 * stripped by the redraw below. That stripping is also the point: toBlob()
 * re-encodes from raw pixel data only, so EXIF (GPS, device ID, timestamp)
 * has no path to survive it.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Image compression failed");

  return { blob, originalFormat: file.type || "unknown", compressedClientSide: true };
}

/**
 * Runs the capture pipeline described in Deep Dives Section 2.4: detect
 * HEIC first; on the HEIC path, skip compression entirely (the backend must
 * decode and strip EXIF server-side, since Canvas structurally can't touch
 * the file) and upload the original, flagged.
 */
export async function prepareCapturedFile(file: File): Promise<CompressedImage> {
  if (await isHeicFile(file)) {
    return { blob: file, originalFormat: "heic", compressedClientSide: false };
  }
  return compressImage(file);
}
