import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../context/AuthContext";
import { checkInQrApi } from "../services/qrService";
import "./Scanner.css";

const SCANNER_ELEMENT_ID = "qr-reader-region";

// How long the GREEN success frame + message stays on screen before the
// camera automatically resumes scanning (RED) again, ready for the next QR.
const RESET_DELAY_MS = 2200;

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

  const resumeScanning = useCallback(() => {
    hasScannedRef.current = false;
    if (!isMountedRef.current) return;
    setStatus("scanning");
    setMessage("Point the camera at a QR code");
  }, []);

  const handleDecodedText = useCallback(
    async (decodedText) => {
      if (hasScannedRef.current) return;
      hasScannedRef.current = true;

      // 1) QR successfully READ -> flip frame to GREEN immediately.
      playBeep(880);
      setStatus("success");
      setMessage("QR Scanned Successfully!");

      // 2) In the background, confirm the ticket with the backend so
      // entry is actually recorded (not just "a QR was read").
      try {
        const res = await checkInQrApi(decodedText.trim());
        const name = res?.data?.attendee?.name;
        setMessage(
          name
            ? `QR Scanned Successfully! Entry allowed - ${name}`
            : "QR Scanned Successfully! Entry allowed."
        );
      } catch (err) {
        const serverMsg = err.response?.data?.message;
        // Ticket read fine (green flash already shown), but backend says
        // it's not valid for entry (already used / cancelled / etc.).
        setStatus("error");
        setMessage(serverMsg || "This ticket could not be checked in.");
        playBeep(220);
      }

      resetTimeoutRef.current = setTimeout(resumeScanning, RESET_DELAY_MS);
    },
    [resumeScanning]
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
            : status === "error"
            ? "scannerMessage scannerMessage--red"
            : "scannerMessage scannerMessage--neutral"
        }
      >
        {message}
      </div>
    </div>
  );
};

export default Scanner;
