import api from "../api/axios";

// Same endpoint/shape as the main admin panel's authService.js
export const loginApi = async (data) => {
  const response = await api.post("/auth/login", data);
  return response.data;
};

export const getProfileApi = async () => {
  const response = await api.get("/auth/profile");
  return response.data;
};

// ===== Forgot Password (OTP via email) =====
export const forgotPasswordApi = async (data) => {
  const response = await api.post("/auth/forgot-password", data);
  return response.data;
};

export const resetPasswordWithOtpApi = async (data) => {
  const response = await api.post("/auth/reset-password-confirm", data);
  return response.data;
};