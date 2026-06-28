import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import axios from "axios";
import "./Dashboard.css";
import {
    FaSearch,
    FaBell,
    FaUser,
    FaHome,
    FaFilter,
    FaStar,
    FaCircle,
    FaLock
} from "react-icons/fa";
import logo from "./assets/logo.png";
import PreviewModal from "./PreviewModal";

const Dashboard = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [books, setBooks] = useState([]);
    const [filteredBooks, setFilteredBooks] = useState([]);
    const [authors, setAuthors] = useState([]);
    const [filteredAuthors, setFilteredAuthors] = useState([]);
    const [selectedAuthor, setSelectedAuthor] = useState(null);
    const [bookSearch, setBookSearch] = useState("");
    const [authorSearch, setAuthorSearch] = useState("");
    const [favoriteAuthors, setFavoriteAuthors] = useState(
        JSON.parse(localStorage.getItem("favoriteAuthors")) || []
    );
    const [newBookNotifications, setNewBookNotifications] = useState({});
    const [userEmail, setUserEmail] = useState("");
    const [purchasedBooks, setPurchasedBooks] = useState([]);
    const [rentedBooks, setRentedBooks] = useState([]);
    const [checkedBooks, setCheckedBooks] = useState(
        JSON.parse(localStorage.getItem("checkedBooks")) || []
    );

    // Filter states
    const [filterGenre, setFilterGenre] = useState("");
    const [filterLanguage, setFilterLanguage] = useState("");
    const [showFilterPanel, setShowFilterPanel] = useState(false);

    const [selectedBook, setSelectedBook] = useState(null);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState(null);

    const [aiRecommendation, setAiRecommendation] = useState(null);

    useEffect(() => {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        const token = localStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        axios.get("http://localhost:5000/api/ai/dashboard-insights", { headers })
            .then((response) => {
                setAiRecommendation(response.data);
            })
            .catch((err) => console.error("Error fetching AI dashboard insights:", err));
    }, []);

    useEffect(() => {
        if (books.length > 0 && favoriteAuthors.length > 0) {
            const recentBooks = books.filter(
                (book) => favoriteAuthors.includes(book.author) && book.is_new
            );

            if (recentBooks.length > 0) {
                const notificationSent = sessionStorage.getItem("favAuthorNotificationSent") === "true";
                if (!notificationSent) {
                    if ("Notification" in window && Notification.permission === "granted") {
                        const firstBook = recentBooks[0];
                        const count = recentBooks.length;
                        const bodyText = count === 1 
                            ? `${firstBook.author} recently released a new book: "${firstBook.title}"!`
                            : `${firstBook.author} and others recently released ${count} new books!`;
                        
                        new Notification("📚 New Book from Favorite Author", {
                            body: bodyText,
                            icon: logo
                        });
                        sessionStorage.setItem("favAuthorNotificationSent", "true");
                    }
                }
            }
        }
    }, [books, favoriteAuthors]);

    useEffect(() => {
        axios
            .get("http://localhost:5000/get_uploaded_books")
            .then((response) => {
                setBooks(response.data.books);
                setFilteredBooks(response.data.books);
            })
            .catch((error) => console.error("Error fetching books:", error));

        axios
            .get("http://localhost:5000/get_authors")
            .then((response) => {
                setAuthors(response.data.authors);
                setFilteredAuthors(response.data.authors);
            })
            .catch((error) => console.error("Error fetching authors:", error));

        const token = localStorage.getItem("token");
        if (token) {
            axios.get("http://localhost:5000/api/user-profile", {
                headers: { Authorization: `Bearer ${token}` }
            })
            .then((response) => {
                setUserEmail(response.data.email || "");
                setPurchasedBooks(response.data.purchasedBooks || []);
                setRentedBooks(response.data.rentedBooks || []);
                
                // Default filters to user preferences saved in profile ONLY ONCE per session
                const preferencesApplied = sessionStorage.getItem("preferencesApplied") === "true";
                if (!preferencesApplied) {
                    if (response.data.preferredLanguage) {
                        setFilterLanguage(response.data.preferredLanguage);
                    }
                    if (response.data.preferredGenre) {
                        setFilterGenre(response.data.preferredGenre);
                    }
                    sessionStorage.setItem("preferencesApplied", "true");
                }

                if (response.data.favoriteAuthors) {
                    setFavoriteAuthors(response.data.favoriteAuthors);
                    localStorage.setItem("favoriteAuthors", JSON.stringify(response.data.favoriteAuthors));
                }
            })
            .catch((error) => console.error("Error fetching user profile favorites:", error));
        }
    }, []);

    const isOwned = (book) => {
        if (!book) return false;
        if (parseFloat(book.price) === 0 || book.is_free) return true;
        
        // Auto-own if current user is the author of this book
        if (userEmail && book.uploaded_by && userEmail.toLowerCase() === book.uploaded_by.toLowerCase()) {
            return true;
        }
        
        // Check purchased books (titles array)
        const isPurchased = purchasedBooks.some(
            (title) => title.toLowerCase() === book.title.toLowerCase()
        );
        
        // Check rented books (strings of format "Title (Expires: YYYY-MM-DD)")
        const isRented = rentedBooks.some(
            (info) => info.toLowerCase().startsWith(book.title.toLowerCase())
        );

        return isPurchased || isRented;
    };

    const getBookOwnershipDetails = (book) => {
        if (!book) return { isOwned: false, type: "", label: "" };
        const isFree = parseFloat(book.price) === 0 || book.is_free;

        // Auto-own if current user is the author of this book
        if (userEmail && book.uploaded_by && userEmail.toLowerCase() === book.uploaded_by.toLowerCase()) {
            return { isOwned: true, type: "purchased", label: "Author's Copy" };
        }

        const isPurchased = purchasedBooks.some(
            (title) => title.toLowerCase() === book.title.toLowerCase()
        );
        const isRented = rentedBooks.some(
            (info) => info.toLowerCase().startsWith(book.title.toLowerCase())
        );

        if (isPurchased) return { isOwned: true, type: "purchased", label: "Purchased" };
        if (isRented) return { isOwned: true, type: "rented", label: "Rented" };
        if (isFree) return { isOwned: true, type: "free", label: "Free" };
        return { isOwned: false, type: "paid", label: formatPrice(book.price) };
    };

    useEffect(() => {
        if (books.length > 0) {
            checkNewBooks(books);
        }
    }, [favoriteAuthors, books, checkedBooks]);

    // Unified Reactive Filtering logic for Books
    useEffect(() => {
        let result = books;

        if (selectedAuthor) {
            result = result.filter((book) => book.author === selectedAuthor);
        }

        if (bookSearch) {
            result = result.filter((book) =>
                book.title.toLowerCase().includes(bookSearch.toLowerCase())
            );
        }

        if (filterGenre) {
            result = result.filter((book) =>
                book.genre && book.genre.toLowerCase() === filterGenre.toLowerCase()
            );
        }

        if (filterLanguage) {
            result = result.filter((book) =>
                book.language && book.language.toLowerCase() === filterLanguage.toLowerCase()
            );
        }

        setFilteredBooks(result);
    }, [books, selectedAuthor, bookSearch, filterGenre, filterLanguage]);

    useEffect(() => {
        if (!selectedAuthor) return;

        const handleClickOutside = (event) => {
            if (
                !event.target.closest(".left-sidebar") &&
                !event.target.closest(".navbar") &&
                !event.target.closest(".preview-modal-overlay") &&
                !event.target.closest(".filter-panel-dropdown") &&
                !event.target.closest(".book-card")
            ) {
                setSelectedAuthor(null);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [selectedAuthor]);

    useEffect(() => {
        if (!filterGenre && !filterLanguage && !showFilterPanel) return;

        const handleClickOutside = (event) => {
            if (
                !event.target.closest(".filter-panel-dropdown") &&
                !event.target.closest(".navbar") &&
                !event.target.closest(".left-sidebar") &&
                !event.target.closest(".preview-modal-overlay") &&
                !event.target.closest(".book-card")
            ) {
                setShowFilterPanel(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [filterGenre, filterLanguage, showFilterPanel]);

    const checkNewBooks = (bookList) => {
        let newNotifications = {};
        favoriteAuthors.forEach((author) => {
            // Find if there is any new book by the author that hasn't been checked/read yet
            const hasNewBook = bookList.some(
                (book) => book.author === author && book.is_new && !checkedBooks.includes(book._id)
            );
            if (hasNewBook) {
                newNotifications[author] = true;
            }
        });
        setNewBookNotifications(newNotifications);
    };

    const generatePreview = async (book) => {
        const authorDetails = authors.includes(book.author)
            ? `${book.author} is a reputed author in our library.`
            : `Details about ${book.author} are limited.`;
    
        let summary = "Generating AI summary...";
    
        try {
            const response = await fetch("http://localhost:5000/gemini-summary", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    title: book.title,
                    author: book.author,
                    description: book.description || "No description provided."
                }),
            });
    
            const result = await response.json();
            summary = result.summary || "No summary available.";
        } catch (error) {
            console.error("Error fetching summary:", error);
            summary = "Failed to generate summary.";
        }
    
        setPreviewData({
            title: book.title,
            author: book.author,
            authorDetails,
            description: book.description || "No description available.",
            price: formatPrice(book.price),
            summary,
            book,
            owned: isOwned(book),
        });
        setShowPreview(true);
    };
    

    const handleBookClick = (book) => {
        generatePreview(book);
        
        // Add book ID to checked list so the notification dot is cleared permanently
        if (book && book._id && !checkedBooks.includes(book._id)) {
            const updatedChecked = [...checkedBooks, book._id];
            setCheckedBooks(updatedChecked);
            localStorage.setItem("checkedBooks", JSON.stringify(updatedChecked));
        }
    };

    const handleConfirmToPay = (book) => {
        setShowPreview(false);
        if (isOwned(book)) {
            navigate(`/OpenBookPage/${book._id}`, { state: { book } });
        } else if (parseFloat(book.price) > 0) {
            navigate("/PaymentPage", { state: { book } });
        } else {
            navigate(`/OpenBookPage/${book._id}`, { state: { book } });
        }
    };
    
    const handleAuthorClick = (author) => {
        setSelectedAuthor((prev) => (prev === author ? null : author)); // Toggle filter
        setNewBookNotifications((prev) => ({ ...prev, [author]: false }));
        if (location.pathname !== "/Dashboard" && location.pathname !== "/Dashboard/") {
            navigate("/Dashboard");
        }
    };

    const handleBookSearch = (event) => {
        setBookSearch(event.target.value);
    };

    const handleAuthorSearch = (event) => {
        const searchValue = event.target.value.toLowerCase();
        setAuthorSearch(searchValue);

        if (!searchValue) {
            setFilteredAuthors(authors);
            return;
        }

        const filtered = authors.filter((author) =>
            author.toLowerCase().includes(searchValue)
        );
        setFilteredAuthors(filtered);
    };

    const toggleFavoriteAuthor = (author) => {
        let updatedFavorites;
        if (favoriteAuthors.includes(author)) {
            updatedFavorites = favoriteAuthors.filter((fav) => fav !== author);
        } else {
            updatedFavorites = [...favoriteAuthors, author];
        }
        setFavoriteAuthors(updatedFavorites);
        localStorage.setItem("favoriteAuthors", JSON.stringify(updatedFavorites));

        const token = localStorage.getItem("token");
        if (token) {
            axios.post("http://localhost:5000/favorite_authors", {
                favorite_authors: updatedFavorites
            }, {
                headers: { Authorization: `Bearer ${token}` }
            })
            .catch((err) => console.error("Error syncing favorite authors:", err));
        }
    };

    const formatPrice = (price) => {
        const parsed = parseFloat(price);
        if (!isNaN(parsed)) return `₹${parsed.toFixed(2)}`;
        return "₹0.00";
    };

    const handleStartTrial = (book) => {
        setShowPreview(false);
        navigate(`/OpenBookPage/${book._id}?trial=true`, { state: { book } });
    };

    const isBaseDashboard = location.pathname === "/Dashboard" || location.pathname === "/Dashboard/";

    return (
        <div className="dashboard-container">
            <div className="navbar">
                <div className="logo-container" onClick={() => navigate("/")}>
                    <img src={logo} alt="Logo" className="logo-img" />
                    <span className="logo-text">E-LIBRARY</span>
                </div>
                {isBaseDashboard && (
                    <div className="search-container">
                        <input
                            type="text"
                            className="search-bar"
                            placeholder="Search books..."
                            value={bookSearch}
                            onChange={handleBookSearch}
                        />
                        <FaSearch className="search-icon" />
                    </div>
                )}
                <div className="nav-icons">
                    {isBaseDashboard && (
                        <FaFilter 
                            className={`icon ${showFilterPanel ? "active-filter-icon" : ""}`} 
                            onClick={() => setShowFilterPanel(!showFilterPanel)} 
                            title="Filter Books"
                        />
                    )}
                    <FaHome className="icon" onClick={() => navigate("/Dashboard")} />
                    <FaBell
                        className="icon"
                        onClick={() => navigate("/Dashboard/FavoriteAuthor")}
                    />
                    <FaUser className="icon" onClick={() => navigate("/Dashboard/Profile")} />
                </div>
            </div>

            {/* Filter Panel Dropdown */}
            {showFilterPanel && (
                <div className="filter-panel-dropdown">
                    <div className="filter-field">
                        <label className="filter-label">Genre:</label>
                        <select 
                            value={filterGenre} 
                            onChange={(e) => setFilterGenre(e.target.value)}
                            className="filter-select"
                        >
                            <option value="">All Genres</option>
                            <option value="Fiction">Fiction</option>
                            <option value="Non-Fiction">Non-Fiction</option>
                            <option value="Mystery & Thriller">Mystery & Thriller</option>
                            <option value="Science Fiction">Science Fiction</option>
                            <option value="Fantasy">Fantasy</option>
                            <option value="Romance">Romance</option>
                            <option value="Biography & Memoir">Biography & Memoir</option>
                            <option value="History">History</option>
                            <option value="Philosophy">Philosophy</option>
                        </select>
                    </div>

                    <div className="filter-field">
                        <label className="filter-label">Language:</label>
                        <select 
                            value={filterLanguage} 
                            onChange={(e) => setFilterLanguage(e.target.value)}
                            className="filter-select"
                        >
                            <option value="">All Languages</option>
                            <option value="English">English</option>
                            <option value="Tamil">Tamil</option>
                            <option value="Hindi">Hindi</option>
                            <option value="Spanish">Spanish</option>
                            <option value="French">French</option>
                            <option value="German">German</option>
                            <option value="Chinese">Chinese</option>
                        </select>
                    </div>

                    <button 
                        onClick={() => { setFilterGenre(""); setFilterLanguage(""); }} 
                        className="filter-clear-btn"
                    >
                        Clear Filters
                    </button>
                </div>
            )}

            {isBaseDashboard && (
                <div className="left-sidebar">
                    <div className="author-search-container">
                        <input
                            type="text"
                            className="author-search-bar"
                            placeholder="Search for authors"
                            value={authorSearch}
                            onChange={handleAuthorSearch}
                        />
                        <FaSearch className="author-search-icon" />
                    </div>
                    <div className="author-list">
                        <h4>Authors:</h4>
                        <ul>
                            {filteredAuthors.length > 0 ? (
                                filteredAuthors.map((author, index) => (
                                    <li key={index} className={selectedAuthor === author ? "active" : ""}>
                                        <span onClick={() => handleAuthorClick(author)}>
                                            {author}
                                            {newBookNotifications[author] && (
                                                <FaCircle className="notification-dot" />
                                            )}
                                        </span>
                                        <FaStar
                                            className={`favorite-icon ${
                                                favoriteAuthors.includes(author)
                                                    ? "favorited"
                                                    : ""
                                            }`}
                                            onClick={() => toggleFavoriteAuthor(author)}
                                        />
                                    </li>
                                ))
                            ) : (
                                <p>No authors found</p>
                            )}
                        </ul>
                    </div>
                </div>
            )}

            <div className={`dashboard-content ${isBaseDashboard ? "" : "full-width"}`}>
                {isBaseDashboard ? (
                    <>
                        {/* AI Recommendation Banner */}
                        {aiRecommendation && 
                         !selectedAuthor && 
                         !bookSearch && 
                         !filterGenre && 
                         !filterLanguage && 
                         books.some(b => b._id === aiRecommendation.bookId) && (
                            <div className="book-section ai-recommendation-section">
                                <h3>Recommendation</h3>
                                <div className="book-grid">
                                    {books.filter(b => b._id === aiRecommendation.bookId).map((book, index) => {
                                        const ownership = getBookOwnershipDetails(book);
                                        return (
                                            <div
                                                key={index}
                                                className="book-card"
                                                onClick={() => handleBookClick(book)}
                                            >
                                                <div className="book-cover-container">
                                                    <img
                                                        src={book.cover_url}
                                                        alt={book.title}
                                                        className="book-cover"
                                                    />
                                                    {!ownership.isOwned && (
                                                        <div className="lock-overlay">
                                                            <FaLock className="lock-icon" />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="book-title">{book.title}</p>
                                                <p className={`book-price-tag ${ownership.isOwned ? "owned" : ""}`}>
                                                    {ownership.isOwned ? (ownership.type === "free" ? "Free" : "Owned") : ownership.label}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="book-section">
                            <h3>{selectedAuthor ? `Books by ${selectedAuthor}` : "All Books"}</h3>
                            <div className="book-grid">
                                {filteredBooks.length > 0 ? (
                                    filteredBooks.map((book, index) => {
                                        const ownership = getBookOwnershipDetails(book);
                                        return (
                                            <div
                                                key={index}
                                                className="book-card"
                                                onClick={() => handleBookClick(book)}
                                            >
                                                <div className="book-cover-container">
                                                    <img
                                                        src={book.cover_url}
                                                        alt={book.title}
                                                        className="book-cover"
                                                    />
                                                    {!ownership.isOwned && (
                                                        <div className="lock-overlay">
                                                            <FaLock className="lock-icon" />
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="book-title">{book.title}</p>
                                                <p className={`book-price-tag ${ownership.isOwned ? "owned" : ""}`}>
                                                    {ownership.isOwned ? (ownership.type === "free" ? "Free" : "Owned") : ownership.label}
                                                </p>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p>No books available</p>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <Outlet />
                )}
            </div>

            {showPreview && (
                <PreviewModal
                    data={previewData}
                    onClose={() => setShowPreview(false)}
                    onConfirm={handleConfirmToPay}
                    onStartTrial={handleStartTrial}
                />
            )}
        </div>
    );
};

export default Dashboard;
