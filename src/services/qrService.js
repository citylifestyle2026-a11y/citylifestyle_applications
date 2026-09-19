import api from "../api/axios";

// Same endpoints your backend already exposes (backend/controllers/qr.controller.js)
export const verifyQrApi = async (qrToken) => {
  const response = await api.post("/qr/verify", { qrToken });
  return response.data;
};

export const checkInQrApi = async (qrToken) => {
  const response = await api.post("/qr/check-in", { qrToken });
  return response.data;
};
