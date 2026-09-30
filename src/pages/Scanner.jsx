import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../context/AuthContext";
import { checkInQrApi } from "../services/qrService";
import "./Scanner.css";

const SCANNER_ELEMENT_ID = "qr-reader-region";

// How long the GREEN success frame + message stays on screen before the
// camera automatically resumes scanning (RED) again, ready for the next QR.
const RESET_DELAY_MS = 2200;

// The SAME QR scanned again within this window is answered with
// "Already scanned" straight away (no server call), and scanning stays
// paused until the staff member taps OK.
const DUPLICATE_WINDOW_MS = 60 * 1000;

// Two sounds (see public/sounds/README.txt):
//   sounds/scan-success.mp3 -> correct QR
//   sounds/wrong-qr.mp3     -> wrong / invalid QR
// Neither is played for "Already scanned" (that only shows the popup).
// If a file is missing or cannot play, a simple beep is used instead.
const SUCCESS_SOUND_URL = `${import.meta.env.BASE_URL}sounds/scan-success.mp3`;
const WRONG_SOUND_URL = `${import.meta.env.BASE_URL}sounds/wrong-qr.mp3`;

const playBeep = (frequency) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch {
    // Non-critical, ignore.
  }
};

const audioCache = new Map();
const playSound = (url, fallbackFrequency) => {
  try {
    let audio = audioCache.get(url);
    if (!audio) {
      audio = new Audio(url);
      audio.preload = "auto";
      audioCache.set(url, audio);
    }
    audio.currentTime = 0;
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch(() => playBeep(fallbackFrequency));
    }
  } catch {
    playBeep(fallbackFrequency);
  }
};

const Scanner = () => {
  const { logout } = useAuth();

  // "scanning" (red) -> "success" (green) -> back to "scanning"
  // "error" is shown briefly in red as well, with a message, then resumes.
  const [status, setStatus] = useState("scanning");
  const [message, setMessage] = useState("Point the camera at a QR code");

  const scannerRef = useRef(null);
  const isMountedRef = useRef(true);
  const hasScannedRef = useRef(false);
  const resetTimeoutRef = useRef(null);
  // qr text -> { at: timestamp of last scan, name }
  const recentScansRef = useRef(new Map());
  // "Already scanned" popup. While it is open the camera ignores every QR;
  // only the OK button lets the next scan through.
  const [alreadyPopup, setAlreadyPopup] = useState(null); // { name } | null

  const resumeScanning = useCallback(() => {
    hasScannedRef.current = false;
    if (!isMountedRef.current) return;
    setStatus("scanning");
    setMessage("Point the camera at a QR code");
  }, []);

  const showAlreadyScanned = useCallback((name) => {
    clearTimeout(resetTimeoutRef.current);
    setStatus("warning");
    setMessage("Already scanned");
    setAlreadyPopup({ name: name || "" });
    // hasScannedRef stays true -> no QR is processed until OK is tapped.
  }, []);

  const handleAlreadyOk = useCallback(() => {
    setAlreadyPopup(null);
    resumeScanning();
  }, [resumeScanning]);

  const handleDecodedText = useCallback(
    async (decodedText) => {
      if (hasScannedRef.current) return;
      hasScannedRef.current = true;

      const token = decodedText.trim();
      const now = Date.now();

      // Forget scans older than the window.
      for (const [key, info] of recentScansRef.current) {
        if (now - info.at > DUPLICATE_WINDOW_MS) recentScansRef.current.delete(key);
      }

      // Same QR again within 1 minute -> "Already scanned" + OK, no API call.
      const previous = recentScansRef.current.get(token);
      if (previous) {
        showAlreadyScanned(previous.name);
        return;
      }

      // 1) QR successfully READ -> flip frame to GREEN immediately.
      setStatus("success");
      setMessage("QR Scanned Successfully!");

      // 2) In the background, confirm the ticket with the backend so
      // entry is actually recorded (not just "a QR was read").
      try {
        const res = await checkInQrApi(token);
        const name = res?.data?.attendee?.name;
        recentScansRef.current.set(token, { at: Date.now(), name: name || "" });
        playSound(SUCCESS_SOUND_URL, 880); // correct QR
        setMessage(
          name
            ? `QR Scanned Successfully! Entry allowed - ${name}`
            : "QR Scanned Successfully! Entry allowed."
        );
      } catch (err) {
        const serverMsg = err.response?.data?.message;
        const isAlreadyUsed =
          typeof serverMsg === "string" && /already/i.test(serverMsg);

        if (isAlreadyUsed) {
          // Already checked in earlier (e.g. more than a minute ago, or on
          // another device): same "Already scanned" popup with OK.
          recentScansRef.current.set(token, { at: Date.now(), name: "" });
          showAlreadyScanned("");
          return;
        }

        // Wrong / invalid QR: red frame + alert sound, then scanning resumes.
        setStatus("error");
        setMessage(serverMsg || "This ticket could not be checked in.");
        playSound(WRONG_SOUND_URL, 220); // wrong / invalid QR
      }

      resetTimeoutRef.current = setTimeout(resumeScanning, RESET_DELAY_MS);
    },
    [resumeScanning, showAlreadyScanned]
  );

  useEffect(() => {
    isMountedRef.current = true;
    const html5QrCode = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = html5QrCode;

    html5QrCode
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          handleDecodedText(decodedText);
        },
        () => {
          // per-frame "not found yet" - expected constantly, ignore.
        }
      )
      .catch(() => {
        if (isMountedRef.current) {
          setStatus("error");
          setMessage("Camera not available. Check camera permission.");
        }
      });

    return () => {
      isMountedRef.current = false;
      clearTimeout(resetTimeoutRef.current);
      const instance = scannerRef.current;
      // Calling stop() before start() has actually resolved (e.g. React
      // StrictMode's mount->unmount->mount in dev) throws "Cannot stop,
      // scanner is not running or paused." This is harmless (dev-only) -
      // swallow it safely either way.
      if (instance) {
        try {
          instance
            .stop()
            .then(() => instance.clear())
            .catch(() => {});
        } catch {
          // ignore - scanner was never running
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const frameClass =
    status === "success"
      ? "scanFrame scanFrame--green"
      : status === "warning"
      ? "scanFrame scanFrame--amber scanFrame--pulse"
      : status === "error"
      ? "scanFrame scanFrame--red scanFrame--pulse"
      : "scanFrame scanFrame--red";

  return (
    <div className="scannerScreen">
      <div className="scannerHeader">
        <span className="scannerHeaderTitle">Scan Ticket QR</span>
        <button className="scannerLogoutBtn" onClick={logout}>
          Logout
        </button>
      </div>

      <div className="scannerViewport">
        <div id={SCANNER_ELEMENT_ID} className="scannerVideoRegion" />
        <div className={frameClass}>
          <span className="scanFrame__corner scanFrame__corner--tl" />
          <span className="scanFrame__corner scanFrame__corner--tr" />
          <span className="scanFrame__corner scanFrame__corner--bl" />
          <span className="scanFrame__corner scanFrame__corner--br" />
        </div>
      </div>

      <div
        className={
          status === "success"
            ? "scannerMessage scannerMessage--green"
            : status === "warning"
            ? "scannerMessage scannerMessage--amber"
            : status === "error"
            ? "scannerMessage scannerMessage--red"
            : "scannerMessage scannerMessage--neutral"
        }
      >
        {message}
      </div>

      {alreadyPopup && (
        <div className="scanAlreadyOverlay" role="alertdialog" aria-modal="true">
          <div className="scanAlreadyBox">
            <div className="scanAlreadyIcon">!</div>
            <h2 className="scanAlreadyTitle">Already scanned</h2>
            <p className="scanAlreadyText">
              {alreadyPopup.name
                ? `${alreadyPopup.name}'s ticket was already scanned.`
                : "This QR code was already scanned."}
            </p>
            <button
              type="button"
              className="scanAlreadyOk"
              onClick={handleAlreadyOk}
              autoFocus
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scanner;