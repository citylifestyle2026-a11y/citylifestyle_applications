import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { forgotPasswordApi, resetPasswordWithOtpApi } from "../services/authService";
import logo from "../assets/city-lifestyle-logo.jpg";
import "./Login.css";

// Simple inline icons (no external icon library needed, keeps the APK small).
const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-6.06M9.9 4.24A9.6 9.6 0 0 1 12 4c7 0 11 8 11 8a20.4 20.4 0 0 1-3.22 4.37M14.12 14.12a3 3 0 1 1-4.24-4.24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const EmailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="m2 6 10 7 10-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const KeyIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <circle cx="8" cy="15" r="4" stroke="currentColor" strokeWidth="1.8" />
    <path d="M10.5 12.5 20 3M20 3h-4M20 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PasswordField = ({ id, label, icon, value, onChange, show, onToggle, autoComplete }) => (
  <div className="ctLogin__field">
    <label className="ctLogin__label" htmlFor={id}>
      {label}
    </label>
    <div className="ctLogin__inputWrapper">
      <span className="ctLogin__icon">{icon}</span>
      <input
        id={id}
        type={show ? "text" : "password"}
        className="ctLogin__input"
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        className="ctLogin__toggleBtn"
        onClick={onToggle}
        onMouseDown={(e) => e.preventDefault()}
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  </div>
);

const Login = () => {
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();

  // "login" -> "forgot-email" -> "forgot-reset"
  const [view, setView] = useState("login");

  // ----- Login view -----
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(loginId.trim(), password);
    if (success) {
      navigate("/scanner", { replace: true });
    }
  };

  // ----- Forgot password: step 1 (email) -----
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotInfo, setForgotInfo] = useState("");

  const goToForgotPassword = () => {
    setForgotEmail("");
    setForgotError("");
    setForgotInfo("");
    setView("forgot-email");
  };

  const goBackToLogin = () => {
    setForgotError("");
    setForgotInfo("");
    setView("login");
  };

  const handleForgotEmailSubmit = async (e) => {
    e.preventDefault();
    if (!forgotEmail.trim()) {
      setForgotError("Email is required.");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      await forgotPasswordApi({ email: forgotEmail.trim() });
      setOtp("");
      setNewPassword("");
      setConfirmPassword("");
      setResetError("");
      setView("forgot-reset");
    } catch (err) {
      setForgotError(
        err.response?.data?.message || err.message || "Something went wrong. Please try again."
      );
    } finally {
      setForgotLoading(false);
    }
  };

  // ----- Forgot password: step 2 (OTP + new password) -----
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  const handleResetSubmit = async (e) => {
    e.preventDefault();

    if (!otp.trim()) {
      setResetError("OTP is required.");
      return;
    }
    if (!newPassword) {
      setResetError("New password is required.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }

    setResetLoading(true);
    setResetError("");
    try {
      await resetPasswordWithOtpApi({
        email: forgotEmail.trim(),
        otp: otp.trim(),
        newPassword,
        confirmPassword,
      });
      setForgotInfo("Password reset successfully. Please sign in.");
      setView("login");
    } catch (err) {
      setResetError(
        err.response?.data?.message || err.message || "Something went wrong. Please try again."
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="ctLogin__page">
      <div className="ctLogin__card">
        <div className="ctLogin__brand">
          <img src={logo} alt="City Toppers" className="ctLogin__logo" />
          <h1 className="ctLogin__title">City Toppers</h1>
          <p className="ctLogin__subtitle">
            {view === "login" && "Sign in to start scanning tickets"}
            {view === "forgot-email" && "Reset your password"}
            {view === "forgot-reset" && "Enter the OTP sent to your email"}
          </p>
        </div>

        {/* ================= LOGIN VIEW ================= */}
        {view === "login" && (
          <form className="ctLogin__form" onSubmit={handleSubmit} noValidate>
            {error && <div className="ctLogin__alert">{error}</div>}
            {forgotInfo && <div className="ctLogin__success">{forgotInfo}</div>}

            <div className="ctLogin__field">
              <label className="ctLogin__label" htmlFor="loginId">
                Email or Mobile Number
              </label>
              <div className="ctLogin__inputWrapper">
                <span className="ctLogin__icon">
                  <EmailIcon />
                </span>
                <input
                  id="loginId"
                  type="text"
                  className="ctLogin__input"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <PasswordField
              id="password"
              label="Password"
              icon={<LockIcon />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              show={showPassword}
              onToggle={() => setShowPassword((p) => !p)}
              autoComplete="current-password"
            />

            <button
              type="button"
              className="ctLogin__forgotLink"
              onClick={goToForgotPassword}
            >
              Forgot Password?
            </button>

            <button type="submit" className="ctLogin__button" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        )}

        {/* ================= FORGOT PASSWORD: EMAIL ================= */}
        {view === "forgot-email" && (
          <form className="ctLogin__form" onSubmit={handleForgotEmailSubmit} noValidate>
            {forgotError && <div className="ctLogin__alert">{forgotError}</div>}

            <div className="ctLogin__field">
              <label className="ctLogin__label" htmlFor="forgotEmail">
                Registered Email
              </label>
              <div className="ctLogin__inputWrapper">
                <span className="ctLogin__icon">
                  <EmailIcon />
                </span>
                <input
                  id="forgotEmail"
                  type="email"
                  className="ctLogin__input"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <button type="submit" className="ctLogin__button" disabled={forgotLoading}>
              {forgotLoading ? "Sending OTP..." : "Send OTP"}
            </button>

            <button type="button" className="ctLogin__backLink" onClick={goBackToLogin}>
              &larr; Back to Sign In
            </button>
          </form>
        )}

        {/* ================= FORGOT PASSWORD: OTP + NEW PASSWORD ================= */}
        {view === "forgot-reset" && (
          <form className="ctLogin__form" onSubmit={handleResetSubmit} noValidate>
            {resetError && <div className="ctLogin__alert">{resetError}</div>}

            <div className="ctLogin__field">
              <label className="ctLogin__label" htmlFor="otp">
                OTP
              </label>
              <div className="ctLogin__inputWrapper">
                <span className="ctLogin__icon">
                  <KeyIcon />
                </span>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  className="ctLogin__input"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                />
              </div>
            </div>

            <PasswordField
              id="newPassword"
              label="New Password"
              icon={<LockIcon />}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              show={showNewPassword}
              onToggle={() => setShowNewPassword((p) => !p)}
              autoComplete="new-password"
            />

            <PasswordField
              id="confirmPassword"
              label="Confirm New Password"
              icon={<LockIcon />}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              show={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((p) => !p)}
              autoComplete="new-password"
            />

            <button type="submit" className="ctLogin__button" disabled={resetLoading}>
              {resetLoading ? "Resetting..." : "Reset Password"}
            </button>

            <button type="button" className="ctLogin__backLink" onClick={goBackToLogin}>
              &larr; Back to Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;