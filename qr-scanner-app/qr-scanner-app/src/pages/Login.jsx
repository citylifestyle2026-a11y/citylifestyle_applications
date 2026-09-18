import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Login.css";

const Login = () => {
  const { login, loading, error } = useAuth();
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await login(loginId.trim(), password);
    if (success) {
      navigate("/scanner", { replace: true });
    }
  };

  return (
    <div className="loginScreen">
      <div className="loginCard">
        <h1 className="loginTitle">City Lifestyle</h1>
        <p className="loginSubtitle">Sign in to start scanning tickets</p>

        <form onSubmit={handleSubmit} className="loginForm">
          <label className="loginLabel" htmlFor="loginId">
            Email or Mobile Number
          </label>
          <input
            id="loginId"
            type="text"
            className="loginInput"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="username"
            required
          />

          <label className="loginLabel" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="loginInput"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && <div className="loginError">{error}</div>}

          <button type="submit" className="loginButton" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;