// Speaks a short phrase out loud ("Thank you", "Not recognised") so the staff
// do not have to look at the screen. Uses the phone / browser's built-in voice;
// does nothing (and never throws) where speech is not available.
export const speak = (text) => {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = "en-IN";
    utterance.rate = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    // voice is only a bonus
  }
};
