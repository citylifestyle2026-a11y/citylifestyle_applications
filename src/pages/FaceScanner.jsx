import { useEffect, useRef, useState, useCallback } from "react";
import { faceMatchApi, faceCheckInApi } from "../services/qrService";
import { speak } from "../services/speak";
import "./Scanner.css";

// Face Scan = second way to let a person in (next to the QR).
//   1. The camera finds a face and makes its 128-number "fingerprint" ON THE PHONE
//      (the photo itself is never sent to the server).
//   2. The server compares it with the fingerprints of the photos people
//      uploaded when they registered, and answers with the best match.
//   3. A clear match is let in AUTOMATICALLY (no "Allow entry" button): the
//      screen shows "Thank you" and the voice says "Thank you". A face that
//      does not match shows "Not recognised" (and says it).

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


const FaceScanner = () => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const statusRef = useRef("loading");
  const faceapiRef = useRef(null);
  const resetTimeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  const [status, setStatus] = useState("loading"); // loading | scanning | checking | success | warning | error
  const [message, setMessage] = useState("Loading face scanner...");
  const [facing, setFacing] = useState("environment"); // back camera = staff point it at the guest
  const [cameraError, setCameraError] = useState("");
  const [popup, setPopup] = useState(null); // { tone, title, text }

  const go = useCallback((next, text) => {
    statusRef.current = next;
    setStatus(next);
    if (text) setMessage(text);
  }, []);

  const resume = useCallback(() => {
    clearTimeout(resetTimeoutRef.current);
    if (!isMountedRef.current) return;
    setPopup(null);
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
  // ---------- matched face -> let the person in by itself ----------
  const checkInMatched = useCallback(
    async (data) => {
      try {
        const res = await faceCheckInApi(data.ticketId);
        const d = res?.data || {};
        const name = d.attendee?.name || data.attendee?.name || "";
        playBeep(880);
        speak("Thank you");
        go(
          "success",
          `Thank you${name ? `, ${name}` : ""}!${
            d.isGroupEntry && d.remaining > 0 ? ` ${d.remaining} more can enter on this pass.` : ""
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
        speak(isAlreadyUsed ? "Already entered" : "Entry not allowed");
        go(isAlreadyUsed ? "warning" : "error", text);
        setPopup({
          tone: isAlreadyUsed ? "warning" : "error",
          title: isAlreadyUsed ? "Already Scanned" : err.response ? "Entry Not Allowed" : "No Connection",
          text,
        });
      }
    },
    [go, resume]
  );

  const recognise = useCallback(async () => {
    const faceapi = faceapiRef.current;
    const video = videoRef.current;
    if (!faceapi || !video) return;

    go("checking", "Checking face...");

    try {
      // Read up to 3 frames and average them: glasses / masks / blinking make a
      // single frame noisy, the average is much more stable.
      const descriptors = [];
      for (let i = 0; i < 3; i += 1) {
        const f = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (f) descriptors.push(f.descriptor);
        if (i < 2) await new Promise((r) => setTimeout(r, 120));
      }

      if (descriptors.length === 0) {
        go("scanning", "Face not clear. Hold still and look at the camera");
        return;
      }

      const avg = new Array(128).fill(0);
      descriptors.forEach((d) => d.forEach((v, idx) => { avg[idx] += v / descriptors.length; }));
      const full = { descriptor: avg };

      const res = await faceMatchApi(full.descriptor);
      const data = res?.data || {};

      // Only a clear match (strong / good) is let in. A weak "please compare
      // carefully" match is treated as NOT recognised - there is no button
      // for staff to confirm any more.
      if (!data.matched || data.level === "check") {
        playBeep(220);
        speak(data.reason === "no_active_event" ? "No running event" : "Not recognised");
        go("error", "Not recognised");
        setPopup({
          tone: "error",
          title: "Not Recognised",
          text:
            data.reason === "no_faces_enrolled"
              ? `No registered photos found yet. Please scan the guest's QR instead.${
                data.debug
                  ? ` [events ${data.debug.activeEvents}, tickets ${data.debug.tickets}, photos ${data.debug.withPhoto}, face data ${data.debug.withFaceData}, no face found ${data.debug.photoButNoFaceFound}, engine ${data.debug.faceEngine}]`
                  : ""
              }`
              : data.reason === "no_active_event"
              ? "There is no running event right now."
              : "This face does not match any registered photo. Please scan the guest's QR instead.",
        });
        return;
      }

      if (data.alreadyEntered) {
        playBeep(440);
        speak("Already entered");
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

      // Clear match -> check in right away ("Thank you").
      await checkInMatched(data);
    } catch (err) {
      const serverMsg = err.response?.data?.message;
      playBeep(220);
      speak("Not recognised");
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
  }, [go, checkInMatched]);

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
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 })
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

  // Oval colour = what is happening: white = waiting for a face, blue =
  // checking, green = let in, amber = already entered, red = not recognised.
  const ovalClass =
    status === "success"
      ? "faceOval faceOval--green"
      : status === "checking"
      ? "faceOval faceOval--blue faceOval--pulse"
      : status === "warning"
      ? "faceOval faceOval--amber"
      : status === "error"
      ? "faceOval faceOval--red faceOval--pulse"
      : "faceOval";

  const messageClass =
    status === "success"
      ? "scannerMessage scannerMessage--green"
      : status === "checking"
      ? "scannerMessage scannerMessage--blue"
      : status === "warning"
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

      {status === "success" && (
        <div className="scanAlreadyOverlay" role="status" aria-live="polite">
          <div className="scanAlreadyBox scanAlreadyBox--success">
            <h3 className="scanAlreadyTitle">Thank you</h3>
            <p className="scanAlreadyText">{message}</p>
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