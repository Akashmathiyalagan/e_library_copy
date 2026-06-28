import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "./Profile.css";
import logo from "./assets/logo.png";
import {
    FaBook,
    FaClock,
    FaHistory,
    FaGlobe,
    FaCamera,
    FaArrowLeft,
    FaUser,
    FaStar
} from "react-icons/fa";

const Profile = () => {
    const navigate = useNavigate();

    const [user, setUser] = useState({
        name: "",
        email: "",
        profilePicture: "",
        favoriteAuthors: [],
        purchasedBooks: [],
        rentedBooks: [],
        preferredLanguage: "",
        preferredGenre: "",
        transactions: []
    });

    const [profileImage, setProfileImage] = useState(null);

    const [showAllPurchased, setShowAllPurchased]       = useState(false);
    const [showAllRented, setShowAllRented]             = useState(false);
    const [showAllTransactions, setShowAllTransactions] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("token") || localStorage.getItem("authorToken");
        axios.get("http://localhost:5000/api/user-profile", {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(response => {
                setUser({
                    ...response.data,
                    purchasedBooks: response.data.purchasedBooks || [],
                    rentedBooks: response.data.rentedBooks || [],
                    transactions: response.data.transactions || []
                });
            })
                .catch(error => console.error("Error fetching user profile:", error));
    }, []);

    const handleLanguageChange = (e) => {
        setUser(prev => ({ ...prev, preferredLanguage: e.target.value }));
    };

    const handleProfilePictureUpload = (e) => {
        const file = e.target.files[0];
        setProfileImage(file);

        const formData = new FormData();
        formData.append("profilePicture", file);

        const token = localStorage.getItem("token") || localStorage.getItem("authorToken");
        axios.post("http://localhost:5000/api/upload-profile-picture", formData, {
            headers: { 
                "Content-Type": "multipart/form-data",
                Authorization: `Bearer ${token}`
            }
        })
        .then(response => {
            setUser(prev => ({ ...prev, profilePicture: response.data.profilePicture }));
        })
        .catch(error => console.error("Error uploading profile picture:", error));
    };

    const handleSubmit = () => {
        const token = localStorage.getItem("token") || localStorage.getItem("authorToken");
        axios.post("http://localhost:5000/api/update-user-profile", user, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(response => {
                alert("Profile updated successfully!");
                setUser(response.data);
            })
            .catch(error => console.error("Error updating profile:", error));
    };

    const handleBack = () => {
        if (localStorage.getItem("authorToken")) {
            navigate("/PublisherDashboard");
        } else {
            navigate("/Dashboard");
        }
    };

    // Slice helpers to show recent 5 reversed (latest first)
    const getVisibleItems = (list, showAll) => {
        const reversed = [...list].reverse();
        return showAll ? reversed : reversed.slice(0, 5);
    };

    return (
        <div className="profile-page-wrapper">
            {/* Main Content */}
            <div className="profile-container">
                {/* Left Side Column */}
                <div className="profile-left glass-card">
                    <h2>My Profile</h2>
                    
                    <div className="profile-pic-container">
                        {user.profilePicture ? (
                            <img src={user.profilePicture} alt="Profile" className="profile-pic-img" />
                        ) : (
                            <div className="profile-pic-placeholder">
                                <FaUser size={50} />
                            </div>
                        )}
                    </div>
                    
                    <label className="upload-btn-label">
                        <FaCamera /> Update Photo
                        <input 
                            type="file" 
                            accept="image/*" 
                            onChange={handleProfilePictureUpload} 
                            className="hidden-file-input"
                        />
                    </label>

                    <div className="user-name">{user.name || "User"}</div>
                    <div className="user-email">{user.email}</div>

                    <div className="favorite-authors">
                        <h3><FaStar style={{ color: "#ffd700", marginRight: "6px" }} /> Favorite Authors</h3>
                        <ul className="profile-list">
                            {user.favoriteAuthors?.length > 0 ? (
                                user.favoriteAuthors.map((author, index) => (
                                    <li key={index} className="profile-list-item">
                                        {author}
                                    </li>
                                ))
                            ) : (
                                <li className="profile-list-item empty">No favorite authors</li>
                            )}
                        </ul>
                    </div>

                    {/* Preferred Language & Genre */}
                    <div className="profile-sidebar-field-group">
                        <div className="profile-sidebar-field">
                            <label className="sidebar-field-label">Preferred Language</label>
                            <select 
                                value={user.preferredLanguage || ""} 
                                onChange={handleLanguageChange}
                                className="language-select"
                            >
                                <option value="" disabled>Select Language</option>
                                <option value="English">English</option>
                                <option value="Tamil">Tamil</option>
                                <option value="Hindi">Hindi</option>
                                <option value="Spanish">Spanish</option>
                                <option value="French">French</option>
                                <option value="German">German</option>
                                <option value="Chinese">Chinese</option>
                            </select>
                        </div>

                        <div className="profile-sidebar-field">
                            <label className="sidebar-field-label">Preferred Genre</label>
                            <select 
                                value={user.preferredGenre || ""} 
                                onChange={(e) => setUser(prev => ({ ...prev, preferredGenre: e.target.value }))}
                                className="language-select"
                            >
                                <option value="" disabled>Select Genre</option>
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
                    </div>

                    <button className="save-profile-btn" onClick={handleSubmit}>
                        Save Profile Settings
                    </button>
                </div>

                {/* Right Side Column */}
                <div className="profile-right-grid">
                    <div className="profile-info-card glass-card">
                        <div className="card-header-flex">
                            <h3><FaBook /> Purchased Books</h3>
                            {user.purchasedBooks?.length > 5 && (
                                <button 
                                    className="profile-view-all-btn" 
                                    onClick={() => setShowAllPurchased(!showAllPurchased)}
                                >
                                    {showAllPurchased ? "Show Recent" : "View All"}
                                </button>
                            )}
                        </div>
                        <ul className="profile-list">
                            {user.purchasedBooks?.length > 0 ? (
                                getVisibleItems(user.purchasedBooks, showAllPurchased).map((book, index) => (
                                    <li key={index} className="profile-list-item">
                                        {book}
                                    </li>
                                ))
                            ) : (
                                <li className="profile-list-item empty">No purchased books</li>
                            )}
                        </ul>
                    </div>

                    <div className="profile-info-card glass-card">
                        <div className="card-header-flex">
                            <h3><FaClock /> Rented Books</h3>
                            {user.rentedBooks?.length > 5 && (
                                <button 
                                    className="profile-view-all-btn" 
                                    onClick={() => setShowAllRented(!showAllRented)}
                                >
                                    {showAllRented ? "Show Recent" : "View All"}
                                </button>
                            )}
                        </div>
                        <ul className="profile-list">
                            {user.rentedBooks?.length > 0 ? (
                                getVisibleItems(user.rentedBooks, showAllRented).map((book, index) => (
                                    <li key={index} className="profile-list-item">
                                        {book}
                                    </li>
                                ))
                            ) : (
                                <li className="profile-list-item empty">No rented books</li>
                            )}
                        </ul>
                    </div>

                    <div className="profile-info-card glass-card" style={{ gridColumn: "span 2" }}>
                        <div className="card-header-flex">
                            <h3><FaHistory /> Transaction History</h3>
                            {user.transactions?.length > 5 && (
                                <button 
                                    className="profile-view-all-btn" 
                                    onClick={() => setShowAllTransactions(!showAllTransactions)}
                                >
                                    {showAllTransactions ? "Show Recent" : "View All"}
                                </button>
                            )}
                        </div>
                        <ul className="profile-list">
                            {user.transactions?.length > 0 ? (
                                getVisibleItems(user.transactions, showAllTransactions).map((transaction, index) => (
                                    <li key={index} className="profile-list-item">
                                        {transaction}
                                    </li>
                                ))
                            ) : (
                                <li className="profile-list-item empty">No transaction history found</li>
                            )}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Profile;
