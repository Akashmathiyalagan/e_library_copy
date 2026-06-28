import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Browse.css"; // Ensure styles are applied

const languages = [
  { name: "English", image: "/images/bigben.jpg", gradient: "linear-gradient(135deg, #1e90ff, #007bff)" },
  { name: "Tamil", image: "/images/tamil-temple.jpg", gradient: "linear-gradient(135deg, #ff416c, #ff4b2b)" },
  { name: "French", image: "/images/eiffel-tower.jpg", gradient: "linear-gradient(135deg, #11998e, #38ef7d)" },
  { name: "Spanish", image: "/images/spanish-plaza.jpg", gradient: "linear-gradient(135deg, #ff9966, #ff5e62)" },
  { name: "Chinese", image: "/images/great-wall.jpg", gradient: "linear-gradient(135deg, #7f00ff, #e100ff)" },
  { name: "Urdu", image: "/images/taj-mahal.jpg", gradient: "linear-gradient(135deg, #373b44, #4286f4)" },
];

const categories = ["Action", "Drama", "Romance", "Horror", "Entertainment", "Fantasy"];

const Browse = ({ userDetails }) => {
  const [selectedLanguage, setSelectedLanguage] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = () => {
    if (selectedCategory) {
      navigate("/Dashboard", {
        state: { language: selectedLanguage, category: selectedCategory },
      });
    } else {
      alert("Please select a category before submitting.");
    }
  };

  return (
    <div className="browse-container">
      {/* User Details Section */}
      {userDetails && (
        <div className="user-details">
          <h2>Welcome, {userDetails.name}!</h2>
          <p>Email: {userDetails.email}</p>
          <p>Age: {userDetails.age}</p>
          <p>Favorite Genre: {userDetails.favoriteGenre}</p>
        </div>
      )}

      {!selectedLanguage ? (
        <>
          <h2 className="browse-title">Choose a Language</h2>
          <div className="language-grid">
            {languages.map((lang, index) => (
              <div
                key={index}
                className="language-card"
                style={{ backgroundImage: `url(${lang.image}), ${lang.gradient}` }}
                onClick={() => setSelectedLanguage(lang.name)}
              >
                <span className="language-name">{lang.name}</span>
              </div>
            ))}
          </div>
          <div className="button-container">
            <button className="back-btn" onClick={() => navigate(-1)}>⬅ Back</button>
          </div>
        </>
      ) : (
        <>
          <h2 className="browse-title">{selectedLanguage} - Choose a Category</h2>
          <div className="category-grid">
            {categories.map((category, index) => (
              <div
                key={index}
                className={`category-card ${selectedCategory === category ? "selected" : ""}`}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </div>
            ))}
          </div>
          <div className="button-container">
            <button className="back-btn" onClick={() => setSelectedLanguage(null)}>⬅ Back</button>
            <button className="submit-btn" onClick={handleSubmit}>
              Submit
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default Browse;
