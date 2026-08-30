import { describe, it, expect } from "vitest";
import { isUploadNotice, messageTextForVeteran, messageTextForVso, uploadFilename } from "@/lib/api/vso/messages";

describe("upload-notice per-audience text", () => {
  it("recognizes the upload: prefix as an upload notice", () => {
    expect(isUploadNotice("upload:dd214-scan.pdf")).toBe(true);
  });

  it("recognizes the legacy pre-prefix strings as upload notices too", () => {
    expect(isUploadNotice("Veteran uploaded a document.")).toBe(true);
    expect(isUploadNotice("User uploaded a document.")).toBe(true);
  });

  it("does not treat an ordinary message as an upload notice", () => {
    expect(isUploadNotice("Please schedule an audiology exam.")).toBe(false);
  });

  it("extracts the filename from an upload: body", () => {
    expect(uploadFilename("upload:dd214-scan.pdf")).toBe("dd214-scan.pdf");
  });

  it("shows the VSO a generic line regardless of filename (mirrors message_text_for_vso)", () => {
    expect(messageTextForVso("upload:dd214-scan.pdf")).toBe("Veteran uploaded a document.");
    expect(messageTextForVso("upload:")).toBe("Veteran uploaded a document.");
  });

  it("passes non-upload system text through unchanged for the VSO", () => {
    expect(messageTextForVso("Claim submitted for VSO review.")).toBe("Claim submitted for VSO review.");
  });

  it("shows the veteran their own filename (mirrors message_text_for_veteran)", () => {
    expect(messageTextForVeteran("upload:dd214-scan.pdf")).toBe("You sent a document: dd214-scan.pdf");
  });

  it("falls back to a generic line for the veteran when there's no real filename", () => {
    expect(messageTextForVeteran("upload:")).toBe("You sent a document.");
    expect(messageTextForVeteran("upload:document")).toBe("You sent a document.");
  });

  it("passes non-upload system text through unchanged for the veteran", () => {
    expect(messageTextForVeteran("Claim submitted for VSO review.")).toBe("Claim submitted for VSO review.");
  });
});
