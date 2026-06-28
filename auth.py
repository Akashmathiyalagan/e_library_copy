from flask import Flask, request, jsonify, send_from_directory, url_for
from flask_cors import CORS
from pymongo import MongoClient
import bcrypt
import jwt
import datetime
import os
from werkzeug.utils import secure_filename
from bson import ObjectId
from dotenv import load_dotenv
import razorpay

# Load environment variables
load_dotenv()


# Initialize Razorpay Client
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET")


razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID or "", RAZORPAY_KEY_SECRET or ""))

print("KEY ID:", os.getenv("RAZORPAY_KEY_ID"))
print("SECRET EXISTS:", os.getenv("RAZORPAY_KEY_SECRET") is not None)
# Flask app setup
app = Flask(__name__)
CORS(app, supports_credentials=True)

# Secret key
app.config['SECRET_KEY'] = 'your-secret-key'

# MongoDB setup
client = MongoClient("mongodb://localhost:27017")
db = client["auth_db"]

users_collection = db["users"]
authors_collection = db["authors"]
books_collection = db["books"]

UPLOAD_FOLDER = 'uploads/books'
COVER_FOLDER = 'uploads/covers'
ASSETS_FOLDER = 'assets'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(COVER_FOLDER, exist_ok=True)
os.makedirs(ASSETS_FOLDER, exist_ok=True)

# ===== Serve Uploaded Files =====
@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory('uploads', filename)

def format_book(book):
    book["_id"] = str(book["_id"])
    
    # Calculate cover_url
    if book.get("cover_path"):
        cover_path_normalized = book["cover_path"].replace("\\", "/")
        if cover_path_normalized.startswith("uploads/"):
            cover_path_relative = cover_path_normalized[len("uploads/"):]
        else:
            cover_path_relative = cover_path_normalized
        book["cover_url"] = f"http://localhost:5000/uploads/{cover_path_relative}"
    else:
        book["cover_url"] = ""

    # Calculate file_url
    if book.get("file_path"):
        file_path_normalized = book["file_path"].replace("\\", "/")
        if file_path_normalized.startswith("uploads/"):
            file_path_relative = file_path_normalized[len("uploads/"):]
        else:
            file_path_relative = file_path_normalized
        book["file_url"] = f"http://localhost:5000/uploads/{file_path_relative}"
    else:
        book["file_url"] = ""

    # Check is_new
    is_new = False
    if "uploaded_at" in book:
        uploaded_at = book["uploaded_at"]
        if isinstance(uploaded_at, datetime.datetime):
            is_new = (datetime.datetime.utcnow() - uploaded_at).days < 7
            book["uploaded_at"] = uploaded_at.isoformat()
    book["is_new"] = is_new

    return book

def format_profile(user):
    purchased_book_ids = user.get("purchased_books", [])
    purchased_books = []
    for bid in purchased_book_ids:
        try:
            b = books_collection.find_one({"_id": ObjectId(bid)})
            if b:
                purchased_books.append(b.get("title"))
        except Exception:
            pass

    rented_book_infos = user.get("rented_books", [])
    rented_books = []
    for rinfo in rented_book_infos:
        bid = rinfo if isinstance(rinfo, str) else rinfo.get("book_id")
        try:
            b = books_collection.find_one({"_id": ObjectId(bid)})
            if b:
                expiry_str = ""
                if isinstance(rinfo, dict) and rinfo.get("expiry"):
                    expiry_str = f" (Expires: {rinfo.get('expiry')[:10]})"
                rented_books.append(f"{b.get('title')}{expiry_str}")
        except Exception:
            pass

    profile_picture = user.get("profile_picture", "")
    if profile_picture and not profile_picture.startswith("http"):
        profile_picture = f"http://localhost:5000{profile_picture}"

    return {
        "name": user.get("username") or user.get("name", ""),
        "email": user.get("email", ""),
        "profilePicture": profile_picture,
        "favoriteAuthors": user.get("favorite_authors", []),
        "purchasedBooks": purchased_books,
        "rentedBooks": rented_books,
        "preferredLanguage": user.get("preferred_language", ""),
        "preferredGenre": user.get("preferred_genre", ""),
        "transactions": user.get("transactions", []),
        "penName": user.get("penName", "")
    }

# ===== User Routes =====
@app.route('/register', methods=['POST'])
def register_user():
    data = request.get_json()
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")

    if not username or not email or not password:
        return jsonify({"error": "Missing required fields"}), 400

    if users_collection.find_one({"email": email}):
        return jsonify({"error": "Email already registered"}), 409

    hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())

    users_collection.insert_one({
        "username": username,
        "email": email,
        "password": hashed_password
    })

    return jsonify({"message": "User registered successfully"}), 200

@app.route('/login', methods=['POST'])
def login_user():
    data = request.get_json()
    email = data.get("email")
    password = data.get("password")

    user = users_collection.find_one({"email": email})

    if user and bcrypt.checkpw(password.encode("utf-8"), user["password"]):
        token = jwt.encode({
            "email": email,
            "role": "user",
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        }, app.config["SECRET_KEY"], algorithm="HS256")

        return jsonify({"token": token}), 200

    return jsonify({"error": "Invalid email or password"}), 401

# ===== Author Routes =====
@app.route("/api/authors/register", methods=["POST"])
def register_author():
    data = request.json
    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    if not all([name, email, password]):
        return jsonify({"error": "All fields are required."}), 400

    if authors_collection.find_one({"email": email}):
        return jsonify({"error": "Email already registered."}), 409

    hashed_pw = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())

    authors_collection.insert_one({
        "name": name,
        "email": email,
        "password": hashed_pw,
        "created_at": datetime.datetime.utcnow()
    })

    return jsonify({"message": "Author registered successfully."}), 201

@app.route("/api/authors/login", methods=["POST"])
def login_author():
    data = request.json
    email = data.get("email")
    password = data.get("password")

    author = authors_collection.find_one({"email": email})
    if not author:
        return jsonify({"message": "Invalid email or password."}), 401

    if not bcrypt.checkpw(password.encode("utf-8"), author["password"]):
        return jsonify({"message": "Invalid email or password."}), 401

    token = jwt.encode({
        "author_id": str(author["_id"]),
        "email": author["email"],
        "role": "author",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, app.config["SECRET_KEY"], algorithm="HS256")

    return jsonify({"token": token}), 200

# ===== Reset Password Memory Database (Mock) =====
reset_codes = {}

# ===== Send Reset Email Helper =====
def send_reset_email(subject, html_body, to_email):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    smtp_server = os.environ.get("SMTP_SERVER")
    smtp_port = os.environ.get("SMTP_PORT")
    smtp_username = os.environ.get("SMTP_USERNAME")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    smtp_sender = os.environ.get("SMTP_SENDER")

    # If any credential field is empty or dummy, bypass actual dispatch
    if not all([smtp_server, smtp_port, smtp_username, smtp_password, smtp_sender]) or "your-email@gmail.com" in [smtp_username, smtp_sender]:
        print("WARNING: SMTP credentials not fully configured in .env. Skipping actual mail dispatch.")
        print(f"DIAGNOSTIC - OTP Email would be sent to: {to_email}")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = smtp_sender
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(html_body, 'html'))

        # Setup server connection dynamically depending on port
        port = int(smtp_port)
        if port == 465:
            server = smtplib.SMTP_SSL(smtp_server, port)
        else:
            server = smtplib.SMTP(smtp_server, port)
            server.starttls()
        server.login(smtp_username, smtp_password)
        server.sendmail(smtp_sender, to_email, msg.as_string())
        server.quit()
        print(f"Email sent successfully to {to_email}")
        return True
    except Exception as e:
        print(f"ERROR sending email to {to_email}: {e}")
        return False

# ===== Forgot Password Route =====
@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    import random
    data = request.get_json()
    email = data.get("email", "").strip()
    role = data.get("role", "user").strip().lower()

    if not email:
        return jsonify({"error": "Email is required"}), 400

    if role == "author":
        account = authors_collection.find_one({"email": email})
    else:
        account = users_collection.find_one({"email": email})

    if not account:
        return jsonify({"error": f"No account found with this email as {role}"}), 404

    # Generate 6-digit mock OTP
    otp = str(random.randint(100000, 999999))
    
    reset_codes[email] = {
        "otp": otp,
        "expiry": datetime.datetime.utcnow() + datetime.timedelta(minutes=10),
        "role": role
    }

    # Format recovery email template
    subject = "E-Library Password Recovery OTP"
    html_body = f"""
    <html>
    <head>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Lora:ital@0;1&display=swap');
        </style>
    </head>
    <body style="font-family: 'Lora', serif; background-color: #fdf9ef; color: #2c1e15; padding: 25px; border: 4px solid #5c381f; border-radius: 4px; max-width: 500px; margin: 20px auto; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
        <h2 style="font-family: 'Cinzel', serif; border-bottom: 2px double #c59b6d; padding-bottom: 12px; text-align: center; color: #2c1e15; margin-top: 0;">E-LIBRARY</h2>
        <p style="font-size: 15px; line-height: 1.6;">Dear Reader/Author,</p>
        <p style="font-size: 15px; line-height: 1.6;">We received a request to recover your password. Please use the following One-Time Password (OTP) to reset your account credentials:</p>
        
        <div style="background-color: #f5ecce; border: 1.5px dashed #9a7040; padding: 18px; font-size: 26px; font-weight: bold; text-align: center; letter-spacing: 6px; margin: 24px 0; color: #5c381f; border-radius: 2px;">
            {otp}
        </div>
        
        <p style="font-size: 13px; color: #7a5028; font-style: italic; line-height: 1.5;">Note: This OTP code is valid for 10 minutes. If you did not request this recovery code, you can safely ignore this email.</p>
        <br/>
        <p style="border-top: 1px dashed rgba(92, 56, 31, 0.2); padding-top: 18px; font-size: 12px; color: #8a6535; text-align: center; margin-bottom: 0; font-family: 'Cinzel', serif;">E-Library Management System</p>
    </body>
    </html>
    """

    email_sent = send_reset_email(subject, html_body, email)

    return jsonify({
        "message": "OTP processed successfully.",
        "otp": otp,
        "email_sent": email_sent
    }), 200

# ===== Reset Password Route =====
@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json()
    email = data.get("email", "").strip()
    role = data.get("role", "user").strip().lower()
    otp = data.get("otp", "").strip()
    new_password = data.get("newPassword", "").strip()

    if not all([email, otp, new_password]):
        return jsonify({"error": "Missing email, OTP, or new password"}), 400

    record = reset_codes.get(email)
    if not record:
        return jsonify({"error": "No reset request found for this email."}), 400

    if record["role"] != role:
        return jsonify({"error": "Role mismatch for reset token."}), 400

    if record["otp"] != otp:
        return jsonify({"error": "Invalid OTP code."}), 400

    if datetime.datetime.utcnow() > record["expiry"]:
        return jsonify({"error": "OTP has expired. Please request a new one."}), 400

    # Hash new password using bcrypt
    hashed_pw = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt())

    if role == "author":
        authors_collection.update_one({"email": email}, {"$set": {"password": hashed_pw}})
    else:
        users_collection.update_one({"email": email}, {"$set": {"password": hashed_pw}})

    # Evict reset session
    reset_codes.pop(email, None)

    return jsonify({"message": "Password reset successfully!"}), 200

# ===== Upload Book Route =====
@app.route('/upload_book', methods=['POST'])
def upload_book():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Token expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid token"}), 401

    # ── Required fields ──────────────────────────────────────
    title       = request.form.get('title', '').strip()
    description = request.form.get('description', '').strip()
    author      = request.form.get('author', '').strip()
    price       = request.form.get('price', '0').strip()
    file        = request.files.get('file')
    cover       = request.files.get('cover')

    if not all([title, description, author, file]):
        return jsonify({"error": "Missing required fields (title, description, author, file)"}), 400

    # Fetch the official author document from DB to verify identity
    author_email = decoded.get("email")
    author_doc = authors_collection.find_one({"email": author_email})
    if not author_doc:
        return jsonify({"error": "Only registered authors can upload books."}), 403

    official_name = author_doc.get("name", "").strip()
    pen_name = author_doc.get("penName", "").strip()

    # Enforce that the provided author name must be either the official name or the pen name
    allowed_names = [official_name.lower()]
    if pen_name:
        allowed_names.append(pen_name.lower())

    if author.lower() not in allowed_names:
        return jsonify({
            "error": f"Ownership mismatch: You can only upload books under your registered name '{official_name}'" + 
                     (f" or pen name '{pen_name}'." if pen_name else ".")
        }), 403

    # Check duplicate check: prevents publishing an existing title/author pair
    existing_book = books_collection.find_one({
        "title": {"$regex": f"^{title}$", "$options": "i"},
        "author": {"$regex": f"^{author}$", "$options": "i"}
    })
    if existing_book:
        return jsonify({"error": f"A book titled '{title}' by '{author}' is already published in the library."}), 409

    # ── Optional / extended metadata ────────────────────────
    genre      = request.form.get('genre', '').strip()
    language   = request.form.get('language', 'English').strip()
    tags       = request.form.get('tags', '').strip()
    publisher  = request.form.get('publisher', '').strip()
    isbn       = request.form.get('isbn', '').strip()
    edition    = request.form.get('edition', '').strip()
    pub_year   = request.form.get('pub_year', '').strip()
    pages      = request.form.get('pages', '').strip()
    rent_price = request.form.get('rent_price', '0').strip()
    is_free        = request.form.get('is_free', 'false').lower() == 'true'
    trial_duration = request.form.get('trial_duration', '10').strip()

    # Parse tags into a list
    tag_list = [t.strip() for t in tags.split(',') if t.strip()] if tags else []

    # Save book file
    filename = secure_filename(file.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    # Save cover image (optional)
    cover_path = ""
    if cover and cover.filename:
        covername  = secure_filename(cover.filename)
        cover_path = os.path.join(COVER_FOLDER, covername)
        cover.save(cover_path)

    books_collection.insert_one({
        # Core
        "title":       title,
        "description": description,
        "author":      author,
        "price":       price,
        # Classification
        "genre":       genre,
        "language":    language,
        "tags":        tag_list,
        # Publication
        "publisher":   publisher,
        "isbn":        isbn,
        "edition":     edition,
        "pub_year":    pub_year,
        "pages":       pages,
        # Pricing
        "rent_price":  rent_price,
        "is_free":     is_free,
        "trial_duration": trial_duration,
        # Files & meta
        "file_path":   filepath,
        "cover_path":  cover_path,
        "uploaded_at": datetime.datetime.utcnow(),
        "uploaded_by": decoded.get("email"),
    })

    return jsonify({"message": "Book uploaded successfully"})

# ===== Get Author's Books =====
@app.route('/api/authors/my_books', methods=['GET'])
def get_author_books():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Token expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid token"}), 401

    author_email = decoded.get("email")
    books = list(books_collection.find({"uploaded_by": author_email}))
    formatted_books = [format_book(book) for book in books]
    return jsonify(formatted_books), 200

# ===== Delete Book =====
@app.route('/api/books/<book_id>', methods=['DELETE'])
def delete_book(book_id):
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Token expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid token"}), 401

    author_email = decoded.get("email")
    book = books_collection.find_one({"_id": ObjectId(book_id), "uploaded_by": author_email})
    if not book:
        return jsonify({"error": "Book not found or unauthorized"}), 404

    # Delete the book files from disk
    if book.get("file_path") and os.path.exists(book["file_path"]):
        os.remove(book["file_path"])
    if book.get("cover_path") and os.path.exists(book["cover_path"]):
        os.remove(book["cover_path"])

    books_collection.delete_one({"_id": ObjectId(book_id)})
    return jsonify({"message": "Book deleted successfully"}), 200

# ===== Get All Books =====
@app.route("/get_uploaded_books", methods=["GET"])
def get_uploaded_books():
    books = list(books_collection.find())
    formatted_books = [format_book(book) for book in books]
    return jsonify({"books": formatted_books}), 200

# ===== Get All Authors =====
@app.route("/get_authors", methods=["GET"])
def get_authors():
    authors = sorted(list(set([book.get("author").strip() for book in books_collection.find() if book.get("author")])))
    return jsonify({"authors": authors}), 200

# ===== Search Books =====
@app.route("/search_books", methods=["GET"])
def search_books():
    query = request.args.get("query", "").lower()
    books = list(books_collection.find())
    filtered_books = []
    for book in books:
        if query in book["title"].lower() or query in book["author"].lower():
            filtered_books.append(format_book(book))
    return jsonify({"books": filtered_books}), 200

# ===== Search Authors =====
@app.route("/search_authors", methods=["GET"])
def search_authors():
    query = request.args.get("query", "").lower()
    authors = sorted(list(set([book.get("author").strip() for book in books_collection.find() if book.get("author")])))
    filtered_authors = [author for author in authors if query in author.lower()]
    return jsonify({"authors": filtered_authors}), 200

# ===== Get Book Details =====
@app.route("/get_book_details/<book_id>", methods=["GET"])
def get_book_details(book_id):
    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if book:
        return jsonify({"book": format_book(book)}), 200
    else:
        return jsonify({"error": "Book not found"}), 404

# ===== Get Raw Book Details API for Payment Page =====
@app.route("/api/book/<book_id>", methods=["GET"])
def api_get_book(book_id):
    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if book:
        return jsonify(format_book(book)), 200
    else:
        return jsonify({"error": "Book not found"}), 404

# ===== Get PDF Page Count API =====
@app.route("/api/book/page-count/<book_id>", methods=["GET"])
def get_pdf_page_count(book_id):
    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if not book:
        return jsonify({"error": "Book not found"}), 404
        
    filepath = book.get("file_path")
    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "Book file not found on server"}), 404

    if not filepath.lower().endswith('.pdf'):
        return jsonify({"page_count": 1, "is_pdf": False}), 200

    try:
        import fitz
        doc = fitz.open(filepath)
        count = doc.page_count
        doc.close()
        return jsonify({"page_count": count, "is_pdf": True}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to get page count: {str(e)}"}), 500


# ===== Render PDF Page as PNG API =====
@app.route("/api/book/render-page/<book_id>/<int:page_num>", methods=["GET"])
def render_pdf_page(book_id, page_num):
    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if not book:
        return jsonify({"error": "Book not found"}), 404
        
    filepath = book.get("file_path")
    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "Book file not found on server"}), 404

    if not filepath.lower().endswith('.pdf'):
        # Fallback for text files: send content as JSON
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return jsonify({"content": content, "is_pdf": False}), 200

    try:
        import fitz
        from flask import send_file
        import io

        doc = fitz.open(filepath)
        if page_num < 0 or page_num >= doc.page_count:
            doc.close()
            return jsonify({"error": "Page number out of range"}), 400
            
        page = doc.load_page(page_num)
        zoom = 2.0  # Render at high resolution for reading clarity
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        
        img_data = pix.tobytes("png")
        doc.close()
        
        return send_file(
            io.BytesIO(img_data),
            mimetype='image/png',
            as_attachment=False
        )
    except Exception as e:
        return jsonify({"error": f"Failed to render page: {str(e)}"}), 500


# ===== Get Book Text Content API =====
@app.route("/api/book/content/<book_id>", methods=["GET"])
def get_book_content(book_id):
    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if not book:
        return jsonify({"error": "Book not found"}), 404
        
    filepath = book.get("file_path")
    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "Book file not found on server"}), 404
        
    try:
        content = ""
        # If it is a PDF file, extract text using pdfplumber
        if filepath.lower().endswith('.pdf'):
            try:
                import pdfplumber
                with pdfplumber.open(filepath) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            content += page_text + "\n"
            except Exception as pdf_err:
                print(f"Failed to read PDF via pdfplumber: {pdf_err}")
        
        # Fallback to plain text reading if not a PDF or if PDF extraction was empty
        if not content:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                
        return jsonify({"content": content}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to read book content: {str(e)}"}), 500

# ===== Favorite Authors =====
@app.route("/favorite_authors", methods=["POST"])
def favorite_authors():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401
    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except Exception:
        return jsonify({"error": "Invalid or expired token"}), 401

    email = decoded.get("email")
    data = request.get_json()
    favorite_authors = data.get("favorite_authors", [])
    
    users_collection.update_one(
        {"email": email},
        {"$set": {"favorite_authors": favorite_authors}},
    )
    return jsonify({"message": "Favorites updated successfully"}), 200

# ===== Create Checkout Session (Dummy) =====
@app.route("/api/payment/create-checkout-session", methods=["POST"])
def create_checkout_session():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({"error": "Invalid or expired token"}), 401

    email = decoded.get("email")
    user = users_collection.find_one({"email": email})
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    book_id = data.get("bookId")
    purchase_type = data.get("purchaseType")
    rental_days = data.get("rentalDays")
    amount = data.get("amount")

    if not book_id or not purchase_type or not amount:
        return jsonify({"error": "Missing payment details"}), 400

    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if not book:
        return jsonify({"error": "Book not found"}), 404

    transaction_str = f"Paid {amount} for '{book.get('title')}' ({purchase_type})"
    update_query = {
        "$push": {
            "transactions": transaction_str
        }
    }
    if purchase_type == "permanent":
        update_query["$addToSet"] = {"purchased_books": book_id}
    else:
        # Pull existing rental if any to prevent duplicate array items
        users_collection.update_one(
            {"email": email},
            {"$pull": {"rented_books": {"book_id": book_id}}}
        )
        rent_expiry = (datetime.datetime.utcnow() + datetime.timedelta(days=int(rental_days))).isoformat()
        rental_info = {"book_id": book_id, "expiry": rent_expiry}
        update_query["$push"]["rented_books"] = rental_info

    users_collection.update_one({"email": email}, update_query)

    return jsonify({"checkoutUrl": "/Dashboard"}), 200

# ===== Razorpay Create Order Endpoint =====
@app.route("/api/payment/create-order", methods=["POST"])
def create_order():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({"error": "Invalid or expired token"}), 401

    email = decoded.get("email")
    user = users_collection.find_one({"email": email})
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    book_id = data.get("bookId")
    purchase_type = data.get("purchaseType")
    rental_days = data.get("rentalDays")
    amount = data.get("amount")

    if not book_id or not purchase_type or not amount:
        return jsonify({"error": "Missing payment details"}), 400

    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if not book:
        return jsonify({"error": "Book not found"}), 404

    try:
        # Convert amount (rupees) to paise
        amount_paise = int(round(float(amount) * 100))
        if amount_paise < 100:
            return jsonify({"error": "Minimum transaction amount is 100 paise (₹1.00)"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid amount format"}), 400

    try:
        # Create order in Razorpay
        order_data = {
            "amount": amount_paise,
            "currency": "INR",
            "receipt": f"rcpt_{str(user['_id'])[:8]}_{book_id[:8]}_{int(datetime.datetime.utcnow().timestamp())}",
            "notes": {
                "book_id": book_id,
                "purchase_type": purchase_type,
                "rental_days": str(rental_days) if rental_days else "",
                "user_email": email
            }
        }
        order = razorpay_client.order.create(data=order_data)
        
        return jsonify({
            "order_id": order["id"],
            "amount": order["amount"],
            "currency": order["currency"]
        }), 200
    except Exception as e:
        print(f"Error creating Razorpay order: {e}")
        return jsonify({"error": f"Failed to create payment order: {str(e)}"}), 500


# ===== Razorpay Verify Payment Endpoint =====
@app.route("/api/payment/verify-payment", methods=["POST"])
def verify_payment():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({"error": "Invalid or expired token"}), 401

    email = decoded.get("email")
    user = users_collection.find_one({"email": email})
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json()
    razorpay_order_id = data.get("razorpay_order_id")
    razorpay_payment_id = data.get("razorpay_payment_id")
    razorpay_signature = data.get("razorpay_signature")
    
    # Metadata parameters to finalize the purchase in db
    book_id = data.get("bookId")
    purchase_type = data.get("purchaseType")
    rental_days = data.get("rentalDays")
    amount = data.get("amount") # finalPrice in rupees

    if not razorpay_order_id or not razorpay_payment_id or not razorpay_signature:
        return jsonify({"error": "Missing payment signature details"}), 400
        
    if not book_id or not purchase_type or not amount:
        return jsonify({"error": "Missing purchase details for verification"}), 400

    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if not book:
        return jsonify({"error": "Book not found"}), 404

    # Verify signature
    try:
        razorpay_client.utility.verify_payment_signature({
            'razorpay_order_id': razorpay_order_id,
            'razorpay_payment_id': razorpay_payment_id,
            'razorpay_signature': razorpay_signature
        })
    except razorpay.errors.SignatureVerificationError as e:
        print(f"Signature verification failed for order {razorpay_order_id}: {e}")
        return jsonify({"error": "Payment signature verification failed"}), 400
    except Exception as e:
        print(f"Error validating signature: {e}")
        return jsonify({"error": f"Error during verification: {str(e)}"}), 500

    # Signature is valid. Unlock the book in the DB
    transaction_str = f"Paid {amount} for '{book.get('title')}' ({purchase_type}) - Razorpay ID: {razorpay_payment_id}"
    update_query = {
        "$push": {
            "transactions": transaction_str
        }
    }
    if purchase_type == "permanent":
        update_query["$addToSet"] = {"purchased_books": book_id}
    else:
        # Pull existing rental if any to prevent duplicate array items
        users_collection.update_one(
            {"email": email},
            {"$pull": {"rented_books": {"book_id": book_id}}}
        )
        rent_expiry = (datetime.datetime.utcnow() + datetime.timedelta(days=int(rental_days))).isoformat()
        rental_info = {"book_id": book_id, "expiry": rent_expiry}
        update_query["$push"]["rented_books"] = rental_info

    users_collection.update_one({"email": email}, update_query)

    return jsonify({"message": "Payment verified and book unlocked successfully!"}), 200

# ===== AI Page Analysis Endpoint =====
@app.route("/api/ai/analyze-page", methods=["POST"])
def analyze_page():
    data = request.get_json()
    book_id = data.get("bookId")
    left_page = data.get("leftPageNum", 0)
    right_page = data.get("rightPageNum", 1)

    if not book_id:
        return jsonify({"error": "Missing bookId"}), 400

    book = books_collection.find_one({"_id": ObjectId(book_id)})
    if not book:
        return jsonify({"error": "Book not found"}), 404

    filepath = book.get("file_path")
    if not filepath or not os.path.exists(filepath):
        return jsonify({"error": "Book file not found"}), 404

    text = ""
    
    # 1. Extract PDF pages
    if filepath.lower().endswith('.pdf'):
        try:
            import fitz
            doc = fitz.open(filepath)
            if 0 <= left_page < doc.page_count:
                page_l = doc.load_page(left_page)
                text += page_l.get_text() + "\n"
            if 0 <= right_page < doc.page_count:
                page_r = doc.load_page(right_page)
                text += page_r.get_text() + "\n"
            doc.close()
        except Exception as e:
            print(f"Error extracting PDF text for AI: {e}")
    else:
        # 2. Slice text file
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                full_text = f.read()
            start_idx = left_page * 1000
            end_idx = (right_page + 1) * 1000
            text = full_text[start_idx:end_idx]
        except Exception as e:
            print(f"Error reading text file for AI: {e}")

    text = text.strip()
    if not text:
        return jsonify({
            "insights": "Please turn to a page with content to begin the AI analysis.",
            "quotes": [],
            "suggestion": "Keep reading to discover more insights!"
        }), 200

    # Extract quotes
    lines = [line.strip() for line in text.split("\n") if len(line.strip()) > 20 and not line.strip().startswith("[") and not line.strip().startswith("Page")]
    
    quotes = []
    if len(lines) >= 2:
        quotes = [lines[len(lines)//3], lines[2*len(lines)//3]]
    elif len(lines) == 1:
        quotes = [lines[0]]
    else:
        quotes = ["\"The journey of reading is a pathway to infinite wisdom.\"", "\"Every page turned is a step into a broader world.\""]

    quotes = [q[:120] + "..." if len(q) > 120 else q for q in quotes]
    quotes = [f'"{q.strip(chr(34)).strip(chr(8220)).strip(chr(8221))}"' for q in quotes]

    word_count = len(text.split())
    if word_count > 100:
        insight = f"This page develops key thematic depth with approximately {word_count} words of narrative. The text explores character relations and setting details with descriptive prose."
    else:
        insight = "The current passage presents concise thematic transitions, perfect for reflecting on the core narrative message."

    suggestion = "Based on this section's style, we suggest focusing on descriptive passages and key dialogues to follow the character arc."

    return jsonify({
        "insights": insight,
        "quotes": quotes,
        "suggestion": suggestion
    }), 200

# ===== AI Dashboard Recommendations & Quotes Endpoint =====
@app.route("/api/ai/dashboard-insights", methods=["GET"])
def dashboard_insights():
    token = request.headers.get('Authorization')
    preferred_language = "English"
    preferred_genre = "Fiction"
    user_book_ids = []
    
    if token:
        try:
            decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
            user = users_collection.find_one({"email": decoded.get("email")})
            if user:
                preferred_language = user.get("preferred_language", "English")
                preferred_genre = user.get("preferred_genre", "Fiction")
                # Retrieve purchased and rented books to extract quotes from
                purchased = user.get("purchased_books", [])
                rented = [r.get("book_id") if isinstance(r, dict) else r for r in user.get("rented_books", [])]
                user_book_ids = list(set([bid for bid in (purchased + rented) if bid]))
        except Exception:
            pass

    matching_books = []
    
    # 1. First choice: Select from books user is currently reading/owns
    if user_book_ids:
        try:
            matching_books = list(books_collection.find({
                "_id": {"$in": [ObjectId(bid) for bid in user_book_ids]}
            }))
        except Exception:
            pass

    # 2. Second choice: Fall back to preferences if they haven't bought/rented any books yet
    if not matching_books:
        matching_books = list(books_collection.find({
            "language": {"$regex": f"^{preferred_language}$", "$options": "i"},
            "genre": {"$regex": f"^{preferred_genre}$", "$options": "i"}
        }))

    # 3. Third choice: Fall back to all catalog books
    if not matching_books:
        matching_books = list(books_collection.find())

    if matching_books:
        import random
        selected_book = random.choice(matching_books)
        title = selected_book.get("title")
        author = selected_book.get("author")
        book_id = str(selected_book.get("_id"))
        filepath = selected_book.get("file_path")
        
        extracted_quote = ""
        if filepath and os.path.exists(filepath):
            try:
                if filepath.lower().endswith('.pdf'):
                    import fitz
                    doc = fitz.open(filepath)
                    if doc.page_count > 0:
                        # Pick a random page (skip first/last page if many pages exist to avoid empty cover text)
                        page_num = random.randint(1, doc.page_count - 2) if doc.page_count > 3 else random.randint(0, doc.page_count - 1)
                        page = doc.load_page(page_num)
                        page_text = page.get_text().strip()
                        lines = [line.strip() for line in page_text.split("\n") if len(line.strip()) > 30 and not line.strip().startswith("[")]
                        if lines:
                            extracted_quote = random.choice(lines)
                    doc.close()
                else:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        text_content = f.read()
                    lines = [line.strip() for line in text_content.split("\n") if len(line.strip()) > 30]
                    if lines:
                        extracted_quote = random.choice(lines)
            except Exception as e:
                print(f"Error extracting quote: {e}")

        if not extracted_quote:
            quotes_pool = [
                "Reading is a discount ticket to everywhere.",
                "A book is a dream that you hold in your hand.",
                "Books are a uniquely portable magic.",
                "I have always imagined that Paradise will be a kind of library.",
                "There is no friend as loyal as a book.",
                "Reading is to the mind what exercise is to the body.",
                "Every page turned is a step into a broader world.",
                f"Find wisdom and peace in the pages of '{title}'."
            ]
            extracted_quote = random.choice(quotes_pool)

        # Truncate if too long and wrap in quotes
        if len(extracted_quote) > 130:
            extracted_quote = extracted_quote[:125] + "..."
        quote = f'"{extracted_quote.strip(chr(34)).strip(chr(8220)).strip(chr(8221)).strip()}"'
        
        message = f"Based on your interest in {preferred_genre} books, you should try reading '{title}' by {author}!"
    else:
        title = "The Odyssey"
        author = "Homer"
        book_id = ""
        quote = "\"A room without books is like a body without a soul.\""
        message = "Explore our vast library catalog to find your next great read!"

    return jsonify({
        "bookId": book_id,
        "title": title,
        "author": author,
        "quote": quote,
        "message": message
    }), 200

# ===== Generate Book Summary (AI) =====
@app.route("/gemini-summary", methods=["POST"])
def gemini_summary():
    data = request.get_json()
    title = data.get("title")
    author = data.get("author")
    description = data.get("description", "No description provided.")
    
    # Replace this with actual AI summary generation logic
    summary = f"AI-generated summary for '{title}' by {author}: {description[:100]}..."
    
    return jsonify({"summary": summary}), 200

# ===== Serve Logo =====
@app.route("/get_logo", methods=["GET"])
def get_logo():
    logo_filename = "logo.png"
    logo_url = url_for("get_app_asset", filename=logo_filename, _external=True)
    return jsonify({"logo_url": logo_url})

# ===== User Profile Routes =====
@app.route('/api/user-profile', methods=['GET'])
def get_user_profile():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({"error": "Invalid or expired token"}), 401

    user = users_collection.find_one({"email": decoded.get("email")})
    if not user:
        user = authors_collection.find_one({"email": decoded.get("email")})
        if not user:
            return jsonify({"error": "User not found"}), 404

    return jsonify(format_profile(user)), 200

@app.route('/api/upload-profile-picture', methods=['POST'])
def upload_profile_picture():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({"error": "Invalid or expired token"}), 401

    file = request.files.get('profilePicture')
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    user = users_collection.find_one({"email": decoded.get("email")})
    if user:
        users_collection.update_one(
            {"email": decoded.get("email")},
            {"$set": {"profile_picture": f"/uploads/books/{filename}"}}
        )
    else:
        author = authors_collection.find_one({"email": decoded.get("email")})
        if author:
            authors_collection.update_one(
                {"email": decoded.get("email")},
                {"$set": {"profile_picture": f"/uploads/books/{filename}"}}
            )
        else:
            return jsonify({"error": "User not found"}), 404

    return jsonify({"profilePicture": f"http://localhost:5000/uploads/books/{filename}"}), 200

@app.route('/api/update-user-profile', methods=['POST'])
def update_user_profile():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({"error": "Invalid or expired token"}), 401

    data = request.get_json()
    update_fields_user = {}
    update_fields_author = {}
    if data.get("name"):
        update_fields_user["username"] = data["name"]
        update_fields_author["name"] = data["name"]
    if data.get("preferredLanguage"):
        update_fields_user["preferred_language"] = data["preferredLanguage"]
        update_fields_author["preferred_language"] = data["preferredLanguage"]
    if data.get("preferredGenre"):
        update_fields_user["preferred_genre"] = data["preferredGenre"]
        update_fields_author["preferred_genre"] = data["preferredGenre"]

    user = users_collection.find_one({"email": decoded.get("email")})
    if user:
        if update_fields_user:
            users_collection.update_one(
                {"email": decoded.get("email")},
                {"$set": update_fields_user}
            )
        user = users_collection.find_one({"email": decoded.get("email")})
    else:
        author = authors_collection.find_one({"email": decoded.get("email")})
        if author:
            if update_fields_author:
                authors_collection.update_one(
                    {"email": decoded.get("email")},
                    {"$set": update_fields_author}
                )
            user = authors_collection.find_one({"email": decoded.get("email")})
        else:
            return jsonify({"error": "User not found"}), 404

    return jsonify(format_profile(user)), 200

@app.route('/assets/<path:filename>')
def get_app_asset(filename):
    return send_from_directory(ASSETS_FOLDER, filename)

# ===== Update Author Profile (extended fields) =====
@app.route('/api/update-author-profile', methods=['POST'])
def update_author_profile():
    token = request.headers.get('Authorization')
    if not token:
        return jsonify({"error": "Missing token"}), 401

    try:
        decoded = jwt.decode(token.split(" ")[-1], app.config['SECRET_KEY'], algorithms=['HS256'])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return jsonify({"error": "Invalid or expired token"}), 401

    data = request.get_json()
    email = decoded.get("email")

    update_fields = {}
    for field in ["name", "bio", "penName", "genre", "website", "twitter", "preferredLanguage"]:
        if field in data:
            update_fields[field] = data[field]

    if not update_fields:
        return jsonify({"error": "No fields to update"}), 400

    author = authors_collection.find_one({"email": email})
    if not author:
        return jsonify({"error": "Author not found"}), 404

    authors_collection.update_one({"email": email}, {"$set": update_fields})
    updated = authors_collection.find_one({"email": email})
    return jsonify(format_profile(updated)), 200


# ===== Test Route =====
@app.route('/test-db')
def test_db():
    users = list(users_collection.find())
    authors = list(authors_collection.find())
    return jsonify({
        "user_count": len(users),
        "author_count": len(authors)
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
