import React, { useState } from "react";
import axios from "axios";
import "./PreviewModal.css"; 

const PreviewModal = ({ data, onClose, onConfirm, onStartTrial }) => {
    const [showReportForm, setShowReportForm] = useState(false);
    const [reportReason, setReportReason] = useState("Copyright infringement");
    const [reportComments, setReportComments] = useState("");
    const [reporting, setReporting] = useState(false);

    if (!data) return null;

    const { title, author, authorDetails, description, price, summary, book, owned } = data;

    const cover = book?.cover_url || "https://via.placeholder.com/150";
    const isPaid = book?.price && parseFloat(book.price) > 0;

    const handleReportSubmit = async () => {
        setReporting(true);
        try {
            await axios.post("http://localhost:5000/api/books/report", {
                bookId: book._id,
                reason: reportReason,
                comments: reportComments
            });
            alert("Thank you. Your report has been submitted to the moderation team.");
            setShowReportForm(false);
            setReportComments("");
        } catch (err) {
            console.error("Error submitting report:", err);
            alert("Failed to submit report. Please try again.");
        } finally {
            setReporting(false);
        }
    };

    return (
        <div className="preview-modal-overlay">
        <div className="preview-modal-content">
            <span className="preview-close" onClick={onClose}>&times;</span>
            <h2>{data.title}</h2>
            <p><strong>Author:</strong> {data.author}</p>
            <p><strong>About the Author:</strong> {data.authorDetails}</p>
            <p><strong>Description:</strong> {data.description}</p>
            <p><strong>AI Summary:</strong> {data.summary}</p>
            <p><strong>Price:</strong> {data.price}</p>
            
            <div className="preview-buttons">
                <button onClick={onClose} className="btn-cancel">Cancel</button>
                {isPaid && !owned && onStartTrial && (
                    <button onClick={() => onStartTrial(data.book)} className="btn-trial">10-Min Free Trial</button>
                )}
                <button onClick={() => onConfirm(data.book)} className="btn-pay">
                    {owned ? "Read Now" : (isPaid ? "Confirm to Pay" : "Read Now")}
                </button>
            </div>

            {showReportForm ? (
                <div className="report-form-panel" style={{
                    marginTop: "15px",
                    padding: "12px",
                    border: "1px dashed #c0392b",
                    background: "rgba(192, 57, 43, 0.04)",
                    textAlign: "left",
                    borderRadius: "2px"
                }}>
                    <h4 style={{ margin: "0 0 8px 0", color: "#c0392b", fontSize: "0.9rem" }}>Report this Publication</h4>
                    <label style={{ display: "block", fontSize: "0.75rem", margin: "4px 0" }}>Reason for Flagging:</label>
                    <select 
                        value={reportReason} 
                        onChange={(e) => setReportReason(e.target.value)}
                        style={{ width: "100%", padding: "5px", margin: "4px 0", fontSize: "0.8rem", border: "1px solid #d4c5ab", backgroundColor: "#fbf8f0" }}
                    >
                        <option value="Copyright infringement">Copyright infringement</option>
                        <option value="Plagiarism">Plagiarism</option>
                        <option value="Spam">Spam</option>
                        <option value="Offensive content">Offensive content</option>
                        <option value="Other">Other</option>
                    </select>
                    <label style={{ display: "block", fontSize: "0.75rem", margin: "4px 0" }}>Additional Details:</label>
                    <textarea
                        rows={2}
                        value={reportComments}
                        onChange={(e) => setReportComments(e.target.value)}
                        style={{ width: "100%", padding: "5px", margin: "4px 0", boxSizing: "border-box", border: "1px solid #d4c5ab", backgroundColor: "#fbf8f0" }}
                        placeholder="Provide links or proof if possible..."
                    />
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                        <button onClick={handleReportSubmit} disabled={reporting} style={{
                            padding: "5px 10px", background: "#c0392b", color: "white", border: "none", cursor: "pointer", fontSize: "0.75rem"
                        }}>
                            {reporting ? "Submitting..." : "Submit Flag"}
                        </button>
                        <button onClick={() => setShowReportForm(false)} style={{
                            padding: "5px 10px", background: "#7d6b58", color: "white", border: "none", cursor: "pointer", fontSize: "0.75rem"
                        }}>
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: "right", marginTop: "12px" }}>
                    <button 
                        onClick={() => setShowReportForm(true)} 
                        style={{ background: "transparent", border: "none", color: "#c0392b", fontSize: "0.75rem", cursor: "pointer", textDecoration: "underline" }}
                    >
                        ⚠ Report Content / Plagiarism
                    </button>
                </div>
            )}
        </div>
    </div>
    );
};

export default PreviewModal;
