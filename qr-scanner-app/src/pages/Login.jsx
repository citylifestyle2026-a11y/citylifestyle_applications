import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/city-lifestyle-logo.jpg";
import "./Login.css";

// Simple inline eye / eye-off icons (no external icon library needed,
// keeps the APK small).
const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path
      d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path
      d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-6.06M9.9 4.24A9.6 9.6 0 0 1 12 4c7 0 11 8 11 8a20.4 20.4 0 0 1-3.22 4.37M14.12 14.12a3 3 0 1 1-4.24-4.24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <line
      x1="1"
      y1="1"
      x2="23"
      y2="23"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
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

const Login = () => {
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();

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

  return (
    <div className="ctLogin__page">
      <div className="ctLogin__card">
        <div className="ctLogin__brand">
          <img src={logo} alt="City Toppers" className="ctLogin__logo" />
          <h1 className="ctLogin__title">City Toppers</h1>
          <p className="ctLogin__subtitle">Sign in to start scanning tickets</p>
        </div>

        <form className="ctLogin__form" onSubmit={handleSubmit} noValidate>
          {error && <div className="ctLogin__alert">{error}</div>}

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

          <div className="ctLogin__field">
            <label className="ctLogin__label" htmlFor="password">
              Password
            </label>
            <div className="ctLogin__inputWrapper">
              <span className="ctLogin__icon">
                <LockIcon />
              </span>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="ctLogin__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="ctLogin__toggleBtn"
                onClick={() => setShowPassword((prev) => !prev)}
                onMouseDown={(e) => e.preventDefault()}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <button type="submit" className="ctLogin__button" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;