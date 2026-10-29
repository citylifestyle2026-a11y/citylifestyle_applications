import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useAuth } from "../context/AuthContext";
import { checkInQrApi, undoCheckInQrApi } from "../services/qrService";
import "./Scanner.css";
import parvLogo from "../assets/parv-logo.png";

const SCANNER_ELEMENT_ID = "qr-reader-region";

// How long the GREEN success frame + message stays on screen before the
// camera automatically resumes scanning (RED) again, ready for the next QR.
const RESET_DELAY_MS = 2200;
// After a successful entry the "Edit count" button stays available this long
// before the camera resumes automatically (staff can also tap "Next scan").
const EDIT_WINDOW_MS = 7000;

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

// Animated icons: the tick / cross / "!" draw themselves on screen so staff
// can tell the result at a glance, even from a distance.
const StatusIcon = ({ type }) => (
  <svg
    className={`statusIcon statusIcon--${type}`}
    viewBox="0 0 52 52"
    fill="none"
    stroke="currentColor"
    strokeWidth="5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {type === "tick" && <path pathLength="1" d="M13 27 L22 36 L40 16" />}
    {type === "cross" && (
      <>
        <path pathLength="1" d="M15 15 L37 37" />
        <path pathLength="1" d="M37 15 L15 37" />
      </>
    )}
    {type === "warn" && (
      <>
        <path pathLength="1" d="M26 12 L26 29" />
        <path d="M26 39 L26 39.5" />
      </>
    )}
  </svg>
);

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
  // "How many guests are entering?" - shown for a pass with 2+ guests left.
  // { qrToken, remaining, alreadyEntered, totalGuests, name }
  const [guestPicker, setGuestPicker] = useState(null);
  const [pickedGuests, setPickedGuests] = useState(1);
  // Last successful entry, kept briefly so staff can fix a wrong count.
  // { qrToken, guests }
  const [lastEntry, setLastEntry] = useState(null);
  const [undoing, setUndoing] = useState(false);

  const scannerRef = useRef(null);
  const isMountedRef = useRef(true);
  const hasScannedRef = useRef(false);
  const resetTimeoutRef = useRef(null);

  const resumeScanning = useCallback(() => {
    hasScannedRef.current = false;
    if (!isMountedRef.current) return;
    clearTimeout(resetTimeoutRef.current);
    setLastEntry(null);
    setStatus("scanning");
    setMessage("Point the camera at a QR code");
  }, []);

  // Green result after the server allowed the entry.
  const showEntryAllowed = useCallback((data, qrToken) => {
    const name = data.attendee?.name || data.booking?.name;
    const guests = Number(data.guests) || 1;
    const remaining = Number(data.remaining) || 0;

    // Group QR: show how many entered now, and how many can still come later.
    const guestText = data.isGroupEntry
      ? ` (${guests} guest${guests === 1 ? "" : "s"})`
      : "";
    const leftText =
      data.isGroupEntry && remaining > 0 ? ` - ${remaining} more can enter later` : "";

    playBeep(880);
    setStatus("success");
    setMessage(
      `Entry allowed${name ? ` - ${name}` : ""}${guestText}${leftText}`
    );
    // Keep the result on screen a bit longer, with an "Edit count" button.
    setLastEntry({ qrToken, guests });
    clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = setTimeout(resumeScanning, EDIT_WINDOW_MS);
  }, [resumeScanning]);

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
        const qrToken = decodedText.trim();
        const res = await checkInQrApi(qrToken);
        const data = res?.data || {};

        // Pass with 2+ guests still to enter: nothing is checked in yet.
        // Ask the staff how many people are entering now (scanning stays
        // paused until they confirm or cancel).
        if (data.needsGuestCount) {
          setPickedGuests(data.remaining);
          setGuestPicker({
            qrToken,
            remaining: data.remaining,
            alreadyEntered: data.alreadyEntered || 0,
            totalGuests: data.totalGuests || data.remaining,
            name: data.booking?.name || data.attendee?.name || "",
          });
          setStatus("warning");
          setMessage("Select how many guests are entering");
          return;
        }

        showEntryAllowed(data, qrToken);
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
      }
    },
    [resumeScanning, showEntryAllowed]
  );

  // Staff confirmed the number of guests entering now.
  const confirmGuests = async () => {
    if (!guestPicker) return;
    const { qrToken } = guestPicker;
    setGuestPicker(null);
    setStatus("checking");
    setMessage("Checking ticket...");

    try {
      const res = await checkInQrApi(qrToken, pickedGuests);
      showEntryAllowed(res?.data || {}, qrToken);
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      const text =
        serverMsg ||
        (err.response
          ? "This ticket could not be checked in."
          : "No connection to the server. Check internet and scan again.");
      const isAlreadyUsed = /already.*(used|checked)/i.test(String(serverMsg || ""));
      setStatus(isAlreadyUsed ? "warning" : "error");
      setMessage(text);
      playBeep(isAlreadyUsed ? 440 : 220);
      setPopup({
        tone: isAlreadyUsed ? "warning" : "error",
        title: isAlreadyUsed ? "Already Scanned" : err.response ? "Entry Not Allowed" : "No Connection",
        text,
      });
    }
  };

  // "Wrong count? Edit": revert the entry that was just allowed, then ask
  // again how many guests are really entering.
  const editLastEntry = async () => {
    if (!lastEntry || undoing) return;
    clearTimeout(resetTimeoutRef.current);
    setUndoing(true);
    setMessage("Reverting entry...");
    try {
      const res = await undoCheckInQrApi(lastEntry.qrToken, lastEntry.guests);
      const d = res?.data || {};
      const { qrToken } = lastEntry;
      setLastEntry(null);

      if (d.isGroupEntry && d.remaining >= 1) {
        // Ask the staff for the correct number (default 1).
        setPickedGuests(1);
        setGuestPicker({
          qrToken,
          remaining: d.remaining,
          alreadyEntered: d.alreadyEntered || 0,
          totalGuests: d.totalGuests || d.remaining,
          name: "",
        });
        setStatus("warning");
        setMessage("Entry reverted - select the correct number of guests");
      } else {
        setStatus("warning");
        setMessage("Entry reverted. Scan the QR again.");
        resetTimeoutRef.current = setTimeout(resumeScanning, RESET_DELAY_MS);
      }
    } catch (err) {
      const text =
        err.response?.data?.message ||
        (err.response
          ? "Could not undo this entry."
          : "No connection to the server. Check internet and try again.");
      setLastEntry(null);
      setStatus("error");
      setMessage(text);
      playBeep(220);
      setPopup({ tone: "error", title: "Could Not Edit", text });
    } finally {
      setUndoing(false);
    }
  };

  // Cancel: nobody is checked in, the pass stays fully valid for next time.
  const cancelGuests = () => {
    setGuestPicker(null);
    resumeScanning();
  };

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
          <span className="scannerHeaderTitle">Scan Ticket QR <small style={{ opacity: 0.7, fontWeight: 400 }}>v2</small></span>
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

        {/* Big green TICK on a correct scan (entry allowed). */}
        {status === "success" && (
          <div className="scanResult scanResult--success" aria-hidden="true">
            <StatusIcon type="tick" />
          </div>
        )}
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

      {status === "success" && lastEntry && (
        <div className="editEntryBar">
          <button
            type="button"
            className="editEntryBar__edit"
            onClick={editLastEntry}
            disabled={undoing}
          >
            Wrong count? Edit
          </button>
          <button
            type="button"
            className="editEntryBar__next"
            onClick={resumeScanning}
          >
            Next scan
          </button>
        </div>
      )}

      {guestPicker && (
        <div className="scanAlreadyOverlay" role="dialog" aria-modal="true">
          <div className="scanAlreadyBox guestPick">
            <h3 className="guestPick__title">How many guests are entering?</h3>
            {guestPicker.name && <p className="guestPick__name">{guestPicker.name}</p>}
            <p className="guestPick__info">
              Pass for {guestPicker.totalGuests} &middot;{" "}
              {guestPicker.alreadyEntered > 0
                ? `${guestPicker.alreadyEntered} already entered, `
                : ""}
              {guestPicker.remaining} left
            </p>

            <div className="guestPick__stepper">
              <button
                type="button"
                onClick={() => setPickedGuests((n) => Math.max(1, n - 1))}
                disabled={pickedGuests <= 1}
                aria-label="Fewer guests"
              >
                &minus;
              </button>
              <b>{pickedGuests}</b>
              <button
                type="button"
                onClick={() => setPickedGuests((n) => Math.min(guestPicker.remaining, n + 1))}
                disabled={pickedGuests >= guestPicker.remaining}
                aria-label="More guests"
              >
                +
              </button>
            </div>

            {guestPicker.remaining - pickedGuests > 0 && (
              <p className="guestPick__later">
                {guestPicker.remaining - pickedGuests} can scan this QR again later.
              </p>
            )}

            <button type="button" className="guestPick__ok" onClick={confirmGuests}>
              Allow {pickedGuests} {pickedGuests === 1 ? "guest" : "guests"}
            </button>
            <button type="button" className="guestPick__cancel" onClick={cancelGuests}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {popup && (
        <div className="scanAlreadyOverlay" role="alertdialog" aria-modal="true">
          <div className={`scanAlreadyBox scanAlreadyBox--${popup.tone}`}>
            <div className="scanAlreadyIcon">
              <StatusIcon type={popup.tone === "warning" ? "warn" : "cross"} />
            </div>
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