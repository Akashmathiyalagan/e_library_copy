import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import "./PaymentPage.css";

const PaymentPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const book = location.state?.book;

  const [purchaseType, setPurchaseType] = useState("permanent");
  const [rentalDays, setRentalDays] = useState(1);
  const [finalPrice, setFinalPrice] = useState(0);

  useEffect(() => {
    if (book) {
      const basePrice = parseFloat(book.price) || 0;
      if (purchaseType === "permanent") {
        setFinalPrice(basePrice);
      } else {
        const rentRate = basePrice * 0.1; // 10% of price per day
        setFinalPrice((rentRate * rentalDays).toFixed(2));
      }
    }
  }, [purchaseType, rentalDays, book]);

  const handlePayment = async () => {
    if (!book) return;
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please log in to complete the transaction.");
      navigate("/login-register");
      return;
    }

    const payload = {
      bookId: book._id,
      purchaseType,
      rentalDays: purchaseType === "rental" ? parseInt(rentalDays) : null,
      amount: finalPrice,
    };

    try {
      // Step 1: Create Razorpay Order in Backend
      const orderRes = await axios.post("http://localhost:5000/api/payment/create-order", payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const { order_id, amount: amountPaise, currency } = orderRes.data;

      // Step 2: Open Razorpay checkout modal
      const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!keyId) {
        alert("Frontend configuration error: Razorpay Key ID not found.");
        return;
      }

      const options = {
        key: keyId,
        amount: amountPaise,
        currency: currency,
        name: "E-Library",
        description: `Payment for ${book.title} (${purchaseType})`,
        order_id: order_id,
        handler: async function (response) {
          // Step 3: Send payment results to verify endpoint
          try {
            const verifyPayload = {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookId: book._id,
              purchaseType,
              rentalDays: purchaseType === "rental" ? parseInt(rentalDays) : null,
              amount: finalPrice,
            };

            const verifyRes = await axios.post("http://localhost:5000/api/payment/verify-payment", verifyPayload, {
              headers: { Authorization: `Bearer ${token}` }
            });

            alert(verifyRes.data.message || "Payment successful!");
            navigate("/Dashboard");
          } catch (err) {
            console.error("Signature verification error:", err);
            if (err.response?.status === 401) {
              alert("Your session has expired. Please log in again.");
              localStorage.removeItem("token");
              navigate("/login-register");
            } else {
              alert("Payment verification failed: " + (err.response?.data?.error || "Unknown verification error"));
            }
          }
        },
        theme: {
          color: "#5c381f",
        },
        modal: {
          ondismiss: function () {
            alert("Payment flow cancelled by user.");
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        console.error("Razorpay payment failed:", response.error);
        alert(`Payment failed: ${response.error.description}`);
      });
      rzp.open();

    } catch (error) {
      console.error("Payment initialization error:", error);
      if (error.response?.status === 401) {
        alert("Your session has expired. Please log in again.");
        localStorage.removeItem("token");
        navigate("/login-register");
      } else {
        alert("Payment failed: " + (error.response?.data?.error || "Unknown error"));
      }
    }
  };

  if (!book) {
    return (
      <div className="payment-container">
        <div className="payment-card">
          <h2 style={{ color: "#ff4b2b" }}>No book selected for payment.</h2>
          <button onClick={() => navigate("/Dashboard")} className="pay-button" style={{ backgroundColor: "#ff4b2b" }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-container">
      <div className="payment-card">
        <h2>Buy or Rent Book</h2>
        <h3 className="payment-book-title">{book.title}</h3>
        <p className="payment-book-author">By {book.author}</p>
        
        {book.cover_url && (
          <img src={book.cover_url} alt={book.title} className="payment-book-cover" />
        )}

        <div className="payment-options">
          <label className="payment-label">Purchase Option</label>
          <select
            className="payment-select"
            value={purchaseType}
            onChange={(e) => setPurchaseType(e.target.value)}
          >
            <option value="permanent">Permanent Purchase</option>
            <option value="rental">Rent (by days)</option>
          </select>

          {purchaseType === "rental" && (
            <div className="rental-duration-container">
              <label className="payment-label">Rental Duration (Days)</label>
              <input
                type="number"
                className="payment-input"
                min={1}
                value={rentalDays}
                onChange={(e) => setRentalDays(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </div>
          )}
        </div>

        <div className="price">
          Total Price: ₹{finalPrice}
        </div>

        <div className="payment-actions">
          <button onClick={() => navigate("/Dashboard")} className="pay-button cancel-btn">
            Cancel
          </button>
          <button className="pay-button confirm-btn" onClick={handlePayment}>
            Confirm & Pay
          </button>
        </div>

        <div className="payment-helper-box">
          <p><strong>💡 Test Mode Guide:</strong></p>
          <ul>
            <li>For mock success, select <strong>Netbanking</strong> (SBI, HDFC, etc.).</li>
            <li>For mock card payments, use test card: <code>4111 1111 1111 1111</code>.</li>
            <li>Note: International card payments are disabled in Razorpay test mode.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;
