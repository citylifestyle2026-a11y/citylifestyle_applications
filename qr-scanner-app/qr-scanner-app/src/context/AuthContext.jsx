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

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError("");
    try {
      const res = await loginApi({ email, password });
      // Backend shape: { success, message, data: { token, user } } (adjust
      // the two lines below if your /auth/login response is shaped differently)
      const token = res?.data?.token || res?.token;
      const userData = res?.data?.user || res?.user || null;

      if (!token) {
        throw new Error("Login response did not include a token.");
      }

      localStorage.setItem("token", token);
      if (userData) localStorage.setItem("user", JSON.stringify(userData));

      setUser(userData);
      return true;
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        "Login failed. Please check your credentials.";
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
