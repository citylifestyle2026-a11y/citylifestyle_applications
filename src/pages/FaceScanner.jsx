import { useEffect, useRef, useState, useCallback } from "react";
import { faceMatchApi, faceCheckInApi } from "../services/qrService";
import "./Scanner.css";

// Face Scan = second way to let a person in (next to the QR).
//   1. The camera finds a face and makes its 128-number "fingerprint" ON THE PHONE
//      (the photo itself is never sent to the server).
//   2. The server compares it with the fingerprints of the photos people
//      uploaded when they registered, and answers with the best match.
//   3. The staff see the registered photo next to the live face and press
//      "Allow entry". Only then the ticket is checked in.

const MODEL_URL = `${import.meta.env.BASE_URL}models`;

// How long the green "entry allowed" result stays before scanning resumes.
const RESET_DELAY_MS = 2200;

// Loaded once, only when the Face tab is opened (the library is large).
let faceapiPromise = null;
const loadFaceApi = () => {
  if (!faceapiPromise) {
    faceapiPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      await faceapi.tf.ready();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      return faceapi;
    })().catch((error) => {
      faceapiPromise = null; // allow a retry
      throw error;
    });
  }
  return faceapiPromise;
};

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

// The live server shows uploaded images under /api/uploads (see backend app.js).
const toImageUrl = (url) =>
  url ? url.replace(/^(https?:\/\/[^/]+)\/uploads\//, "$1/api/uploads/") : "";

const LEVEL_TEXT = {
  high: "Strong match",
  good: "Good match",
  check: "Please compare carefully",
};

const FaceScanner = () => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const statusRef = useRef("loading");
  const faceapiRef = useRef(null);
  const resetTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  const [status, setStatus] = useState("loading"); // loading | scanning | checking | confirm | success | warning | error
  const [message, setMessage] = useState("Loading face scanner...");
  const [facing, setFacing] = useState("environment"); // back camera = staff point it at the guest
  const [cameraError, setCameraError] = useState("");
  const [match, setMatch] = useState(null); // { ...server match, snapshot }
  const [popup, setPopup] = useState(null); // { tone, title, text }
  const [confirming, setConfirming] = useState(false);

  const go = useCallback((next, text) => {
    statusRef.current = next;
    setStatus(next);
    if (text) setMessage(text);
  }, []);

  const resume = useCallback(() => {
    clearTimeout(resetTimeoutRef.current);
    if (!isMountedRef.current) return;
    setMatch(null);
    setPopup(null);
    setConfirming(false);
    go("scanning", "Show the guest's face to the camera");
  }, [go]);

  // ---------- camera ----------
  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startCamera = useCallback(async () => {
    stopStream();
    // The QR camera may still be shutting down for a moment after switching
    // tabs, so try a few times before giving up.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!isMountedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraError("");
        return;
      } catch (error) {
        if (attempt === 3) {
          setCameraError(
            error?.name === "NotAllowedError"
              ? "Camera permission is blocked. Allow the camera for this app."
              : "Could not start the camera."
          );
          return;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
    }
  }, [facing]);

  useEffect(() => {
    isMountedRef.current = true;
    startCamera();

    // Android can silently stop the camera (screen off / app in background).
    const onVisible = () => {
      const track = streamRef.current?.getVideoTracks?.()[0];
      if (document.visibilityState === "visible" && (!track || track.readyState !== "live")) {
        startCamera();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      isMountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(resetTimeoutRef.current);
      stopStream();
    };
  }, [startCamera]);

  // ---------- load models ----------
  useEffect(() => {
    let cancelled = false;
    loadFaceApi()
      .then((faceapi) => {
        if (cancelled) return;
        faceapiRef.current = faceapi;
        go("scanning", "Show the guest's face to the camera");
      })
      .catch(() => {
        if (cancelled) return;
        go("error", "Face scanner could not load. Restart the app and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [go]);

  // ---------- one recognition round ----------
  const recognise = useCallback(async () => {
    const faceapi = faceapiRef.current;
    const video = videoRef.current;
    if (!faceapi || !video) return;

    go("checking", "Checking face...");

    try {
      const full = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!full) {
        go("scanning", "Face not clear. Hold still and look at the camera");
        return;
      }

      // Small snapshot so the staff can compare it with the registered photo.
      const canvas = document.createElement("canvas");
      const scale = 360 / Math.max(video.videoWidth, 1);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      const snapshot = canvas.toDataURL("image/jpeg", 0.7);

      const res = await faceMatchApi(Array.from(full.descriptor));
      const data = res?.data || {};

      if (!data.matched) {
        playBeep(220);
        go("error", "Face not recognised");
        setPopup({
          tone: "error",
          title: "Face Not Recognised",
          text:
            data.reason === "no_faces_enrolled"
              ? "No registered photos found yet. Please scan the guest's QR instead."
              : data.reason === "no_active_event"
              ? "There is no running event right now."
              : "This face does not match any registered photo. Please scan the guest's QR instead.",
        });
        return;
      }

      if (data.alreadyEntered) {
        playBeep(440);
        go("warning", `Already entered - ${data.attendee?.name || ""}`);
        setPopup({
          tone: "warning",
          title: "Already Scanned",
          text: `${data.attendee?.name || "This guest"} has already entered${
            data.scannedAt ? ` at ${new Date(data.scannedAt).toLocaleTimeString()}` : ""
          }.`,
        });
        return;
      }

      // Found: staff compare the two faces and confirm.
      playBeep(660);
      setMatch({ ...data, snapshot });
      go("confirm", "Check the photo, then allow entry");
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      playBeep(220);
      go("error", serverMsg || "Could not check the face.");
      setPopup({
        tone: "error",
        title: err.response ? "Face Check Failed" : "No Connection",
        text:
          serverMsg ||
          (err.response
            ? "Could not check this face."
            : "No connection to the server. Check internet and try again."),
      });
    }
  }, [go]);

  // ---------- detection loop (cheap face finder, runs while "scanning") ----------
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    let stable = 0;

    const tick = async () => {
      if (cancelled) return;
      const faceapi = faceapiRef.current;
      const video = videoRef.current;

      const ready =
        faceapi &&
        video &&
        statusRef.current === "scanning" &&
        video.readyState >= 2 &&
        video.videoWidth > 0;

      if (!ready) {
        stable = 0;
        timer = setTimeout(tick, 300);
        return;
      }

      try {
        const det = await faceapi.detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.6 })
        );

        if (det) {
          const { box } = det;
          const big = box.width / video.videoWidth >= 0.18;
          const cx = (box.x + box.width / 2) / video.videoWidth;
          const cy = (box.y + box.height / 2) / video.videoHeight;
          const centered = cx > 0.2 && cx < 0.8 && cy > 0.15 && cy < 0.85;

          if (big && centered) {
            stable += 1;
          } else {
            stable = 0;
            setMessage(big ? "Move the face to the centre" : "Come closer");
          }

          // Two good frames in a row = the face is steady enough to read.
          if (stable >= 2) {
            stable = 0;
            await recognise();
          }
        } else {
          stable = 0;
          setMessage("Show the guest's face to the camera");
        }
      } catch {
        // A bad frame is not an error; try the next one.
      }

      if (!cancelled) timer = setTimeout(tick, 250);
    };

    timer = setTimeout(tick, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [recognise]);

  // ---------- staff actions ----------
  const allowEntry = async () => {
    if (!match || confirming) return;
    setConfirming(true);
    try {
      const res = await faceCheckInApi(match.ticketId);
      const d = res?.data || {};
      const name = d.attendee?.name || match.attendee?.name || "";
      playBeep(880);
      setMatch(null);
      go(
        "success",
        `Entry allowed${name ? ` - ${name}` : ""}${
          d.isGroupEntry && d.remaining > 0 ? ` - ${d.remaining} more can enter on this pass` : ""
        }`
      );
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = setTimeout(resume, RESET_DELAY_MS);
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      const text =
        serverMsg ||
        (err.response
          ? "This ticket could not be checked in."
          : "No connection to the server. Check internet and try again.");
      const isAlreadyUsed = /already.*(used|checked)/i.test(String(serverMsg || ""));
      playBeep(isAlreadyUsed ? 440 : 220);
      setMatch(null);
      go(isAlreadyUsed ? "warning" : "error", text);
      setPopup({
        tone: isAlreadyUsed ? "warning" : "error",
        title: isAlreadyUsed ? "Already Scanned" : err.response ? "Entry Not Allowed" : "No Connection",
        text,
      });
    } finally {
      setConfirming(false);
    }
  };

  const ovalClass =
    status === "success"
      ? "faceOval faceOval--green"
      : status === "checking"
      ? "faceOval faceOval--blue faceOval--pulse"
      : status === "warning" || status === "confirm"
      ? "faceOval faceOval--amber"
      : status === "error"
      ? "faceOval faceOval--red faceOval--pulse"
      : "faceOval faceOval--red";

  const messageClass =
    status === "success"
      ? "scannerMessage scannerMessage--green"
      : status === "checking"
      ? "scannerMessage scannerMessage--blue"
      : status === "warning" || status === "confirm"
      ? "scannerMessage scannerMessage--amber"
      : status === "error"
      ? "scannerMessage scannerMessage--red"
      : "scannerMessage scannerMessage--neutral";

  return (
    <>
      <div className="scannerViewport">
        <video
          ref={videoRef}
          className={`faceVideo${facing === "user" ? " faceVideo--mirror" : ""}`}
          playsInline
          muted
          autoPlay
        />
        <div className={ovalClass} />

        <button
          type="button"
          className="faceFlipBtn"
          onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}
          aria-label="Switch camera"
        >
          Switch camera
        </button>
      </div>

      <div className={messageClass}>{message}</div>

      {cameraError && (
        <div className="editEntryBar">
          <button type="button" className="editEntryBar__next" onClick={startCamera}>
            {cameraError} Tap to retry
          </button>
        </div>
      )}

      {status === "confirm" && match && (
        <div className="scanAlreadyOverlay" role="dialog" aria-modal="true">
          <div className="scanAlreadyBox faceConfirm">
            <h3 className="guestPick__title">Is this the same person?</h3>

            <div className="faceCompare">
              <figure>
                {match.attendee?.profileImage ? (
                  <img src={toImageUrl(match.attendee.profileImage)} alt="Registered" />
                ) : (
                  <div className="faceCompare__empty">No photo</div>
                )}
                <figcaption>Registered</figcaption>
              </figure>
              <figure>
                <img src={match.snapshot} alt="Live camera" />
                <figcaption>Camera now</figcaption>
              </figure>
            </div>

            <p className="guestPick__name">{match.attendee?.name || match.booking?.name}</p>
            <p className="guestPick__info">
              {[match.ticketType?.ticketName, match.event?.title].filter(Boolean).join(" · ")}
            </p>
            <p className={`faceLevel faceLevel--${match.level}`}>{LEVEL_TEXT[match.level] || ""}</p>

            <button type="button" className="guestPick__ok" onClick={allowEntry} disabled={confirming}>
              {confirming ? "Please wait..." : "Allow entry"}
            </button>
            <button type="button" className="guestPick__cancel" onClick={resume} disabled={confirming}>
              Not this person
            </button>
          </div>
        </div>
      )}

      {popup && (
        <div className="scanAlreadyOverlay" role="alertdialog" aria-modal="true">
          <div className={`scanAlreadyBox scanAlreadyBox--${popup.tone}`}>
            <h3 className="scanAlreadyTitle">{popup.title}</h3>
            <p className="scanAlreadyText">{popup.text}</p>
            <button type="button" className="scanAlreadyOk" onClick={resume}>
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default FaceScanner;
