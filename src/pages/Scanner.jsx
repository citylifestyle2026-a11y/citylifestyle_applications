import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../context/AuthContext";
import { checkInQrApi } from "../services/qrService";
import "./Scanner.css";
import parvLogo from "../assets/parv-logo.png";

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

  // "scanning" (red) -> "checking" (blue) -> "success" (green) / "warning"
  // (amber) / "error" (red) -> back to "scanning". Green only after the
  // server has allowed the entry.
  const [status, setStatus] = useState("scanning");
  const [message, setMessage] = useState("Point the camera at a QR code");
  // Popup for a ticket that was NOT allowed in (cancelled / already used /
  // invalid / no connection). Scanning stays paused until staff press OK.
  const [popup, setPopup] = useState(null);

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

      // 1) QR was READ. It is NOT accepted yet, so the frame is neutral
      // (blue "Checking...") until the server confirms the ticket. Green is
      // shown only after a real "entry allowed" answer, so staff never see
      // green for a ticket that is invalid / already used / cancelled.
      setStatus("checking");
      setMessage("Checking ticket...");

      try {
        const res = await checkInQrApi(decodedText.trim());
        const data = res?.data || {};
        const name = data.attendee?.name;
        const guests = Number(data.guests) || 1;

        // Group QR (one scan admits the whole booking): show how many.
        const guestText = data.isGroupEntry && guests > 1 ? ` (${guests} guests)` : "";

        playBeep(880);
        setStatus("success");
        setMessage(
          name
            ? `Entry allowed - ${name}${guestText}`
            : `Entry allowed${guestText}`
        );
      } catch (err) {
        const serverMsg = err.response?.data?.message;
        const isAlreadyUsed =
          typeof serverMsg === "string" && /already.*(used|checked)/i.test(serverMsg);

        // "Already checked in" is not really an error - it's expected
        // when a ticket is scanned twice. Show it as amber/warning, not
        // red, so staff can tell it apart from a genuinely invalid QR.
        setStatus(isAlreadyUsed ? "warning" : "error");
        setMessage(
          serverMsg ||
            (err.response
              ? "This ticket could not be checked in."
              : "No connection to the server. Check internet and scan again.")
        );
        playBeep(isAlreadyUsed ? 440 : 220);

        const text =
          serverMsg ||
          (err.response
            ? "This ticket could not be checked in."
            : "No connection to the server. Check internet and scan again.");
        const isCancelled = /cancel/i.test(String(serverMsg || ""));

        setPopup({
          tone: isAlreadyUsed ? "warning" : "error",
          title: isAlreadyUsed
            ? "Already Scanned"
            : isCancelled
            ? "Ticket Cancelled"
            : err.response
            ? "Entry Not Allowed"
            : "No Connection",
          text,
        });
        // Do NOT auto-resume: the popup's OK button resumes scanning.
        return;
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

  const closePopup = () => {
    setPopup(null);
    resumeScanning();
  };

  const frameClass =
    status === "success"
      ? "scanFrame scanFrame--green"
      : status === "checking"
      ? "scanFrame scanFrame--blue scanFrame--pulse"
      : status === "warning"
      ? "scanFrame scanFrame--amber scanFrame--pulse"
      : status === "error"
      ? "scanFrame scanFrame--red scanFrame--pulse"
      : "scanFrame scanFrame--red";

  return (
    <div className="scannerScreen">
      <div className="scannerHeader">
        <span className="scannerHeaderBrand">
          <img src={parvLogo} alt="Parv 6.0" className="scannerHeaderLogo" />
          <span className="scannerHeaderTitle">Scan Ticket QR</span>
        </span>
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
            : status === "checking"
            ? "scannerMessage scannerMessage--blue"
            : status === "warning"
            ? "scannerMessage scannerMessage--amber"
            : status === "error"
            ? "scannerMessage scannerMessage--red"
            : "scannerMessage scannerMessage--neutral"
        }
      >
        {message}
      </div>

      {popup && (
        <div className="scanAlreadyOverlay" role="alertdialog" aria-modal="true">
          <div className={`scanAlreadyBox scanAlreadyBox--${popup.tone}`}>
            <div className="scanAlreadyIcon">{popup.tone === "warning" ? "!" : "\u2715"}</div>
            <h3 className="scanAlreadyTitle">{popup.title}</h3>
            <p className="scanAlreadyText">{popup.text}</p>
            <button type="button" className="scanAlreadyOk" onClick={closePopup}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scanner;