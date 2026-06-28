import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./AuthorLogin.css"; // Reuse the realistic open book styles

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("user"); // "user" or "author"
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [step, setStep] = useState(1); // 1 = request reset, 2 = reset password
    
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [mockOtp, setMockOtp] = useState("");
    const [emailSent, setEmailSent] = useState(false);

    const handleRequestOtp = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");
        
        try {
            const res = await axios.post("http://localhost:5000/api/forgot-password", { email, role });
            const isSent = res.data.email_sent;
            setEmailSent(isSent);

            if (isSent) {
                setSuccess("A verification OTP code has been sent to your email address!");
                setMockOtp("");
            } else {
                setSuccess("OTP code generated (using diagnostic fallback)!");
                if (res.data.otp) {
                    setMockOtp(res.data.otp);
                }
            }
            setStep(2);
        } catch (err) {
            setError(err.response?.data?.error || "Account check failed.");
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        try {
            const res = await axios.post("http://localhost:5000/api/reset-password", {
                email,
                role,
                otp,
                newPassword
            });
            setSuccess(res.data.message || "Password updated successfully!");
            
            // Redirect back to login after a brief delay
            setTimeout(() => {
                if (role === "author") {
                    navigate("/AuthorLogin");
                } else {
                    navigate("/login-register");
                }
            }, 2500);
        } catch (err) {
            setError(err.response?.data?.error || "Password reset failed.");
        }
    };

    return (
        <div className="auth-page-wrapper">
            <div className="auth-book-scene">
                <div className="auth-container">
                    
                    {/* Leather spine on left */}
                    <div className="auth-spine"></div>

                    {/* Ribbon bookmark */}
                    <div className="auth-ribbon"></div>

                    {/* Spine gutters & edge shadows */}
                    <div className="auth-gutter"></div>
                    <div className="auth-edge"></div>

                    <div className="auth-content">
                        <h2>Reset Password</h2>

                        <div className="auth-rule">
                            <div className="auth-rule-inner">
                                <div className="auth-rule-diamond"></div>
                                <span className="auth-ornament">Account Recovery</span>
                                <div className="auth-rule-diamond"></div>
                            </div>
                        </div>

                        {error && <p className="error-msg">{error}</p>}
                        {success && <p className="success-text" style={{ 
                            color: "#155724", 
                            backgroundColor: "#d4edda", 
                            border: "1px solid #c3e6cb", 
                            padding: "9px 14px", 
                            borderRadius: "2px", 
                            fontSize: "13px", 
                            marginTop: "10px", 
                            fontWeight: "600",
                            position: "relative",
                            zIndex: 6 
                        }}>{success}</p>}

                        {step === 1 ? (
                            <form onSubmit={handleRequestOtp} style={{ width: "100%", marginTop: "15px" }}>
                                <div style={{ marginBottom: "15px", display: "flex", gap: "20px", justifyContent: "center", position: "relative", zIndex: 6 }}>
                                    <label style={{ fontSize: "14px", color: "#5c381f", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                                        <input 
                                            type="radio" 
                                            name="role" 
                                            value="user" 
                                            checked={role === "user"} 
                                            onChange={() => setRole("user")}
                                            style={{ width: "auto", margin: 0 }}
                                        />
                                        Reader
                                    </label>
                                    <label style={{ fontSize: "14px", color: "#5c381f", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                                        <input 
                                            type="radio" 
                                            name="role" 
                                            value="author" 
                                            checked={role === "author"} 
                                            onChange={() => setRole("author")}
                                            style={{ width: "auto", margin: 0 }}
                                        />
                                        Author
                                    </label>
                                </div>

                                <input
                                    type="email"
                                    placeholder="Enter your Email Address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />

                                <button type="submit">Send OTP</button>

                                <div className="register" style={{ marginTop: "20px" }}>
                                    <a href="/login-register" style={{ fontSize: "13px" }}>← Back to Reader Login</a>
                                    <span style={{ margin: "0 10px", color: "#c59b6d" }}>|</span>
                                    <a href="/AuthorLogin" style={{ fontSize: "13px" }}>Author Login</a>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={handleResetPassword} style={{ width: "100%", marginTop: "15px" }}>
                                {mockOtp && (
                                    <div style={{ 
                                        background: "rgba(240, 217, 176, 0.4)", 
                                        border: "1.5px dashed #9a7040", 
                                        padding: "10px", 
                                        marginBottom: "15px", 
                                        fontSize: "13px", 
                                        color: "#5c381f",
                                        borderRadius: "2px",
                                        position: "relative",
                                        zIndex: 6
                                    }}>
                                        🔑 Test Mode OTP Code: <strong>{mockOtp}</strong>
                                    </div>
                                )}

                                <input
                                    type="text"
                                    placeholder="Enter 6-digit OTP Code"
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value)}
                                    maxLength={6}
                                    required
                                />
                                
                                <input
                                    type="password"
                                    placeholder="Enter New Password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    minLength={4}
                                    required
                                />

                                <input
                                    type="password"
                                    placeholder="Confirm New Password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    minLength={4}
                                    required
                                />

                                <button type="submit">Reset Password</button>

                                <div className="register" style={{ marginTop: "20px" }}>
                                    <span style={{ cursor: "pointer", fontSize: "13px", color: "#4a2a10", fontWeight: "bold" }} onClick={() => setStep(1)}>
                                        ← Change Email / Request Code
                                    </span>
                                </div>
                            </form>
                        )}
                    </div>

                    <div className="auth-page-curl"></div>
                    <span className="auth-page-number">— iv —</span>
                </div>
            </div>
        </div>
    );
};

export default ForgotPassword;
