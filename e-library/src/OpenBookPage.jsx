import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useEffect, useState } from 'react';
import "./OpenBookPage.css";

function OpenBookPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const [book, setBook] = useState(null);
  const [bookTitle, setBookTitle] = useState('');
  const [bookAuthor, setBookAuthor] = useState('');
  const [bookContent, setBookContent] = useState('');
  const [loading, setLoading] = useState(true);

  // PDF Page structures
  const [isPdf, setIsPdf] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0); // Left page index (0, 2, 4...)
  const [loadingLeftImage, setLoadingLeftImage] = useState(true);
  const [loadingRightImage, setLoadingRightImage] = useState(true);

  // Trial state
  const [isTrial, setIsTrial] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [trialExpired, setTrialExpired] = useState(false);

  // Reading Mode & Full Screen States
  const [readerMode, setReaderMode] = useState('classic'); // 'classic' or 'original'
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullScreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
    };
  }, []);

  const toggleFullScreen = () => {
    if (!isFullScreen) {
      setShowAiSidebar(false); // Close AI sidebar on entering fullscreen
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.error("Error entering fullscreen:", err);
        });
      } else {
        setIsFullScreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.error("Error exiting fullscreen:", err);
        });
      } else {
        setIsFullScreen(false);
      }
    }
  };

  // AI states
  const [showAiSidebar, setShowAiSidebar] = useState(false);
  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiQuotes, setShowAiQuotes] = useState(true);
  const [showAiSuggestions, setShowAiSuggestions] = useState(true);

  useEffect(() => {
    if (showAiSidebar && bookId) {
      setAiLoading(true);
      axios.post("http://localhost:5000/api/ai/analyze-page", {
        bookId,
        leftPageNum: currentPage,
        rightPageNum: readerMode === 'original' ? currentPage : currentPage + 1
      })
      .then((response) => {
        setAiData(response.data);
        setShowAiQuotes(true);
        setShowAiSuggestions(true);
        setAiLoading(false);
      })
      .catch((err) => {
        console.error("Error loading AI analysis:", err);
        setAiLoading(false);
      });
    }
  }, [showAiSidebar, currentPage, bookId]);

  useEffect(() => {
    if (bookId) {
      // Fetch book details
      axios.get(`http://localhost:5000/api/book/${bookId}`)
        .then((response) => {
          const bookData = response.data;
          setBook(bookData);
          setBookTitle(bookData.title);
          setBookAuthor(bookData.author);

          // Handle trial timer once we have book data
          const trialParam = new URLSearchParams(window.location.search).get("trial") === "true";
          setIsTrial(trialParam);

          if (trialParam) {
            // Get trial duration from book, default to 10 minutes
            const trialMinutes = parseInt(bookData.trial_duration) || 10;
            const trialSeconds = trialMinutes * 60;

            const storageKey = `trial_start_${bookId}`;
            let startTime = localStorage.getItem(storageKey);
            if (!startTime) {
              startTime = Date.now().toString();
              localStorage.setItem(storageKey, startTime);
            }

            const checkTime = () => {
              const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
              const remaining = trialSeconds - elapsed;
              if (remaining <= 0) {
                setTimeLeft(0);
                setTrialExpired(true);
              } else {
                setTimeLeft(remaining);
              }
            };

            checkTime();
            const timerId = setInterval(checkTime, 1000);
            return () => clearInterval(timerId);
          }
        })
        .catch((error) => console.error("Error fetching book details:", error));

      // Fetch page count & check if PDF
      axios.get(`http://localhost:5000/api/book/page-count/${bookId}`)
        .then((response) => {
          const { page_count, is_pdf } = response.data;
          setIsPdf(is_pdf);
          setTotalPages(page_count);
          
          if (!is_pdf) {
            // Fetch book text content as fallback
            axios.get(`http://localhost:5000/api/book/content/${bookId}`)
              .then((res) => {
                setBookContent(res.data.content || '');
                setLoading(false);
              })
              .catch((err) => {
                console.error("Error fetching fallback content:", err);
                setLoading(false);
              });
          } else {
            setLoading(false);
          }
        })
        .catch((error) => {
          console.error("Error checking page count:", error);
          // Fallback check
          axios.get(`http://localhost:5000/api/book/content/${bookId}`)
            .then((res) => {
              setBookContent(res.data.content || '');
              setLoading(false);
            })
            .catch(() => setLoading(false));
        });
    }
  }, [bookId]);

  const handleBuyNow = () => {
    if (book) {
      navigate("/PaymentPage", { state: { book } });
    } else {
      navigate("/Dashboard");
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePrevPage = () => {
    if (readerMode === 'original') {
      if (currentPage > 0) {
        setCurrentPage((prev) => prev - 1);
        setLoadingLeftImage(true);
      }
    } else {
      if (currentPage > 0) {
        setCurrentPage((prev) => Math.max(0, prev - 2));
        setLoadingLeftImage(true);
        setLoadingRightImage(true);
      }
    }
  };

  const handleNextPage = () => {
    if (readerMode === 'original') {
      if (currentPage < totalPages - 1) {
        setCurrentPage((prev) => prev + 1);
        setLoadingLeftImage(true);
      }
    } else {
      if (currentPage + 2 < totalPages) {
        setCurrentPage((prev) => prev + 2);
        setLoadingLeftImage(true);
        setLoadingRightImage(true);
      }
    }
  };

  if (loading) {
    return (
      <div className="reader-loading-container">
        <div className="parchment-loader">Opening Manuscript...</div>
      </div>
    );
  }

  if (trialExpired) {
    return (
      <div className="reader-container trial-expired-bg">
        <div className="trial-expired-card">
          <span className="expired-icon">⏳</span>
          <h2>Trial Period Expired!</h2>
          <p>
            Your 10-minute free trial reading session for <strong>{bookTitle}</strong> has come to an end.
          </p>
          <p className="expired-sub">
            Please permanent purchase or rent this book to read the complete manuscript.
          </p>
          <div className="expired-actions">
            <button onClick={() => navigate("/Dashboard")} className="back-dashboard-btn">
              Back to Dashboard
            </button>
            <button onClick={handleBuyNow} className="buy-rent-btn">
              Buy or Rent Book
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle fallback rendering for text books
  let leftParagraphs = [];
  let rightParagraphs = [];
  if (!isPdf && bookContent) {
    const paragraphs = bookContent.split('\n').filter(p => p.trim() !== '');
    if (paragraphs.length <= 1) {
      const words = bookContent.split(' ');
      const half = Math.ceil(words.length / 2);
      leftParagraphs = [words.slice(0, half).join(' ')];
      rightParagraphs = [words.slice(half).join(' ')];
    } else {
      const halfIndex = Math.ceil(paragraphs.length / 2);
      leftParagraphs = paragraphs.slice(0, halfIndex);
      rightParagraphs = paragraphs.slice(halfIndex);
    }
  }

  return (
    <div className={`reader-container ${readerMode === 'original' ? 'original-mode-bg' : ''} ${isFullScreen ? 'full-screen-mode' : ''}`}>
      {/* Conditionally render bookmarks only when NOT in Full Screen Mode */}
      {!isFullScreen && (
        <>
          {/* Hanging Leather Bookmark acting as back button */}
          <div className="bookmark-button" onClick={() => navigate("/Dashboard")}>
            <span className="bookmark-text">Dashboard</span>
          </div>

          {/* Hanging Bookmark for Reader Mode Switcher */}
          <div className="bookmark-button mode-bookmark" onClick={() => {
            if (readerMode === 'classic') {
              setReaderMode('original');
            } else {
              // Adjust currentPage to be even when switching to classic (2-page) mode
              setCurrentPage(prev => Math.floor(prev / 2) * 2);
              setReaderMode('classic');
            }
          }}>
            <span className="bookmark-text">
              {readerMode === 'classic' ? "Original View" : "Classic View"}
            </span>
          </div>

          {/* Hanging Bookmark for Full Screen Toggle */}
          <div className="bookmark-button fullscreen-bookmark" onClick={toggleFullScreen}>
            <span className="bookmark-text">Full Screen</span>
          </div>

          {/* Hanging AI Bookmark acting as analysis trigger */}
          <div className="bookmark-button ai-bookmark" onClick={() => setShowAiSidebar(!showAiSidebar)}>
            <span className="bookmark-text">AI Analysis</span>
          </div>
        </>
      )}

      {/* Floating Exit Button (Only visible inside Full Screen mode) */}
      {isFullScreen && (
        <button 
          className="fullscreen-toggle-btn active"
          onClick={toggleFullScreen}
          title="Exit Full Screen"
        >
          ✕ Exit Full Screen
        </button>
      )}

      {/* Floating Free Trial Banner */}
      {isTrial && (
        <div className="trial-timer-banner">
          <span className="timer-icon font-pulsing">⏱</span>
          <span className="timer-label">Free Trial Preview:</span>
          <span className="timer-countdown">{formatTime(timeLeft)} remaining</span>
        </div>
      )}

      {/* Main Content Area based on selected Reading Type */}
      {readerMode === 'classic' ? (
        <div className="reader-book-spread">
          
          {/* LEFT PAGE */}
          <div className="reader-page left-page">
            <div className="reader-page-content">
              {isPdf ? (
                <div className="pdf-page-container">
                  {loadingLeftImage && <div className="page-img-loader">Deciphering...</div>}
                  <img
                    src={`http://localhost:5000/api/book/render-page/${bookId}/${currentPage}`}
                    alt={`Page ${currentPage + 1}`}
                    className={`pdf-page-img ${loadingLeftImage ? "hidden" : ""}`}
                    onLoad={() => setLoadingLeftImage(false)}
                  />
                  <span className="reader-page-number">— {currentPage + 1} —</span>
                </div>
              ) : (
                <>
                  <h1 className="reader-book-title">{bookTitle || "Book Content"}</h1>
                  <p className="reader-book-author">{bookAuthor ? `By ${bookAuthor}` : ""}</p>
                  <div className="reader-divider">✦ ✦ ✦</div>
                  <div className="reader-text-scroll">
                    {leftParagraphs.map((para, index) => (
                      <p key={index} className="reader-paragraph">{para}</p>
                    ))}
                  </div>
                  <span className="reader-page-number">Page I</span>
                </>
              )}
            </div>
          </div>

          {/* Middle Spine Gutter */}
          <div className="reader-spine"></div>

          {/* RIGHT PAGE */}
          <div className="reader-page right-page">
            <div className="reader-page-content">
              {isPdf ? (
                <div className="pdf-page-container">
                  {currentPage + 1 < totalPages ? (
                    <>
                      {loadingRightImage && <div className="page-img-loader">Deciphering...</div>}
                      <img
                        src={`http://localhost:5000/api/book/render-page/${bookId}/${currentPage + 1}`}
                        alt={`Page ${currentPage + 2}`}
                        className={`pdf-page-img ${loadingRightImage ? "hidden" : ""}`}
                        onLoad={() => setLoadingRightImage(false)}
                      />
                      <span className="reader-page-number">— {currentPage + 2} —</span>
                    </>
                  ) : (
                    <div className="end-of-book">
                      <span className="end-ornament">✦</span>
                      <p>The End</p>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="reader-text-scroll scroll-right">
                    {rightParagraphs.map((para, index) => (
                      <p key={index} className="reader-paragraph">{para}</p>
                    ))}
                  </div>
                  <span className="reader-page-number">Page II</span>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="original-reader-view">
          <div className="original-reader-container">
            <div className="original-content-area">
              {isPdf ? (
                <div className="original-pdf-container">
                  {loadingLeftImage && <div className="original-page-loader">Loading page...</div>}
                  <img
                    src={`http://localhost:5000/api/book/render-page/${bookId}/${currentPage}`}
                    alt={`Page ${currentPage + 1}`}
                    className={`original-pdf-img ${loadingLeftImage ? "hidden" : ""}`}
                    onLoad={() => setLoadingLeftImage(false)}
                  />
                  <span className="original-page-number">Page {currentPage + 1} of {totalPages}</span>
                </div>
              ) : (
                <div className="original-text-content">
                  {bookContent}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Reading Controls Navigation */}
      {isPdf && totalPages > 0 && !isFullScreen && (
        <div className="pdf-nav-controls">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className="pdf-nav-btn prev"
          >
            ◀ Prev Page
          </button>
          
          <span className="pdf-page-indicator">
            {readerMode === 'original' ? (
              `Page ${currentPage + 1} of ${totalPages}`
            ) : (
              `Page ${currentPage + 1} - ${Math.min(totalPages, currentPage + 2)} of ${totalPages}`
            )}
          </span>
          
          <button
            onClick={handleNextPage}
            disabled={readerMode === 'original' ? currentPage >= totalPages - 1 : currentPage + 2 >= totalPages}
            className="pdf-nav-btn next"
          >
            Next Page ▶
          </button>
        </div>
      )}

      {/* Immersive Floating Pagination Overlay in Full Screen (PDF only) */}
      {isPdf && totalPages > 0 && isFullScreen && (
        <>
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className="fullscreen-nav-btn prev-btn"
            title="Previous Page"
          >
            ◀
          </button>
          
          <button
            onClick={handleNextPage}
            disabled={readerMode === 'original' ? currentPage >= totalPages - 1 : currentPage + 2 >= totalPages}
            className="fullscreen-nav-btn next-btn"
            title="Next Page"
          >
            ▶
          </button>
        </>
      )}

      {/* AI Page Analysis Sidebar */}
      <div className={`ai-analysis-sidebar ${showAiSidebar ? "open" : ""}`}>
        <div className="ai-sidebar-header">
          <h3>Gemini AI Analysis</h3>
          <button className="ai-sidebar-close" onClick={() => setShowAiSidebar(false)}>&times;</button>
        </div>
        
        <div className="ai-sidebar-content">
          {aiLoading ? (
            <div className="ai-sidebar-loading">
              <div className="shimmer-line"></div>
              <div className="shimmer-line"></div>
              <div className="shimmer-line"></div>
              <p>Gemini is reading the page...</p>
            </div>
          ) : aiData ? (
            <>
              <div className="ai-section">
                <h4><span className="ai-icon">✨</span> Key Insights</h4>
                <p>{aiData.insights}</p>
              </div>

              {aiData.quotes && aiData.quotes.length > 0 && showAiQuotes && (
                <div className="ai-section">
                  <div className="ai-section-header">
                    <h4><span className="ai-icon">📜</span> Memorable Quotes</h4>
                    <button className="ai-section-close-btn" onClick={() => setShowAiQuotes(false)} title="Dismiss Quotes">&times;</button>
                  </div>
                  {aiData.quotes.map((quote, idx) => (
                    <blockquote key={idx} className="ai-blockquote">
                      {quote}
                    </blockquote>
                  ))}
                </div>
              )}

              {showAiSuggestions && (
                <div className="ai-section">
                  <div className="ai-section-header">
                    <h4><span className="ai-icon">💡</span> AI Reading Suggestion</h4>
                    <button className="ai-section-close-btn" onClick={() => setShowAiSuggestions(false)} title="Dismiss Suggestion">&times;</button>
                  </div>
                  <p>{aiData.suggestion}</p>
                </div>
              )}
            </>
          ) : (
            <p className="ai-empty-text">No analysis available. Flip the page or toggle analysis again.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default OpenBookPage;
