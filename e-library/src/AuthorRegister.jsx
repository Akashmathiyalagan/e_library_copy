import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./AuthorRegister.css";

const AuthorRegister = () => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        try {
            const response = await axios.post("http://localhost:5000/api/authors/register", {
                name,
                email,
                password
            });

            setSuccess("Registration successful! Redirecting to login...");
            setTimeout(() => navigate("/AuthorLogin"), 1000);
        } catch (err) {
            if (err.response && err.response.data.error) {
                setError(err.response.data.error);
            } else {
                setError("Registration failed. Try again.");
            }
        }
    };

    return (
        <div className="auth-page-wrapper">
            <div className="auth-container">
                <div className="auth-box">
                    <h2>Author Registration</h2>
                    {error && <p className="error-msg">{error}</p>}
                    {success && <p className="success-msg">{success}</p>}
                    <form onSubmit={handleRegister}>
                        <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
                        <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        <input type="password" placeholder="Create Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        <button type="submit">Register</button>
                    </form>
                    <p>Already have an account? <a href="/AuthorLogin">Login here</a></p>
                </div>
            </div>
        </div>
    );
};

export default AuthorRegister;
