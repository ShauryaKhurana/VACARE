// Per-audience rendering for system messages in the veteran <-> VSO thread --
// a direct TypeScript port of src/collaboration.py's is_upload_notice /
// message_text_for_vso / message_text_for_veteran, kept byte-for-byte
// equivalent (same `upload:` wire prefix, same legacy-string fallback, same
// two audience-specific copy strings) so a document-upload notice reads
// identically here and on the real backend once a fetch-based client swaps
// in. Only system-authored messages are ever upload notices -- callers must
// gate on `author === "system"` themselves, same as the Python side gates on
// `MessageAuthor.SYSTEM` before calling these.

export const UPLOAD_MESSAGE_PREFIX = "upload:";

/** Pre-`upload:`-prefix message bodies the backend used to write for the
 * same event -- still recognized so old rows in an existing case render
 * correctly instead of falling through to "as-is" text. */
const LEGACY_UPLOAD_NOTICES = new Set([
  "user uploaded a document.",
  "veteran uploaded a document.",
]);

export function isUploadNotice(body: string): boolean {
  if (body.startsWith(UPLOAD_MESSAGE_PREFIX)) return true;
  return LEGACY_UPLOAD_NOTICES.has(body.trim().toLowerCase());
}

/** The filename portion of an `upload:{filename}` message body. Only
 * meaningful when `isUploadNotice(body)` is true. */
export function uploadFilename(body: string): string {
  return body.slice(UPLOAD_MESSAGE_PREFIX.length);
}

/** What a VSO sees for a system message -- upload notices collapse to a
 * single generic line regardless of filename, since the VSO's job is to
 * notice a new document landed, not parse the raw filename out of a thread
 * line (src/collaboration.py message_text_for_vso). */
export function messageTextForVso(body: string): string {
  if (isUploadNotice(body)) return "Veteran uploaded a document.";
  return body;
}

/** What the veteran sees for the same system message -- the mirror image,
 * confirming what they personally sent (src/collaboration.py
 * message_text_for_veteran). Not used by the VSO surface today, but kept
 * alongside messageTextForVso so the two audiences' rendering can never
 * drift apart when one is edited. */
export function messageTextForVeteran(body: string): string {
  if (isUploadNotice(body)) {
    const name = uploadFilename(body);
    if (name && name !== "document") return `You sent a document: ${name}`;
    return "You sent a document.";
  }
  return body;
}
