import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import logo from "./assets/logo.png";
import "./ModeratorDashboard.css";

const ModeratorDashboard = () => {
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [strikeDetails, setStrikeDetails] = useState(null);
  const [strikeEmail, setStrikeEmail] = useState("");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState(null);
  const [showResolved, setShowResolved] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("moderatorToken");
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  const handleAxiosError = (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("moderatorToken");
      navigate("/moderator-auth");
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("moderatorToken");
    if (!token) {
      navigate("/moderator-auth");
      return;
    }
    fetchQueue(showResolved);
  }, [showResolved]);

  const fetchQueue = async (resolvedVal = showResolved) => {
    const token = localStorage.getItem("moderatorToken");
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`http://localhost:5000/api/moderator/queue?show_resolved=${resolvedVal}`, getAuthHeaders());
      setQueue(res.data);
    } catch (err) {
      console.error("Queue fetch error:", err);
      setError("Failed to fetch moderation queue.");
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectItem = async (item) => {
    setSelectedItem(item);
    setCompareData(null);
    setStrikeDetails(null);
    setLoadingCompare(true);
    setComments("");

    try {
      const compareRes = await axios.get(`http://localhost:5000/api/moderator/compare/${item.book_id}`, getAuthHeaders());
      setCompareData(compareRes.data);
      
      if (item.uploader) {
        setStrikeEmail(item.uploader);
        fetchStrikes(item.uploader);
      }
    } catch (err) {
      console.error("Comparison fetch error:", err);
      handleAxiosError(err);
    } finally {
      setLoadingCompare(false);
    }
  };

  const fetchStrikes = async (email) => {
    try {
      const res = await axios.get(`http://localhost:5000/api/moderator/strikes/${email}`, getAuthHeaders());
      setStrikeDetails(res.data);
    } catch (err) {
      console.error("Strikes fetch error:", err);
      handleAxiosError(err);
    }
  };

  const handleAction = async (action) => {
    if (!selectedItem) return;
    setLoading(true);
    try {
      await axios.post("http://localhost:5000/api/moderator/action", {
        bookId: selectedItem.book_id,
        action,
        reason: comments
      }, getAuthHeaders());
      alert(`Moderator action '${action}' recorded.`);
      setSelectedItem(null);
      setCompareData(null);
      setStrikeDetails(null);
      fetchQueue();
    } catch (err) {
      console.error("Error processing moderator action:", err);
      alert("Failed to process moderator action.");
      handleAxiosError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStrikeOverride = async (action) => {
    if (!strikeEmail) return;
    try {
      const res = await axios.post("http://localhost:5000/api/moderator/strikes/override", {
        email: strikeEmail,
        action
      }, getAuthHeaders());
      alert(res.data.message);
      fetchStrikes(strikeEmail);
    } catch (err) {
      console.error("Error overriding strikes:", err);
      alert("Failed to override strikes.");
      handleAxiosError(err);
    }
  };

  return (
    <div className="moderator-dashboard-wrapper">
      <nav className="mod-nav">
        <div className="logo-container" onClick={() => navigate("/")}>
          <img src={logo} alt="Logo" className="logo-img" />
          <span className="logo-text">E-LIBRARY</span>
          <span className="badge-mod">MODERATION PANEL</span>
        </div>
        <div className="nav-buttons">
          <button className="mod-btn" onClick={() => navigate("/AuthorLogin")}>Author Hub</button>
          <button className="mod-btn" onClick={() => navigate("/login-register")}>Reader Catalog</button>
          <button className="mod-btn logout-btn" onClick={() => {
            localStorage.removeItem("moderatorToken");
            localStorage.removeItem("moderatorName");
            navigate("/moderator-auth");
          }} style={{ backgroundColor: "#c0392b" }}>Logout</button>
        </div>
      </nav>

      <div className="mod-grid">
        {/* LEFT COLUMN: Moderator Queue */}
        <div className="mod-sidebar-panel">
          <h3 className="panel-title">Active Moderation Queue ({queue.length})</h3>
          <div className="toggle-resolved-container" style={{ marginBottom: "15px", display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              id="show-resolved"
              checked={showResolved}
              onChange={(e) => {
                setShowResolved(e.target.checked);
                setSelectedItem(null);
                setCompareData(null);
              }}
              style={{ cursor: "pointer" }}
            />
            <label htmlFor="show-resolved" style={{ color: "#5c381f", fontSize: "0.85rem", cursor: "pointer", fontWeight: "600" }}>
              Show Resolved / AI Archive
            </label>
          </div>
          {error && <div className="mod-error">{error}</div>}
          
          {loading ? (
            <div className="mod-loading">Loading queue...</div>
          ) : queue.length === 0 ? (
            <div className="mod-empty">No pending issues in queue. System safe!</div>
          ) : (
            <div className="queue-list">
              {queue.map((item) => (
                <div
                  key={item._id}
                  className={`queue-card ${selectedItem?.book_id === item.book_id ? "selected" : ""} type-${item.queue_type}`}
                  onClick={() => handleSelectItem(item)}
                >
                  <div className="card-header-mod">
                    <span className="card-tag">{item.queue_type === "plagiarism" ? "⚠ Plagiarism" : "🖯 Report"}</span>
                    <span className={`card-score ${item.risk_level || 'MEDIUM'}-badge`} style={{
                      backgroundColor: item.risk_level === "HIGH" ? "rgba(192, 57, 43, 0.1)" :
                                       item.risk_level === "MEDIUM" ? "rgba(243, 156, 18, 0.1)" : "rgba(39, 174, 96, 0.1)",
                      color: item.risk_level === "HIGH" ? "#c0392b" :
                             item.risk_level === "MEDIUM" ? "#d35400" : "#27ae60",
                      padding: "2px 6px",
                      borderRadius: "2px",
                      fontWeight: "bold"
                    }}>{item.risk_level || "MEDIUM"} RISK ({item.similarity_score}%)</span>
                  </div>
                  <h4 className="card-title-mod">{item.title}</h4>
                  <p className="card-meta-mod">By: {item.author} | Uploader: {item.uploader}</p>
                  <p className="card-reason-mod">{item.reason?.substring(0, 75)}...</p>
                </div>
              ))}
            </div>
          )}

          {/* Quick Strike Search / Override Utility */}
          <div className="strike-utility-box">
            <h4 className="box-title">Lookup & Override Strikes</h4>
            <div className="search-row-mod">
              <input
                type="text"
                placeholder="Author email..."
                value={strikeEmail}
                onChange={(e) => setStrikeEmail(e.target.value)}
              />
              <button onClick={() => fetchStrikes(strikeEmail)}>Search</button>
            </div>
            {strikeDetails && (
              <div className="strike-mini-profile">
                <p>Status: <strong className={strikeDetails.status}>{strikeDetails.status || "Active"}</strong></p>
                <p>Active Strikes: <strong className="strike-count">{strikeDetails.strikes || 0}</strong></p>
                <div className="strike-actions-row">
                  <button onClick={() => handleStrikeOverride("reset")}>Reset Strikes</button>
                  <button className="suspend-btn" onClick={() => handleStrikeOverride("suspend")}>Suspend</button>
                  <button className="restore-btn" onClick={() => handleStrikeOverride("unsuspend")}>Restore</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Comparison & Controls */}
        <div className="mod-main-panel">
          {selectedItem ? (
            compareData ? (
              <div className="compare-details">
                <div className="compare-header">
                  <h2>Reviewing: {compareData.book?.title}</h2>
                  <p>Uploaded by: <strong>{compareData.book?.uploaded_by}</strong></p>
                </div>

                {/* Similarity Summary Box */}
                <div className="similarity-summary-panel">
                  <div className="metric-box">
                    <span className="metric-value">{compareData.plagiarism_report?.similarity_score}%</span>
                    <span className="metric-label">Similarity Index</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-value" style={{
                      color: compareData.plagiarism_report?.risk_level === "HIGH" ? "#c0392b" :
                             compareData.plagiarism_report?.risk_level === "MEDIUM" ? "#d35400" : "#27ae60"
                    }}>{compareData.plagiarism_report?.risk_level || "LOW"}</span>
                    <span className="metric-label">Risk Level</span>
                  </div>
                  <div className="metric-box">
                    <span className="metric-value">{compareData.plagiarism_report?.exact_matches_count}</span>
                    <span className="metric-label">Exact Paragraph Matches</span>
                  </div>
                  <div className="explanation-text">
                    <strong>System Evaluation: </strong> 
                    {compareData.plagiarism_report?.ai_explanation}
                  </div>
                </div>

                {/* AI Moderator Bot Audit Log */}
                {compareData.moderation_info && (
                  <div className="ai-audit-log-panel" style={{
                    padding: "16px",
                    backgroundColor: "#f0f7f4",
                    border: "1px solid #27ae60",
                    borderRadius: "3px",
                    marginBottom: "20px"
                  }}>
                    <h4 className="sub-title-mod" style={{ color: "#27ae60", margin: "0 0 8px 0", display: "flex", alignItems: "center", gap: "6px", fontFamily: "Cinzel, serif", fontSize: "0.95rem" }}>
                      🛡 AI Autonomous Moderator Action Log
                    </h4>
                    <p style={{ fontSize: "0.88rem", color: "#2c3e50", margin: "0 0 6px 0" }}>
                      <strong>Processed By:</strong> {compareData.moderation_info.resolved_by || "AI Moderator Bot"}
                    </p>
                    <p style={{ fontSize: "0.88rem", color: "#2c3e50", margin: "0 0 6px 0" }}>
                      <strong>Resolution Date:</strong> {new Date(compareData.moderation_info.resolved_at).toLocaleString()}
                    </p>
                    <p style={{ fontSize: "0.88rem", color: "#2c3e50", margin: "0 0 6px 0" }}>
                      <strong>Action Executed:</strong> <span style={{
                        textTransform: "uppercase",
                        fontWeight: "bold",
                        color: compareData.moderation_info.action_taken === "approve" ? "#27ae60" : "#c0392b"
                      }}>{compareData.moderation_info.action_taken}</span>
                    </p>
                    <p style={{ fontSize: "0.88rem", color: "#2c3e50", margin: "0" }}>
                      <strong>AI Rationale:</strong> {compareData.moderation_info.resolution_reason}
                    </p>
                    {compareData.moderation_info.status === "resolved" && (
                      <div style={{ marginTop: "12px", borderTop: "1px dashed #27ae60", paddingTop: "8px" }}>
                        <span style={{ fontSize: "0.8rem", color: "#7f8c8d", fontStyle: "italic" }}>
                          Note: This item was auto-resolved. You can use the controls below to override the AI's action.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Similarity Heatmap Data (5x5 Chunks Matrix) */}
                {compareData.plagiarism_report?.heatmap_data?.length > 0 && (
                  <div className="heatmap-section" style={{
                    padding: "16px",
                    backgroundColor: "#fbf8f0",
                    border: "1px dashed #9a7040",
                    borderRadius: "3px"
                  }}>
                    <h4 className="sub-title-mod" style={{ margin: "0 0 10px 0", color: "#5c381f" }}>AI Semantic Chunk Overlap (5x5 Grid Analysis)</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "5px", maxWidth: "240px" }}>
                      {compareData.plagiarism_report.heatmap_data.flat().map((val, idx) => {
                        const intensity = val / 100.0;
                        const red = Math.round(255);
                        const green = Math.round(245 - (245 - 50) * intensity);
                        const blue = Math.round(230 - (230 - 40) * intensity);
                        return (
                          <div
                            key={idx}
                            title={`Segment similarity: ${val}%`}
                            style={{
                              aspectRatio: "1",
                              backgroundColor: `rgb(${red}, ${green}, ${blue})`,
                              border: "1px solid rgba(92,56,31,0.2)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "10px",
                              fontWeight: "bold",
                              color: val > 60 ? "#fff" : "#5c381f"
                            }}
                          >
                            {Math.round(val)}%
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Versions Compare Row */}
                {compareData.versions?.length > 0 && (
                  <div className="version-history-compare">
                    <h4 className="sub-title-mod">Archive Version History ({compareData.versions.length})</h4>
                    <div className="version-list-inline">
                      {compareData.versions.map((ver, idx) => (
                        <div key={idx} className="version-bubble">
                          V{ver.version_number} - {ver.updated_at.split("T")[0]}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Side by Side Text Samples */}
                <div className="comparison-views">
                  <div className="view-pane current-book">
                    <div className="pane-header-mod">
                      <h4>Current Submission Text Sample</h4>
                      <span className="badge-pane font-classic">Source Upload</span>
                    </div>
                    <div className="pane-content-mod">
                      {compareData.book?.text_sample ? compareData.book.text_sample : "Binary or empty document text."}
                    </div>
                  </div>

                  <div className="view-pane matched-book">
                    <div className="pane-header-mod">
                      <h4>Existing Matching Catalog Text Sample</h4>
                      <span className="badge-pane font-matched">Matched Archive ({compareData.matched_book?.title || "N/A"})</span>
                    </div>
                    <div className="pane-content-mod">
                      {compareData.matched_book?.text_sample ? compareData.matched_book.text_sample : "No matching catalog document found or compared."}
                    </div>
                  </div>
                </div>

                {/* Matching Paragraphs Level Detail */}
                {compareData.plagiarism_report?.matching_sections?.length > 0 && (
                  <div className="matching-sections-panel">
                    <h4 className="sub-title-mod">Matching Paragraph Alignments</h4>
                    <div className="sections-list">
                      {compareData.plagiarism_report.matching_sections.map((section, idx) => (
                        <div key={idx} className="match-section-card">
                          <div className="match-card-meta">
                            <span className="match-tag-pill">Match {idx + 1}</span>
                            <span className="match-score-pill">{section.similarity}% Cosine Overlap</span>
                          </div>
                          <div className="match-comparison-texts">
                            <div className="source-sec">
                              <h5>Submitted Text:</h5>
                              <p>"{section.source_section}"</p>
                            </div>
                            <div className="matched-sec">
                              <h5>Archive Match:</h5>
                              <p>"{section.match_section}"</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolution Controls */}
                <div className="moderator-resolution-controls">
                  <h3>Record Resolution Decision</h3>
                  <textarea
                    rows={3}
                    placeholder="Enter reason for decision (notified to author & logged in strikes)..."
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                  />
                  <div className="resolution-buttons">
                    <button className="approve-res-btn" onClick={() => handleAction("approve")}>Approve & Publish</button>
                    <button className="warn-res-btn" onClick={() => handleAction("warning")}>Issue Warning Only</button>
                    <button className="reject-res-btn" onClick={() => handleAction("reject")}>Reject & Strike Account</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mod-loading-compare">
                {loadingCompare ? "Extracting documents and compiling metrics..." : "Select an issue from the queue to start comparison."}
              </div>
            )
          ) : (
            <div className="mod-intro">
              <span className="intro-icon">🛡</span>
              <h2>E-Library Integrity System</h2>
              <p>Select a pending copyright or plagiarism flag from the queue sidebar. You can review similarity scores, analyze paragraphs side-by-side, inspect revision histories, and apply strike warnings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModeratorDashboard;
