import React from "react";
import "./PreviewModal.css"; // Add any styling you need

const PreviewModal = ({ data, onClose, onConfirm, onStartTrial }) => {
    if (!data) return null;

    const { title, author, authorDetails, description, price, summary, book, owned } = data;

    // Optional chaining and fallback to prevent errors
    const cover = book?.cover_url || "https://via.placeholder.com/150";
    const isPaid = book?.price && parseFloat(book.price) > 0;

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
        </div>
    </div>
    
    );
};

export default PreviewModal;
