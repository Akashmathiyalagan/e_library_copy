import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import logo from "./assets/logo.png";
import "./AuthorProfile.css";
import {
  FaUser, FaCamera, FaBook, FaPen, FaGlobe, FaStar,
  FaEdit, FaTrash, FaDownload, FaTag,
  FaCalendarAlt, FaLanguage, FaSave, FaTimes
} from "react-icons/fa";

const GENRES = [
  "Fiction", "Non-Fiction", "Mystery & Thriller", "Science Fiction",
  "Fantasy", "Romance", "Biography & Memoir", "History",
  "Self-Help & Personal Development", "Science & Technology",
  "Philosophy", "Children & Young Adult", "Poetry", "Horror",
  "Travel", "Religion & Spirituality", "Business & Economics",
];

const AuthorProfile = () => {
  const navigate = useNavigate();

  const [author, setAuthor] = useState({
    name: "",
    email: "",
    profilePicture: "",
    bio: "",
    penName: "",
    genre: "",
    website: "",
    twitter: "",
    preferredLanguage: "",
  });

  const [books, setBooks]         = useState([]);
  const [editing, setEditing]     = useState(false);
  const [editData, setEditData]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [activeTab, setActiveTab] = useState("overview"); // overview | books | settings

  // ── Fetch author profile & books ───────────────────────────
  useEffect(() => {
    const token = localStorage.getItem("authorToken");
    if (!token) { navigate("/AuthorLogin"); return; }

    // Profile
    axios.get("http://localhost:5000/api/user-profile", {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => {
      setAuthor({
        name:              res.data.name || "",
        email:             res.data.email || "",
        profilePicture:    res.data.profilePicture || "",
        bio:               res.data.bio || "",
        penName:           res.data.penName || "",
        genre:             res.data.genre || "",
        website:           res.data.website || "",
        twitter:           res.data.twitter || "",
        preferredLanguage: res.data.preferredLanguage || "",
      });
      setEditData({
        name:              res.data.name || "",
        bio:               res.data.bio || "",
        penName:           res.data.penName || "",
        genre:             res.data.genre || "",
        website:           res.data.website || "",
        twitter:           res.data.twitter || "",
        preferredLanguage: res.data.preferredLanguage || "",
      });
    })
    .catch(err => console.error("Error fetching author profile:", err))
    .finally(() => setLoading(false));

    // Books
    axios.get("http://localhost:5000/api/authors/my_books", {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => setBooks(res.data || []))
    .catch(err => console.error("Error fetching books:", err));
  }, [navigate]);

  // ── Save profile ────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    const token = localStorage.getItem("authorToken");
    try {
      await axios.post("http://localhost:5000/api/update-author-profile", editData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAuthor(prev => ({ ...prev, ...editData }));
      setEditing(false);
    } catch (err) {
      // Fallback to existing update endpoint
      try {
        await axios.post("http://localhost:5000/api/update-user-profile",
          { name: editData.name, preferredLanguage: editData.preferredLanguage, ...editData },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setAuthor(prev => ({ ...prev, ...editData }));
        setEditing(false);
      } catch (e) {
        console.error("Save error:", e);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Profile picture upload ───────────────────────────────────
  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("profilePicture", file);
    const token = localStorage.getItem("authorToken");
    axios.post("http://localhost:5000/api/upload-profile-picture", formData, {
      headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` }
    })
    .then(res => setAuthor(prev => ({ ...prev, profilePicture: res.data.profilePicture })))
    .catch(err => console.error("Photo upload error:", err));
  };

  // ── Delete book ──────────────────────────────────────────────
  const handleDeleteBook = async (bookId) => {
    if (!window.confirm("Delete this book permanently?")) return;
    const token = localStorage.getItem("authorToken");
    try {
      await axios.delete(`http://localhost:5000/api/books/${bookId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBooks(prev => prev.filter(b => b._id !== bookId));
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // ── Stats ────────────────────────────────────────────────────
  const totalBooks  = books.length;
  const freeBooks   = books.filter(b => b.is_free || b.price === "0").length;
  const paidBooks   = totalBooks - freeBooks;
  const totalPages  = books.reduce((s, b) => s + (parseInt(b.pages) || 0), 0);

  if (loading) {
    return (
      <div className="ap-loading">
        <div className="ap-spinner"></div>
        <p>Loading Author Profile…</p>
      </div>
    );
  }

  return (
    <div className="ap-wrapper">

      {/* ── Navbar ──────────────────────────────────────── */}
      <nav className="ap-nav">
        <div className="ap-nav-logo" onClick={() => navigate("/PublisherDashboard")}>
          <img src={logo} alt="Logo" />
          <span>E-LIBRARY</span>
        </div>
        <div className="ap-nav-center">
          <button
            className={`ap-nav-tab ${activeTab === "overview" ? "active" : ""}`}
            onClick={() => setActiveTab("overview")}
          >Overview</button>
          <button
            className={`ap-nav-tab ${activeTab === "books" ? "active" : ""}`}
            onClick={() => setActiveTab("books")}
          >My Books</button>
          <button
            className={`ap-nav-tab ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >Settings</button>
        </div>
        <div className="ap-nav-right">
          <button className="ap-nav-btn danger" onClick={() => {
            localStorage.removeItem("authorToken");
            localStorage.removeItem("authorEmail");
            navigate("/");
          }}>Logout</button>
        </div>
      </nav>

      {/* ── Hero Banner ─────────────────────────────────── */}
      <div className="ap-hero">
        <div className="ap-hero-bg"></div>

        {/* Avatar */}
        <div className="ap-avatar-wrap">
          {author.profilePicture ? (
            <img src={author.profilePicture} alt="Author" className="ap-avatar" />
          ) : (
            <div className="ap-avatar-placeholder"><FaUser size={42} /></div>
          )}
          <label className="ap-avatar-edit" title="Change photo">
            <FaCamera />
            <input type="file" accept="image/*" onChange={handlePhotoUpload} hidden />
          </label>
        </div>

        {/* Hero info */}
        <div className="ap-hero-info">
          <div className="ap-hero-name">
            {author.penName ? (
              <><span>{author.penName}</span><small className="ap-real-name">({author.name})</small></>
            ) : (
              <span>{author.name || "Author Name"}</span>
            )}
          </div>
          <div className="ap-hero-email">{author.email}</div>
          {author.genre && (
            <div className="ap-hero-genre"><FaTag /> {author.genre}</div>
          )}
        </div>

        {/* Quick stats */}
        <div className="ap-hero-stats">
          <div className="ap-stat"><span>{totalBooks}</span><label>Books</label></div>
          <div className="ap-stat"><span>{paidBooks}</span><label>Paid</label></div>
          <div className="ap-stat"><span>{freeBooks}</span><label>Free</label></div>
          <div className="ap-stat"><span>{totalPages.toLocaleString()}</span><label>Pages</label></div>
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────────── */}
      <div className="ap-content">

        {/* ════ OVERVIEW TAB ════ */}
        {activeTab === "overview" && (
          <div className="ap-tab-body">
            {/* Bio card */}
            <div className="ap-card ap-card-bio">
              <div className="ap-card-header">
                <h3><FaPen /> About the Author</h3>
                <button className="ap-edit-btn" onClick={() => { setEditing(true); setActiveTab("settings"); }}>
                  <FaEdit /> Edit Profile
                </button>
              </div>
              <p className="ap-bio-text">
                {author.bio || "No bio yet. Go to Settings to add your author bio."}
              </p>

              <div className="ap-meta-grid">
                {author.preferredLanguage && (
                  <div className="ap-meta-item">
                    <FaLanguage />
                    <span><strong>Language:</strong> {author.preferredLanguage}</span>
                  </div>
                )}
                {author.website && (
                  <div className="ap-meta-item">
                    <FaGlobe />
                    <a href={author.website} target="_blank" rel="noopener noreferrer">{author.website}</a>
                  </div>
                )}
                {author.twitter && (
                  <div className="ap-meta-item">
                    <FaStar />
                    <span>@{author.twitter}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Recent books preview */}
            <div className="ap-card">
              <div className="ap-card-header">
                <h3><FaBook /> Recent Publications</h3>
                <button className="ap-edit-btn" onClick={() => setActiveTab("books")}>
                  View All →
                </button>
              </div>
              {books.length === 0 ? (
                <div className="ap-empty">
                  <FaBook size={32} />
                  <p>No books uploaded yet.</p>
                  <button className="ap-upload-btn" onClick={() => navigate("/UploadBook")}>
                    + Upload Your First Book
                  </button>
                </div>
              ) : (
                <div className="ap-books-grid">
                  {books.slice(0, 3).map(book => (
                    <div key={book._id} className="ap-book-card-mini">
                      {book.cover_url ? (
                        <img src={book.cover_url} alt={book.title} className="ap-book-cover" />
                      ) : (
                        <div className="ap-book-cover-placeholder"><FaBook /></div>
                      )}
                      <div className="ap-book-mini-info">
                        <div className="ap-book-mini-title">{book.title}</div>
                        <div className="ap-book-mini-meta">
                          {book.genre && <span className="ap-badge">{book.genre}</span>}
                          <span className="ap-badge price">
                            {book.is_free || book.price === "0" ? "Free" : `₹${book.price}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ MY BOOKS TAB ════ */}
        {activeTab === "books" && (
          <div className="ap-tab-body">
            <div className="ap-card ap-card-full">
              <div className="ap-card-header">
                <h3><FaBook /> All My Books <span className="ap-count">({totalBooks})</span></h3>
                <button className="ap-upload-btn" onClick={() => navigate("/UploadBook")}>
                  + Upload New Book
                </button>
              </div>

              {books.length === 0 ? (
                <div className="ap-empty">
                  <FaBook size={40} />
                  <p>You haven't published any books yet.</p>
                  <button className="ap-upload-btn large" onClick={() => navigate("/UploadBook")}>
                    Publish Your First Book
                  </button>
                </div>
              ) : (
                <div className="ap-books-table-wrap">
                  <table className="ap-books-table">
                    <thead>
                      <tr>
                        <th>Cover</th>
                        <th>Title</th>
                        <th>Genre</th>
                        <th>Language</th>
                        <th>Pages</th>
                        <th>Price</th>
                        <th>Published</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {books.map(book => (
                        <tr key={book._id}>
                          <td>
                            {book.cover_url ? (
                              <img src={book.cover_url} alt={book.title} className="ap-table-cover" />
                            ) : (
                              <div className="ap-table-cover-ph"><FaBook /></div>
                            )}
                          </td>
                          <td>
                            <div className="ap-table-title">{book.title}</div>
                            <div className="ap-table-author">{book.author}</div>
                          </td>
                          <td>{book.genre || "—"}</td>
                          <td>{book.language || "—"}</td>
                          <td>{book.pages || "—"}</td>
                          <td>
                            <span className={`ap-price-badge ${book.is_free || book.price === "0" ? "free" : "paid"}`}>
                              {book.is_free || book.price === "0" ? "Free" : `₹${book.price}`}
                            </span>
                          </td>
                          <td className="ap-date">
                            {book.uploaded_at
                              ? new Date(book.uploaded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                              : "—"}
                          </td>
                          <td>
                            <div className="ap-action-btns">
                              <a href={book.file_url} target="_blank" rel="noopener noreferrer" className="ap-action download" title="Download">
                                <FaDownload />
                              </a>
                              <button className="ap-action edit" title="Edit" onClick={() => navigate(`/edit-book/${book._id}`)}>
                                <FaEdit />
                              </button>
                              <button className="ap-action delete" title="Delete" onClick={() => handleDeleteBook(book._id)}>
                                <FaTrash />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════ SETTINGS TAB ════ */}
        {activeTab === "settings" && (
          <div className="ap-tab-body ap-settings">
            <div className="ap-card">
              <div className="ap-card-header">
                <h3><FaUser /> Profile Information</h3>
                {!editing ? (
                  <button className="ap-edit-btn" onClick={() => setEditing(true)}>
                    <FaEdit /> Edit
                  </button>
                ) : (
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button className="ap-save-btn" onClick={handleSave} disabled={saving}>
                      {saving ? "Saving…" : <><FaSave /> Save Changes</>}
                    </button>
                    <button className="ap-cancel-btn" onClick={() => { setEditing(false); setEditData({ ...author }); }}>
                      <FaTimes /> Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="ap-settings-grid">
                <div className="ap-field">
                  <label>Full Name</label>
                  {editing ? (
                    <input className="ap-input" value={editData.name}
                      onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} />
                  ) : (
                    <div className="ap-value">{author.name || "—"}</div>
                  )}
                </div>

                <div className="ap-field">
                  <label>Pen Name</label>
                  {editing ? (
                    <input className="ap-input" placeholder="e.g. Mark Twain"
                      value={editData.penName}
                      onChange={e => setEditData(p => ({ ...p, penName: e.target.value }))} />
                  ) : (
                    <div className="ap-value">{author.penName || "—"}</div>
                  )}
                </div>

                <div className="ap-field ap-field-full">
                  <label>Bio</label>
                  {editing ? (
                    <textarea className="ap-input ap-textarea"
                      placeholder="Tell readers about yourself, your writing style, inspirations…"
                      value={editData.bio}
                      onChange={e => setEditData(p => ({ ...p, bio: e.target.value }))} />
                  ) : (
                    <div className="ap-value">{author.bio || "No bio added yet."}</div>
                  )}
                </div>

                <div className="ap-field">
                  <label>Primary Genre</label>
                  {editing ? (
                    <select className="ap-input" value={editData.genre}
                      onChange={e => setEditData(p => ({ ...p, genre: e.target.value }))}>
                      <option value="">— Select Genre —</option>
                      {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  ) : (
                    <div className="ap-value">{author.genre || "—"}</div>
                  )}
                </div>

                <div className="ap-field">
                  <label>Preferred Language</label>
                  {editing ? (
                    <select className="ap-input" value={editData.preferredLanguage}
                      onChange={e => setEditData(p => ({ ...p, preferredLanguage: e.target.value }))}>
                      <option value="">— Select Language —</option>
                      {["English","Tamil","Hindi","French","Spanish","German","Portuguese","Japanese","Chinese","Arabic"].map(l =>
                        <option key={l} value={l}>{l}</option>)}
                    </select>
                  ) : (
                    <div className="ap-value">{author.preferredLanguage || "—"}</div>
                  )}
                </div>

                <div className="ap-field">
                  <label><FaGlobe /> Website</label>
                  {editing ? (
                    <input className="ap-input" type="url" placeholder="https://yoursite.com"
                      value={editData.website}
                      onChange={e => setEditData(p => ({ ...p, website: e.target.value }))} />
                  ) : (
                    <div className="ap-value">
                      {author.website
                        ? <a href={author.website} target="_blank" rel="noopener noreferrer">{author.website}</a>
                        : "—"}
                    </div>
                  )}
                </div>

                <div className="ap-field">
                  <label>Twitter / X Handle</label>
                  {editing ? (
                    <input className="ap-input" placeholder="username (without @)"
                      value={editData.twitter}
                      onChange={e => setEditData(p => ({ ...p, twitter: e.target.value }))} />
                  ) : (
                    <div className="ap-value">{author.twitter ? `@${author.twitter}` : "—"}</div>
                  )}
                </div>

                <div className="ap-field ap-field-readonly">
                  <label>Email Address</label>
                  <div className="ap-value muted">{author.email}</div>
                </div>
              </div>
            </div>

            {/* Danger zone */}
            <div className="ap-card ap-danger-card">
              <h3 className="ap-danger-title">Danger Zone</h3>
              <p>Logging out will clear your session. All your books remain saved.</p>
              <button className="ap-danger-btn" onClick={() => {
                localStorage.removeItem("authorToken");
                localStorage.removeItem("authorEmail");
                navigate("/");
              }}>
                Logout from Author Account
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AuthorProfile;
