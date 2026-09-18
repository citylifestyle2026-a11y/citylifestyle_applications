import axios from "axios";

// IMPORTANT: This must point to your LIVE backend URL, not localhost,
// because the built APK runs on a phone and cannot reach your dev machine.
// Set VITE_API_BASE_URL in a ".env" file before running "npm run build".
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (import.meta.env.DEV && !API_BASE_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    "[api/axios] VITE_API_BASE_URL is not set. Create a .env file (see .env.example)."
  );
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes("/auth/login");

    if (error.response?.status === 401 && !isLoginRequest) {
      // Session expired / invalid token -> force back to login.
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

export default api;
