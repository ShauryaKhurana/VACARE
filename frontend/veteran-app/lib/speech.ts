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
 * Preferred voices, best first, matched case-insensitively against the start
 * of the voice name.
 *
 * The browser default is whatever the OS picked, which on macOS is Samantha --
 * a 2000s-era formant voice that sounds exactly as synthetic as people expect
 * a robot to sound. Naming better ones is the single biggest quality win here,
 * so this is a ranked list rather than a lucky guess:
 *
 *  - Premium/Enhanced Apple voices, if the user has downloaded any. These are
 *    neural and by far the most natural thing available offline.
 *  - Neural network voices from the browser vendors (Google's on Chrome,
 *    Microsoft's on Edge/Windows). Also excellent, but need a connection.
 *  - Apple's 2022-era voices (Sandy, Shelley, Flo), which ship by default on
 *    current macOS and are markedly warmer than Samantha.
 *  - Then the old guard, as a floor rather than a choice.
 *
 * All are female, per the requested default. Anyone who wants a different
 * voice has their OS-level accessibility settings, which we do not override.
 */
const PREFERRED_VOICES = [
  "ava (premium)",
  "ava (enhanced)",
  "zoe (premium)",
  "zoe (enhanced)",
  "samantha (enhanced)",
  "allison",
  "susan",
  "google us english",
  "google uk english female",
  "microsoft aria",
  "microsoft jenny",
  "microsoft michelle",
  "sandy",
  "shelley",
  "flo",
  "samantha",
  "karen",
  "moira",
  "tessa",
];

/** Voices that are never appropriate, whatever else matches. macOS ships a
 *  set of joke voices (Bubbles, Bad News, Zarvox) that are English and would
 *  otherwise pass a bare language check. */
const NOVELTY = /bubbles|bad news|good news|bahh|bells|boing|cellos|jester|organ|trinoids|whisper|wobble|zarvox|superstar|deranged|hysterical|albert|fred|junior|ralph|princess|grandpa|grandma|rocko|eddy|reed/i;

let cachedVoice: SpeechSynthesisVoice | null = null;
/** Signature of the voice list the cached pick came from. Keyed on names
 *  rather than a count: two different lists can be the same length. */
let cachedFrom = "";

/**
 * Picks the most natural English voice available.
 *
 * The list arrives asynchronously in Chrome -- getVoices() is empty on the
 * first call and fills in later -- so this is resolved at speak time and
 * re-resolved whenever the count changes, rather than once at module load
 * where it would reliably find nothing.
 */
export function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;

  // Not every environment that exposes speechSynthesis exposes getVoices --
  // test doubles and some embedded webviews do not. No voice list just means
  // the browser default, which still speaks.
  if (typeof s.getVoices !== "function") return null;

  const voices = s.getVoices();
  if (voices.length === 0) return null;

  const signature = voices.map((v) => v.name).join("|");
  if (cachedVoice && signature === cachedFrom) return cachedVoice;
  cachedFrom = signature;

  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en") && !NOVELTY.test(v.name));

  for (const wanted of PREFERRED_VOICES) {
    const match = english.find((v) => v.name.toLowerCase().startsWith(wanted));
    if (match) {
      cachedVoice = match;
      return match;
    }
  }

  // Nothing recognised: prefer a network voice (usually neural) over a local
  // one, then simply the first English voice, then let the browser decide.
  cachedVoice = english.find((v) => !v.localService) ?? english[0] ?? null;
  return cachedVoice;
}

/** Slightly under natural pace. The default rate reads like an announcement;
 *  a touch slower lands closer to someone talking to you. */
const RATE = 0.95;

/**
 * Reads `text` aloud, cancelling whatever was being read before it.
 *
 * Cancelling is the point. Answers arrive faster than they can be spoken, so
 * without this the queue grows and the veteran hears the assistant narrating
 * a question they answered a minute ago.
 *
 * Sentences are queued as separate utterances rather than one long string.
 * Engines run sentences together at a constant clip when handed a paragraph;
 * separate utterances get a real breath between them, which does more for
 * sounding human than any rate or pitch tweak.
 */
export function speak(text: string, rate = RATE): void {
  const s = synth();
  if (!s || !text.trim()) return;

  s.cancel();
  const voice = pickVoice();
  for (const sentence of splitSentences(stripForSpeech(text))) {
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.rate = rate;
    utterance.lang = voice?.lang ?? "en-US";
    if (voice) utterance.voice = voice;
    s.speak(utterance);
  }
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

/** Splits on sentence ends, keeping the punctuation so the engine still hears
 *  a question as a question. Falls back to the whole string when there is
 *  nothing to split on. */
export function splitSentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [text];
}
