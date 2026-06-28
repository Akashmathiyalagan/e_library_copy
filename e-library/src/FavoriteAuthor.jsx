import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FaArrowLeft, FaBookOpen } from "react-icons/fa";
import "./FavoriteAuthor.css"; // CSS styles

const FavoriteAuthors = () => {
    const navigate = useNavigate();
    const [favoriteAuthors, setFavoriteAuthors] = useState(() => JSON.parse(localStorage.getItem("favoriteAuthors")) || []);
    const [allNewBooks, setAllNewBooks] = useState([]);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (token) {
            axios.get("http://localhost:5000/api/user-profile", {
                headers: { Authorization: `Bearer ${token}` }
            })
            .then((response) => {
                if (response.data.favoriteAuthors) {
                    setFavoriteAuthors(response.data.favoriteAuthors);
                    localStorage.setItem("favoriteAuthors", JSON.stringify(response.data.favoriteAuthors));
                }
            })
            .catch((error) => console.error("Error fetching user profile favorites:", error));
        }
    }, []);

    useEffect(() => {
        if (favoriteAuthors.length === 0) return;

        const fetchNewBooks = async () => {
            try {
                const response = await axios.get("http://localhost:5000/get_uploaded_books");
                const booksList = response.data.books || [];

                // Filter books by favorite authors and is_new flag
                const filtered = booksList.filter(
                    book => favoriteAuthors.some(author => author.toLowerCase() === book.author.toLowerCase()) && book.is_new
                );

                setAllNewBooks(filtered);
            } catch (error) {
                console.error("Error fetching books:", error);
            }
        };

        fetchNewBooks();
    }, [favoriteAuthors]);

    return (
        <div className="favorite-authors-page-wrapper">
            <div className="fav-header-container">
                <span className="dashboard-back-bookmark" onClick={() => navigate("/Dashboard")}>
                    <FaArrowLeft style={{ marginRight: "6px" }} /> Back to Dashboard
                </span>
                <h2>Notifications</h2>
            </div>
            
            {allNewBooks.length === 0 ? (
                <div className="fav-empty-state">
                    <p>No new updates from your favorite authors at this time.</p>
                </div>
            ) : (
                <div className="notification-feed-container">
                    {allNewBooks.map((book, index) => (
                        <div key={index} className="notification-feed-card">
                            <img
                                src={book.cover_url || "default_cover.jpg"}
                                alt={book.title}
                                className="notification-book-cover"
                            />
                            <div className="notification-content">
                                <p className="notification-text">
                                    <strong className="notification-author">{book.author}</strong> published a new book: <span className="notification-book-title">"{book.title}"</span>
                                </p>
                                <span className="notification-time-tag">New Release</span>
                            </div>
                            <button
                                className="notification-action-btn"
                                onClick={() => book.file_url && window.open(book.file_url, "_blank")}
                                disabled={!book.file_url}
                            >
                                <FaBookOpen style={{ marginRight: "6px" }} /> Read Now
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default FavoriteAuthors;
