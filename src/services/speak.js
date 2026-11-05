import { VOICE_DATA } from "./voiceData";

// Plays a short recorded voice ("Thank you", "Not recognised" ...) so the staff
// do not have to look at the screen. The clips are embedded in the app
// (voiceData.js), so nothing extra has to be deployed, and they do not rely on
// the browser's text-to-speech (silent on many phones / Android WebView).
// Never throws: the voice is only a bonus.
const FILES = {
  "thank you": "thank-you",
  "not recognised": "not-recognised",
  "already entered": "already-entered",
  "entry not allowed": "not-allowed",
  "no running event": "no-event",
};

const clips = {};
const getClip = (key) => {
  if (!clips[key] && VOICE_DATA[key]) {
    const audio = new Audio(VOICE_DATA[key]);
    audio.preload = "auto";
    clips[key] = audio;
  }
  return clips[key];
};

// Browsers / WebViews only let a sound start after the person has touched the
// page once. The first tap "unlocks" every clip silently, so the later
// automatic "Thank you" (which is not a tap) is allowed to play.
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

const speakWithBrowserVoice = (text) => {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = "en-IN";
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
};

let current = null;

export const speak = (text) => {
  try {
    const key = FILES[String(text).trim().toLowerCase()];
    const audio = key ? getClip(key) : null;
    if (!audio) {
      speakWithBrowserVoice(text);
      return;
    }
    if (current && current !== audio) {
      current.pause();
      current.currentTime = 0;
    }
    current = audio;
    audio.muted = false;
    audio.volume = 1;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn("Voice could not play:", err?.message || err);
        speakWithBrowserVoice(text); // second chance
      });
    }
  } catch {
    // voice is only a bonus
  }
};
