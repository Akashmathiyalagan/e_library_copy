import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./UploadBook.css";

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

const UploadBooks = () => {
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

  // ── Status ─────────────────────────────────────────────────
  const [error, setError]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [activeSection, setActiveSection] = useState(0);

  // ── Handlers ───────────────────────────────────────────────
  const handleCoverChange = (e) => {
    const f = e.target.files[0];
    setCover(f);
    if (f) setCoverPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const token = localStorage.getItem("authorToken");
    if (!token) {
      setError("You must be logged in to upload a book.");
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
    formData.append("file",           file);
    if (cover) formData.append("cover", cover);

    try {
      const response = await axios.post("http://localhost:5000/upload_book", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Bearer ${token}`,
        },
      });
      alert(response.data.message);
      navigate("/PublisherDashboard");
    } catch (err) {
      if (err.response?.status === 401) {
        setError("Unauthorized: Please log in again.");
        localStorage.removeItem("authorToken");
        navigate("/AuthorLogin");
      } else {
        setError(err.response?.data?.error || "Upload failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Multi-step sections ─────────────────────────────────────
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
          <p className="cover-hint">Upload a cover image to see preview</p>

          {/* Progress indicator */}
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
            <h2 className="scroll-title">Publish a New Book</h2>
            <p className="scroll-subtitle">Fill in all essential details about your book</p>
          </div>

          {error && <div className="error-message">⚠ {error}</div>}

          <form onSubmit={handleSubmit}>

            {/* ════ SECTION 1: Core Info ════ */}
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
                      placeholder="e.g. The Great Gatsby"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label required">Author Name</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. F. Scott Fitzgerald"
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      required
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label required">Description / Synopsis</label>
                    <textarea
                      className="field-input field-textarea"
                      placeholder="Write a compelling description of your book..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                    />
                  </div>

                  <button type="button" className="next-btn" onClick={() => setActiveSection(1)}>
                    Next: Classification →
                  </button>
                </div>
              )}
            </div>

            {/* ════ SECTION 2: Classification ════ */}
            <div className="form-section">
              <div className="section-header" onClick={() => setActiveSection(1)}>
                <span className="section-number">2</span>
                <h3>Classification</h3>
                <span className="section-toggle">{activeSection === 1 ? "▲" : "▼"}</span>
              </div>

              {activeSection === 1 && (
                <div className="section-body">
                  <div className="field-row">
                    <div className="field-group">
                      <label className="field-label required">Genre / Category</label>
                      <select
                        className="field-input field-select"
                        value={genre}
                        onChange={(e) => setGenre(e.target.value)}
                        required
                      >
                        <option value="">— Select Genre —</option>
                        {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>

                    <div className="field-group">
                      <label className="field-label required">Language</label>
                      <select
                        className="field-input field-select"
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        required
                      >
                        {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label">Tags / Keywords</label>
                    <input
                      type="text"
                      className="field-input"
                      placeholder="e.g. classic, love, 1920s (comma-separated)"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                    />
                    <span className="field-hint">Helps readers discover your book through search</span>
                  </div>

                  <div className="field-btn-row">
                    <button type="button" className="prev-btn" onClick={() => setActiveSection(0)}>← Previous</button>
                    <button type="button" className="next-btn" onClick={() => setActiveSection(2)}>Next: Publication →</button>
                  </div>
                </div>
              )}
            </div>

            {/* ════ SECTION 3: Publication Details ════ */}
            <div className="form-section">
              <div className="section-header" onClick={() => setActiveSection(2)}>
                <span className="section-number">3</span>
                <h3>Publication Details</h3>
                <span className="section-toggle">{activeSection === 2 ? "▲" : "▼"}</span>
              </div>

              {activeSection === 2 && (
                <div className="section-body">
                  <div className="field-row">
                    <div className="field-group">
                      <label className="field-label">Publisher</label>
                      <input
                        type="text"
                        className="field-input"
                        placeholder="e.g. Penguin Books"
                        value={publisher}
                        onChange={(e) => setPublisher(e.target.value)}
                      />
                    </div>

                    <div className="field-group">
                      <label className="field-label">Publication Year</label>
                      <input
                        type="number"
                        className="field-input"
                        placeholder="e.g. 2024"
                        min="1000"
                        max={new Date().getFullYear()}
                        value={pubYear}
                        onChange={(e) => setPubYear(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field-row">
                    <div className="field-group">
                      <label className="field-label">ISBN</label>
                      <input
                        type="text"
                        className="field-input"
                        placeholder="e.g. 978-3-16-148410-0"
                        value={isbn}
                        onChange={(e) => setIsbn(e.target.value)}
                      />
                    </div>

                    <div className="field-group">
                      <label className="field-label">Edition</label>
                      <input
                        type="text"
                        className="field-input"
                        placeholder="e.g. 1st, 2nd, Revised"
                        value={edition}
                        onChange={(e) => setEdition(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field-group" style={{ maxWidth: "48%" }}>
                    <label className="field-label">Number of Pages</label>
                    <input
                      type="number"
                      className="field-input"
                      placeholder="e.g. 320"
                      min="1"
                      value={pages}
                      onChange={(e) => setPages(e.target.value)}
                    />
                  </div>

                  <div className="field-btn-row">
                    <button type="button" className="prev-btn" onClick={() => setActiveSection(1)}>← Previous</button>
                    <button type="button" className="next-btn" onClick={() => setActiveSection(3)}>Next: Pricing & Files →</button>
                  </div>
                </div>
              )}
            </div>

            {/* ════ SECTION 4: Pricing & Files ════ */}
            <div className="form-section">
              <div className="section-header" onClick={() => setActiveSection(3)}>
                <span className="section-number">4</span>
                <h3>Pricing &amp; Files</h3>
                <span className="section-toggle">{activeSection === 3 ? "▲" : "▼"}</span>
              </div>

              {activeSection === 3 && (
                <div className="section-body">
                  {/* Free toggle */}
                  <div className="toggle-row">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        className="toggle-checkbox"
                        checked={isFree}
                        onChange={(e) => setIsFree(e.target.checked)}
                      />
                      <span className="toggle-switch"></span>
                      Make this book <strong>Free</strong>
                    </label>
                  </div>

                  {!isFree && (
                    <div className="field-row">
                      <div className="field-group">
                        <label className="field-label required">Purchase Price (₹)</label>
                        <input
                          type="number"
                          className="field-input"
                          placeholder="e.g. 299"
                          min="0"
                          step="0.01"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          required={!isFree}
                        />
                      </div>

                      <div className="field-group">
                        <label className="field-label">Rental Price / week (₹)</label>
                        <input
                          type="number"
                          className="field-input"
                          placeholder="e.g. 49 (optional)"
                          min="0"
                          step="0.01"
                          value={rentPrice}
                          onChange={(e) => setRentPrice(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {/* Free Trial Duration */}
                  <div className="field-group">
                    <label className="field-label required">Free Trial Duration (Minutes)</label>
                    <input
                      type="number"
                      className="field-input"
                      placeholder="e.g. 10"
                      min="1"
                      value={trialDuration}
                      onChange={(e) => setTrialDuration(e.target.value)}
                      required
                    />
                    <span className="field-hint">Specify the duration readers can read this book for free before purchase/rental is required.</span>
                  </div>

                  {/* Book File */}
                  <div className="field-group">
                    <label className="field-label required">Book File (PDF / EPUB)</label>
                    <div className="file-drop-zone" onClick={() => document.getElementById("bookFile").click()}>
                      <span className="file-drop-icon">📄</span>
                      <span className="file-drop-text">
                        {file ? file.name : "Click or drag to upload your book file"}
                      </span>
                      <span className="file-drop-hint">PDF, EPUB — max 50 MB</span>
                      <input
                        id="bookFile"
                        type="file"
                        accept=".pdf,.epub"
                        style={{ display: "none" }}
                        onChange={(e) => setFile(e.target.files[0])}
                        required
                      />
                    </div>
                  </div>

                  {/* Cover Image */}
                  <div className="field-group">
                    <label className="field-label">Cover Image</label>
                    <div className="file-drop-zone" onClick={() => document.getElementById("coverImg").click()}>
                      <span className="file-drop-icon">🖼️</span>
                      <span className="file-drop-text">
                        {cover ? cover.name : "Click or drag to upload cover image"}
                      </span>
                      <span className="file-drop-hint">JPG, PNG, WebP — recommended 600 × 900 px</span>
                      <input
                        id="coverImg"
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={handleCoverChange}
                      />
                    </div>
                  </div>

                  <div className="field-btn-row">
                    <button type="button" className="prev-btn" onClick={() => setActiveSection(2)}>← Previous</button>
                    <button type="submit" className="submit-btn" disabled={loading}>
                      {loading ? (
                        <><span className="spinner"></span> Uploading…</>
                      ) : (
                        "📚 Publish Book"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

          </form>
        </div>
      </div>
    </div>
  );
};

export default UploadBooks;
