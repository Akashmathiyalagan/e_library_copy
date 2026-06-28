import React, { useEffect, useState } from "react";
import "./LandingPage.css";
import { useNavigate } from "react-router-dom";
import logoFallback from "./assets/logo.png";

const Landing = () => {
  const navigate = useNavigate();
  const [appImage, setAppImage] = useState(logoFallback);

  useEffect(() => {
    fetch("http://localhost:5000/get_logo")
      .then((res) => res.json())
      .then((data) => { if (data.logo_url) setAppImage(data.logo_url); })
      .catch((err) => console.error("Error fetching app image:", err));
  }, []);

  return (
    <div className="landing-container">
      {/* 3-D Perspective Stage */}
      <div className="book-scene-landing">
        <div className="open-book-spread">

          {/* Ribbon bookmark */}
          <div className="book-ribbon"></div>

          {/* ── LEFT PAGE: Classic Quote ───────────────────── */}
          <div className="book-page left-page">
            {/* Realistic gutter + edge shadows */}
            <div className="page-gutter-shadow"></div>
            <div className="page-edge-shadow"></div>

            {/* Ornate printed border frame */}
            <div className="page-frame"></div>

            <div className="page-content">
              <div className="vintage-divider top">✦ ✦ ✦</div>
              <h1 className="quote">
                <span className="drop-cap">A</span>room without books is like a body without a soul.
              </h1>
              <p className="quote-author">— Marcus Tullius Cicero</p>
              <div className="vintage-divider bottom">✦ ✦ ✦</div>
            </div>

            {/* Bottom-left page curl */}
            <div className="page-curl-bl"></div>
            <span className="page-num">— i —</span>
          </div>

          {/* ── SPINE ─────────────────────────────────────── */}
          <div className="book-spine"></div>

          {/* ── RIGHT PAGE: Navigation ───────────────────── */}
          <div className="book-page right-page">
            <div className="page-gutter-shadow"></div>
            <div className="page-edge-shadow"></div>

            <div className="page-content">
              {appImage && <img src={appImage} alt="App Logo" className="logo" />}
              <h2 className="welcome-title">E-LIBRARY</h2>
              <p className="welcome-subtitle">A Sanctuary for Minds &amp; Authors</p>

              {/* Decorative rule */}
              <div className="landing-rule">
                <div className="landing-rule-diamond"></div>
              </div>

              <div className="button-container">
                <button className="btn btn-author" onClick={() => navigate("/AuthorLogin")}>
                  Author Portal
                </button>
                <button className="btn btn-user" onClick={() => navigate("/login-register")}>
                  Reader Access
                </button>
              </div>
            </div>

            {/* Bottom-right page curl */}
            <div className="page-curl-br"></div>
            <span className="page-num">— ii —</span>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Landing;
