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
