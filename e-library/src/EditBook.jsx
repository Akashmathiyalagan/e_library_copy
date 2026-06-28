import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import "./UploadBook.css"; // Reuse the beautiful publish scroll styles

const GENRES = [
  "Fiction", "Non-Fiction", "Mystery & Thriller", "Science Fiction",
  "Fantasy", "Romance", "Biography & Memoir", "History",
  "Self-Help & Personal Development", "Science & Technology",
  "Philosophy", "Children & Young Adult", "Poetry", "Horror",
  "Travel", "Religion & Spirituality", "Business & Economics",
  "Health & Wellness", "Art & Design", "Comics & Graphic Novels",
];

const LANGUAGES = [
  "English", "Tamil", "Hindi", "French", "Spanish", "German",
  "Portuguese", "Japanese", "Chinese", "Arabic", "Russian",
  "Italian", "Korean", "Malayalam", "Telugu", "Kannada",
];

const EditBook = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();

  // ── Core Info ──────────────────────────────────────────────
  const [title, setTitle]           = useState("");
  const [author, setAuthor]         = useState("");
  const [description, setDescription] = useState("");

  // ── Classification ─────────────────────────────────────────
  const [genre, setGenre]           = useState("");
  const [language, setLanguage]     = useState("English");
  const [tags, setTags]             = useState("");

  // ── Publication Details ────────────────────────────────────
  const [publisher, setPublisher]   = useState("");
  const [isbn, setIsbn]             = useState("");
  const [edition, setEdition]       = useState("");
  const [pubYear, setPubYear]       = useState("");
  const [pages, setPages]           = useState("");

  // ── Pricing ────────────────────────────────────────────────
  const [price, setPrice]           = useState("");
  const [rentPrice, setRentPrice]   = useState("");
  const [isFree, setIsFree]         = useState(false);
  const [trialDuration, setTrialDuration] = useState("10");

  // ── Files ──────────────────────────────────────────────────
  const [file, setFile]             = useState(null);
  const [cover, setCover]           = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);

  // ── Copyright Declaration & Allowed Names ──────────────────
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [allowedAuthors, setAllowedAuthors] = useState([]);

  // ── Status ─────────────────────────────────────────────────
  const [error, setError]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    const fetchBookDetails = async () => {
      try {
        const response = await axios.get(`http://localhost:5000/api/book/${bookId}`);
        const b = response.data;
        setTitle(b.title || "");
        setAuthor(b.author || "");
        setDescription(b.description || "");
        setGenre(b.genre || "");
        setLanguage(b.language || "English");
        setTags(Array.isArray(b.tags) ? b.tags.join(", ") : b.tags || "");
        setPublisher(b.publisher || "");
        setIsbn(b.isbn || "");
        setEdition(b.edition || "");
        setPubYear(b.pub_year || "");
        setPages(b.pages || "");
        setPrice(b.price || "");
        setRentPrice(b.rent_price || "");
        setIsFree(b.is_free === true || b.is_free === "true");
        setTrialDuration(b.trial_duration || "10");
        if (b.cover_url) {
          setCoverPreview(b.cover_url);
        }
      } catch (err) {
        console.error("Error fetching book details:", err);
        setError("Failed to load book data. Please check connection.");
      }
    };

    const fetchProfile = async () => {
      const token = localStorage.getItem("authorToken");
      if (!token) return;
      try {
        const response = await axios.get("http://localhost:5000/api/user-profile", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const profile = response.data;
        const names = [];
        if (profile.name) names.push(profile.name);
        if (profile.penName) names.push(profile.penName);
        setAllowedAuthors(names);
      } catch (err) {
        console.error("Error loading profile:", err);
      }
    };

    fetchBookDetails();
    fetchProfile();
  }, [bookId]);

  const handleCoverChange = (e) => {
    const f = e.target.files[0];
    setCover(f);
    if (f) setCoverPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!declarationAccepted) {
      setError("You must read and accept the Copyright Declaration to submit revisions.");
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("authorToken");
    if (!token) {
      setError("Unauthorized. Please log in as an author.");
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("title",          title);
    formData.append("description",    description);
    formData.append("author",         author);
    formData.append("price",          isFree ? "0" : price);
    formData.append("rent_price",     rentPrice || "0");
    formData.append("genre",          genre);
    formData.append("language",       language);
    formData.append("tags",           tags);
    formData.append("publisher",      publisher);
    formData.append("isbn",           isbn);
    formData.append("edition",        edition);
    formData.append("pub_year",       pubYear);
    formData.append("pages",          pages);
    formData.append("is_free",        isFree ? "true" : "false");
    formData.append("trial_duration", trialDuration || "10");
    formData.append("declaration_accepted", "true");
    
    if (file) formData.append("file", file);
    if (cover) formData.append("cover", cover);

    try {
      const response = await axios.post(`http://localhost:5000/api/books/edit/${bookId}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });
      alert(response.data.message || "Revision saved successfully!");
      navigate("/PublisherDashboard");
    } catch (err) {
      if (err.response?.status === 401) {
        setError("Session expired. Please log in again.");
        localStorage.removeItem("authorToken");
        navigate("/AuthorLogin");
      } else {
        setError(err.response?.data?.error || "Save failed. Check parameters.");
      }
    } finally {
      setLoading(false);
    }
  };

  const sections = ["Core Info", "Classification", "Publication", "Pricing & Files"];

  return (
    <div className="upload-container">
      <button className="back-ribbon-btn" onClick={() => navigate("/PublisherDashboard")}>
        ← Back to Dashboard
      </button>

      <div className="upload-book-wrapper">
        {/* ── Left: Cover Preview ───────────────────────── */}
        <div className="cover-preview-panel">
          <div className="cover-preview-frame">
            {coverPreview ? (
              <img src={coverPreview} alt="Book Cover Preview" className="cover-img-preview" />
            ) : (
              <div className="cover-placeholder">
                <span className="cover-placeholder-icon">📖</span>
                <p>Cover Preview</p>
              </div>
            )}
          </div>
          <p className="cover-hint">Upload new cover to replace current</p>

          <div className="upload-progress-steps">
            {sections.map((s, i) => (
              <div
                key={i}
                className={`progress-step ${i === activeSection ? "active" : ""} ${i < activeSection ? "done" : ""}`}
                onClick={() => setActiveSection(i)}
              >
                <div className="step-dot">{i < activeSection ? "✓" : i + 1}</div>
                <span className="step-label">{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: Form ───────────────────────────────── */}
        <div className="scroll-paper">
          <div className="scroll-title-wrap">
            <h2 className="scroll-title">Edit Book Revisions</h2>
            <p className="scroll-subtitle">Modify parameters and review version declarations</p>
          </div>

          {error && <div className="error-message">⚠ {error}</div>}

          <form onSubmit={handleSubmit}>

            {/* SECTION 1: Core Info */}
            <div className="form-section">
              <div className="section-header" onClick={() => setActiveSection(0)}>
                <span className="section-number">1</span>
                <h3>Core Information</h3>
                <span className="section-toggle">{activeSection === 0 ? "▲" : "▼"}</span>
              </div>

              {activeSection === 0 && (
                <div className="section-body">
                  <div className="field-group">
                    <label className="field-label required">Book Title</label>
                    <input
                      type="text"
                      className="field-input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label required">Author Name / Pen Name</label>
                    {allowedAuthors.length > 0 ? (
                      <select
                        className="field-input field-select"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        required
                      >
                        {allowedAuthors.map((name, idx) => (
                          <option key={idx} value={name}>{name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="field-input"
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        required
                      />
                    )}
                  </div>

                  <div className="field-group">
                    <label className="field-label required">Description</label>
                    <textarea
                      className="field-textarea"
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 2: Classification */}
            <div className="form-section">
              <div className="section-header" onClick={() => setActiveSection(1)}>
                <span className="section-number">2</span>
                <h3>Classification</h3>
                <span className="section-toggle">{activeSection === 1 ? "▲" : "▼"}</span>
              </div>

              {activeSection === 1 && (
                <div className="section-body">
                  <div className="field-group">
                    <label className="field-label required">Genre</label>
                    <select
                      className="field-select"
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      required
                    >
                      <option value="">Select a Genre</option>
                      {GENRES.map((g, idx) => (
                        <option key={idx} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label required">Language</label>
                    <select
                      className="field-select"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      required
                    >
                      {LANGUAGES.map((l, idx) => (
                        <option key={idx} value={l}>{l}</option>
                      ))}
                    </select>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Tags (comma separated)</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. classic, mystery, fiction"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 3: Publication */}
            <div className="form-section">
              <div className="section-header" onClick={() => setActiveSection(2)}>
                <span className="section-number">3</span>
                <h3>Publication Details</h3>
                <span className="section-toggle">{activeSection === 2 ? "▲" : "▼"}</span>
              </div>

              {activeSection === 2 && (
                <div className="section-body">
                  <div className="field-group">
                    <label className="field-label">Publisher</label>
                    <input
                      type="text"
                      className="field-input"
                      value={publisher}
                      onChange={(e) => setPublisher(e.target.value)}
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">ISBN</label>
                    <input
                      type="text"
                      className="field-input"
                      value={isbn}
                      onChange={(e) => setIsbn(e.target.value)}
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Edition</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. 1st Edition"
                      value={edition}
                      onChange={(e) => setEdition(e.target.value)}
                    />
                  </div>

                  <div className="form-row">
                    <div className="field-group half-width">
                      <label className="field-label">Publication Year</label>
                      <input
                        type="text"
                        className="field-input"
                        value={pubYear}
                        onChange={(e) => setPubYear(e.target.value)}
                      />
                    </div>

                    <div className="field-group half-width">
                      <label className="field-label">Page Count</label>
                      <input
                        type="number"
                        className="field-input"
                        value={pages}
                        onChange={(e) => setPages(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 4: Pricing & Files */}
            <div className="form-section">
              <div className="section-header" onClick={() => setActiveSection(3)}>
                <span className="section-number">4</span>
                <h3>Pricing, Revisions & Files</h3>
                <span className="section-toggle">{activeSection === 3 ? "▲" : "▼"}</span>
              </div>

              {activeSection === 3 && (
                <div className="section-body">
                  <div className="pricing-toggle-wrap" style={{ margin: "10px 0" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", color: "#5c381f", fontWeight: "bold", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={isFree}
                        onChange={(e) => setIsFree(e.target.checked)}
                      />
                      Release as Free Publication
                    </label>
                  </div>

                  {!isFree && (
                    <div className="form-row">
                      <div className="field-group half-width">
                        <label className="field-label required">Purchase Price (INR)</label>
                        <input
                          type="number"
                          className="field-input"
                          min="0"
                          step="0.01"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          required={!isFree}
                        />
                      </div>

                      <div className="field-group half-width">
                        <label className="field-label required">Daily Rent Price (INR)</label>
                        <input
                          type="number"
                          className="field-input"
                          min="0"
                          step="0.01"
                          value={rentPrice}
                          onChange={(e) => setRentPrice(e.target.value)}
                          required={!isFree}
                        />
                      </div>
                    </div>
                  )}

                  {!isFree && (
                    <div className="field-group">
                      <label className="field-label">Free Trial Length (Pages)</label>
                      <input
                        type="number"
                        className="field-input"
                        min="1"
                        value={trialDuration}
                        onChange={(e) => setTrialDuration(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="field-group">
                    <label className="field-label">Replacement Book File (Optional - PDF, EPUB, DOCX, TXT)</label>
                    <input
                      type="file"
                      className="field-input"
                      accept=".pdf,.epub,.docx,.txt"
                      onChange={(e) => setFile(e.target.files[0])}
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">Replacement Cover Image (Optional)</label>
                    <input
                      type="file"
                      className="field-input"
                      accept="image/*"
                      onChange={handleCoverChange}
                    />
                  </div>

                  {/* Copyright Declaration */}
                  <div className="declaration-container" style={{
                    margin: "20px 0",
                    background: "rgba(92, 56, 31, 0.05)",
                    border: "1.5px dashed #9a7040",
                    padding: "14px 18px",
                    borderRadius: "2px"
                  }}>
                    <p style={{ margin: "0 0 10px 0", fontSize: "0.85rem", color: "#5c381f", fontStyle: "italic", lineHeight: "1.5" }}>
                      "I confirm that I am the original author of this content or I have the legal rights to publish it. I understand that submitting copyrighted material without permission may result in removal of my content and suspension of my account."
                    </p>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#5c381f", fontWeight: "bold", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={declarationAccepted}
                        onChange={(e) => setDeclarationAccepted(e.target.checked)}
                      />
                      I accept the Copyright Declaration.
                    </label>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className={`submit-btn ${loading || !declarationAccepted ? "disabled" : ""}`}
              disabled={loading || !declarationAccepted}
              style={{
                width: "100%",
                padding: "14px",
                fontFamily: "Cinzel, serif",
                fontSize: "0.95rem",
                letterSpacing: "2px",
                textTransform: "uppercase",
                background: "linear-gradient(to bottom, #5c381f, #3e1b0c)",
                color: "#fbf8f0",
                border: "none",
                cursor: "pointer",
                marginTop: "20px",
                borderRadius: "2px",
                opacity: declarationAccepted ? 1 : 0.6
              }}
            >
              {loading ? "Saving Revisions..." : "Confirm & Save Revision"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EditBook;
