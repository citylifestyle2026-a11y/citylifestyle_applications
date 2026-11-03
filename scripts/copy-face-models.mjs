// Copies the 3 face-recognition model files from node_modules into
// public/models, so Vite puts them in dist/ and Capacitor bundles them
// inside the APK (Face Scan then works even with a slow connection).
// Runs automatically after "npm install".
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FILES = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model.bin",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model.bin",
];

try {
  const src = join(dirname(require.resolve("@vladmandic/face-api/package.json")), "model");
  const dest = join(process.cwd(), "public", "models");
  mkdirSync(dest, { recursive: true });
  for (const f of FILES) {
    if (existsSync(join(src, f))) cpSync(join(src, f), join(dest, f));
  }
  console.log("[face] models copied to public/models");
} catch (e) {
  console.warn("[face] could not copy models:", e.message);
}
