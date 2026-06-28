import { useNavigate } from "react-router-dom";
import { useState } from "react";
import "./LoginRegister.css";

const LoginRegister = () => {
  const navigate = useNavigate();
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    const email    = event.target.email.value;
    const password = event.target.password.value;
    try {
      const response = await fetch("http://localhost:5000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem("token", data.token);
        sessionStorage.removeItem("preferencesApplied");
        sessionStorage.removeItem("notificationSent");
        navigate("/Dashboard");
      } else {
        setError(data.error || "Invalid email or password!");
      }
    } catch {
      setError("Error connecting to the server.");
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError(""); setSuccess("");
    const username = event.target.username.value;
    const email    = event.target.email.value;
    const password = event.target.password.value;
    try {
      const response = await fetch("http://localhost:5000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess("Registration successful! You can now log in.");
        event.target.reset();
      } else {
        setError(data.error || "Registration failed!");
      }
    } catch {
      setError("Error connecting to the server.");
    }
  };

  return (
    <div className="login-register-wrapper">
      {/* 3-D perspective stage */}
      <div className="book-scene">
        <div className="book-container">

          {/* Ribbon bookmark */}
          <div className="ribbon-bookmark"></div>

          {/* ── LEFT PAGE: Register ───────────────────────── */}
          <div className="page left-page">
            {/* Realistic shadow divs */}
            <div className="page-inner-shadow-outer"></div>
            <div className="page-inner-shadow-spine"></div>

            {/* Content layer */}
            <div className="page-content-inner">
              <h2 className="page-title">Register</h2>

              {/* Ornamental double rule */}
              <div className="page-rule">
                <div className="page-rule-inner">
                  <div className="page-rule-diamond"></div>
                  <span className="page-ornament">Create Account</span>
                  <div className="page-rule-diamond"></div>
                </div>
              </div>

              <form onSubmit={handleRegister} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <input type="text"     className="input-field" name="username" placeholder="Full Name"      required />
                <input type="email"    className="input-field" name="email"    placeholder="Email Address"  required />
                <input type="password" className="input-field" name="password" placeholder="Password"       required />
                <button type="submit"  className="button">Register</button>
              </form>

              {success && <p className="success-text">{success}</p>}
              {error   && <p className="error-text">{error}</p>}
            </div>

            {/* Bottom-left page curl */}
            <div className="page-curl-left"></div>
            <span className="page-number">— i —</span>
          </div>

          {/* ── SPINE ─────────────────────────────────────── */}
          <div className="book-spine-divider"></div>

          {/* ── RIGHT PAGE: Login ─────────────────────────── */}
          <div className="page right-page">
            <div className="page-inner-shadow-spine"></div>
            <div className="page-inner-shadow-outer"></div>

            <div className="page-content-inner">
              <h2 className="page-title">Login</h2>

              <div className="page-rule">
                <div className="page-rule-inner">
                  <div className="page-rule-diamond"></div>
                  <span className="page-ornament">Reader Access</span>
                  <div className="page-rule-diamond"></div>
                </div>
              </div>

              <form onSubmit={handleLogin} style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <input type="email"    className="input-field" name="email"    placeholder="Enter Email"    required />
                <input type="password" className="input-field" name="password" placeholder="Enter Password" required />
                <button type="submit"  className="button">Login</button>
              </form>

              {error && <p className="error-text">{error}</p>}
              <p className="toggle-text" onClick={() => navigate("/forgot-password")} style={{ cursor: "pointer" }}>Forgot Password?</p>
            </div>

            {/* Bottom-right page curl */}
            <div className="page-curl-right"></div>
            <span className="page-number">— ii —</span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default LoginRegister;
