import { createContext, useContext, useState, useCallback } from "react";
import { loginApi } from "../services/authService";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = useCallback(async (loginId, password) => {
    setLoading(true);
    setError("");
    try {
      // Backend expects the field name "login" (accepts email OR mobile
      // number in the same field) - NOT "email".
      const res = await loginApi({ login: loginId, password });
      // Backend response shape: { success, message, token, user } (token
      // and user are top-level, not nested under "data").
      const token = res?.token || res?.data?.token;
      const userData = res?.user || res?.data?.user || null;

      if (!token) {
        throw new Error("Login response did not include a token.");
      }

      localStorage.setItem("token", token);
      if (userData) localStorage.setItem("user", JSON.stringify(userData));

      setUser(userData);
      return true;
    } catch (err) {
      // Always prefer the backend's own message when the server responded
      // (e.g. "Password is incorrect", "Login and password are required").
      const serverMessage = err.response?.data?.message;

      let msg;
      if (serverMessage) {
        msg = serverMessage;
      } else if (err.response) {
        // Server responded, but with no readable message - fall back to a
        // status-specific explanation instead of Axios's generic text.
        if (err.response.status === 404) {
          msg =
            "Login service not found (404). The app's API address may be misconfigured.";
        } else if (err.response.status >= 500) {
          msg = "Server error. Please try again in a moment.";
        } else {
          msg = `Login failed (error ${err.response.status}).`;
        }
      } else if (err.request) {
        // Request was sent but no response ever came back - real network/
        // connectivity/CORS failure, not a credentials problem.
        msg =
          "Could not reach the server. Check your internet connection and try again.";
      } else {
        msg = err.message || "Login failed. Please check your credentials.";
      }

      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  const isAuthenticated = Boolean(localStorage.getItem("token"));

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated, loading, error, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);