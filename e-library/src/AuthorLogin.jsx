import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./AuthorLogin.css";

const AuthorLogin = () => {
    const [email, setEmail]       = useState("");
    const [password, setPassword] = useState("");
    const [error, setError]       = useState("");
    const navigate                = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post("http://localhost:5000/api/authors/login", { email, password });
            localStorage.setItem("authorToken", response.data.token);
            localStorage.setItem("authorEmail", email);
            navigate("/PublisherDashboard");
        } catch (err) {
            setError(err.response?.data?.message || "Invalid email or password.");
        }
    };

    return (
        <div className="auth-page-wrapper">
            {/* 3-D Perspective Stage */}
            <div className="auth-book-scene">
                <div className="auth-container">

                    {/* Spine on left */}
                    <div className="auth-spine"></div>

                    {/* Ribbon bookmark */}
                    <div className="auth-ribbon"></div>

                    {/* Gutter + edge shadows */}
                    <div className="auth-gutter"></div>
                    <div className="auth-edge"></div>

                    {/* Content */}
                    <div className="auth-content">
                        <h2>Author Login</h2>

                        {/* Ornamental rule */}
                        <div className="auth-rule">
                            <div className="auth-rule-inner">
                                <div className="auth-rule-diamond"></div>
                                <span className="auth-ornament">Author Portal</span>
                                <div className="auth-rule-diamond"></div>
                            </div>
                        </div>

                        {error && <p className="error-msg">{error}</p>}

                        <form onSubmit={handleLogin} style={{ width: "100%" }}>
                            <input
                                type="email"
                                placeholder="Email Address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button type="submit">Login</button>
                        </form>
                        <p className="forgot-password" onClick={() => navigate("/forgot-password")} style={{ cursor: "pointer", color: "#8c6239", fontSize: "0.85rem", marginTop: "12px", fontStyle: "italic", textAlign: "center" }}>
                            Forgot Password?
                        </p>

                        <div className="register">
                            <p>Don't have an account? <a href="/AuthorRegister">Register here</a></p>
                        </div>
                    </div>

                    {/* Page curl — bottom right */}
                    <div className="auth-page-curl"></div>

                    <span className="auth-page-number">— iii —</span>
                </div>
            </div>
        </div>
    );
};

export default AuthorLogin;
