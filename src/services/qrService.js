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
