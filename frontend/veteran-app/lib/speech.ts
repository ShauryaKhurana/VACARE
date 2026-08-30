// Text-to-speech for the assistant's side of the conversation.
//
// The mirror image of the mic in ChatInputBar: voice input let a veteran talk
// instead of type, and this lets them listen instead of read. Same rule as the
// mic (LLD Section 8) -- progressive enhancement. Where speechSynthesis is
// missing the control is hidden rather than shown broken, and nothing in the
// flow depends on hearing anything.

function synth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  // Guarded rather than assumed: jsdom has no speechSynthesis at all, and
  // some embedded browsers expose the object with no voices behind it.
  return window.speechSynthesis ?? null;
}

export function speechSupported(): boolean {
  return synth() !== null && typeof window !== "undefined" && "SpeechSynthesisUtterance" in window;
}

/**
 * Reads `text` aloud, cancelling whatever was being read before it.
 *
 * Cancelling is the point. Answers arrive faster than they can be spoken, so
 * without this the queue grows and the veteran hears the assistant narrating
 * a question they answered a minute ago.
 */
export function speak(text: string, rate = 1): void {
  const s = synth();
  if (!s || !text.trim()) return;

  s.cancel();
  const utterance = new SpeechSynthesisUtterance(stripForSpeech(text));
  utterance.rate = rate;
  utterance.lang = "en-US";
  s.speak(utterance);
}

export function stopSpeaking(): void {
  synth()?.cancel();
}

/**
 * Trims the typographic bits that read badly out loud. These are written for
 * the eye -- an em dash is a pause on the page, but some voices announce it,
 * and a bare "21-526EZ" gets spelled better without the punctuation noise
 * around it.
 */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\s*--\s*/g, ", ")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}
