import { VOICE_DATA } from "./voiceData";

// Says a short phrase out loud ("Thank you", "Not recognised" ...) so the staff
// do not have to look at the screen.
//
// The voice is the recorded ElevenLabs voice in voiceData.js (embedded in the
// app, so nothing extra has to be deployed). Only if a clip is missing or the
// device refuses to play it, the phone's / browser's own voice is used instead.
// Never throws: the voice is only a bonus.
const CLIPS = {
  "thank you": "thank-you",
  "not recognised": "not-recognised",
  "already entered": "already-entered",
  "entry not allowed": "not-allowed",
  "no running event": "no-event",
};

const clipCache = {};
const getClip = (key) => {
  if (!clipCache[key] && VOICE_DATA[key]) {
    const audio = new Audio(VOICE_DATA[key]);
    audio.preload = "auto";
    clipCache[key] = audio;
  }
  return clipCache[key];
};

// A sound can only start after the person has touched the page once. The first
// tap silently "unlocks" every clip, so the later automatic "Thank you" (which
// is not a tap) is allowed to play.
let unlocked = false;
const unlock = () => {
  if (unlocked) return;
  unlocked = true;
  Object.keys(VOICE_DATA).forEach((key) => {
    const audio = getClip(key);
    if (!audio) return;
    audio.muted = true;
    const p = audio.play();
    const done = () => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
    };
    if (p && typeof p.then === "function") p.then(done).catch(done);
    else done();
  });
};

if (typeof window !== "undefined") {
  ["pointerdown", "touchstart", "click", "keydown"].forEach((evt) =>
    window.addEventListener(evt, unlock, { once: true, passive: true })
  );
}

// ---------- fallback: the phone's / browser's own voice ----------
const speakWithBrowserVoice = (text) => {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) synth.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = "en-IN";
    u.rate = 0.95;
    synth.speak(u);
  } catch {
    // ignore
  }
};

let currentClip = null;

export const speak = (text) => {
  try {
    const audio = getClip(CLIPS[String(text).trim().toLowerCase()]);
    if (!audio) {
      speakWithBrowserVoice(text);
      return;
    }
    if (currentClip && currentClip !== audio) {
      currentClip.pause();
      currentClip.currentTime = 0;
    }
    currentClip = audio;
    audio.muted = false;
    audio.volume = 1;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn("Voice clip could not play:", err?.message || err);
        speakWithBrowserVoice(text); // second chance
      });
    }
  } catch {
    speakWithBrowserVoice(text);
  }
};
