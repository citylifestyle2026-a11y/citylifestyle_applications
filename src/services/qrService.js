import api from "../api/axios";

// Same endpoints your backend already exposes (backend/controllers/qr.controller.js)
export const verifyQrApi = async (qrToken) => {
  const response = await api.post("/qr/verify", { qrToken });
  return response.data;
};

// `guests` is optional: for a pass with 2+ guests left the server first answers
// { needsGuestCount: true, remaining, ... } and the scanner calls this again
// with the number of people who are entering now.
export const checkInQrApi = async (qrToken, guests) => {
  const response = await api.post("/qr/check-in", {
    qrToken,
    askGuests: true,
    ...(guests ? { guests } : {}),
  });
  return response.data;
};

// Staff allowed the wrong number of guests: put the last entry back so the
// same QR can be scanned again with the correct count.
export const undoCheckInQrApi = async (qrToken, guests) => {
  const response = await api.post("/qr/undo-check-in", {
    qrToken,
    ...(guests ? { guests } : {}),
  });
  return response.data;
};

// ===== FACE SCAN =====
// `descriptor` = 128 numbers made from the live camera face (see
// pages/FaceScanner.jsx). The server only SEARCHES here - nothing is
// checked in until the staff confirm and faceCheckInApi is called.
export const faceMatchApi = async (descriptor) => {
  const response = await api.post("/qr/face-match", { descriptor });
  return response.data;
};

export const faceCheckInApi = async (ticketId) => {
  const response = await api.post("/qr/face-check-in", { ticketId });
  return response.data;
};
