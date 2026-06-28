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
plagiarism_reports_collection = db["plagiarism_reports"]
copyright_reports_collection = db["copyright_reports"]
user_strikes_collection = db["user_strikes"]
publication_versions_collection = db["publication_versions"]
moderation_queue_collection = db["moderation_queue"]
copyright_declarations_collection = db["copyright_declarations"]
book_chunks_collection = db["book_chunks"]

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

# ===== Text Extraction Helpers =====
def extract_docx_text(filepath):
    import zipfile
    import xml.etree.ElementTree as ET
    try:
        with zipfile.ZipFile(filepath) as docx:
            xml_content = docx.read('word/document.xml')
            root = ET.fromstring(xml_content)
            texts = []
            for elem in root.iter():
                if elem.tag.endswith('t'):
                    if elem.text:
                        texts.append(elem.text)
            return "\n".join(texts)
    except Exception as e:
        print(f"Error parsing DOCX: {e}")
        return ""

def extract_epub_text(filepath):
    import zipfile
    import re
    try:
        texts = []
        with zipfile.ZipFile(filepath) as epub:
            for name in epub.namelist():
                if name.lower().endswith(('.html', '.xhtml', '.xml')):
                    try:
                        content = epub.read(name).decode('utf-8', errors='ignore')
                        clean_text = re.sub(r'<[^>]+>', ' ', content)
                        clean_text = re.sub(r'\s+', ' ', clean_text).strip()
                        if clean_text:
                            texts.append(clean_text)
                    except Exception:
                        pass
        return "\n".join(texts)
    except Exception as e:
        print(f"Error parsing EPUB: {e}")
        return ""

def extract_pdf_text(filepath):
    content = ""
    try:
        import pdfplumber
        with pdfplumber.open(filepath) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    content += page_text + "\n"
    except Exception as e:
        print(f"Failed to extract PDF text: {e}")
    return content

def extract_book_text(filepath):
    if not filepath or not os.path.exists(filepath):
        return ""
    ext = filepath.lower().split('.')[-1]
    if ext == 'pdf':
        return extract_pdf_text(filepath)
    elif ext == 'docx':
        return extract_docx_text(filepath)
    elif ext == 'epub':
        return extract_epub_text(filepath)
    else:
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            print(f"Failed to read file as text: {e}")
            return ""

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

# ===== Digital Fingerprinting & Similarity Helpers =====
def calculate_sha256(filepath):
    import hashlib
    sha256 = hashlib.sha256()
    try:
        with open(filepath, 'rb') as f:
            while True:
                data = f.read(65536)
                if not data:
                    break
                sha256.update(data)
        return sha256.hexdigest()
    except Exception as e:
        print(f"Error calculating SHA256: {e}")
        return ""

def tokenize_and_clean(text):
    import re
    if not text:
        return []
    # Clean text (strip punctuation and lowercase)
    text = re.sub(r'[^\w\s]', ' ', text.lower())
    words = [w for w in text.split() if len(w) > 2]
    # Standard English stop words
    stopwords = {
        'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 
        'for', 'on', 'with', 'at', 'by', 'from', 'this', 'that', 'these', 'those', 'it', 'its',
        'you', 'your', 'he', 'she', 'they', 'we', 'us', 'i', 'my', 'me'
    }
    return [w for w in words if w not in stopwords]

def cosine_similarity_tf(words1, words2):
    from collections import Counter
    import math
    if not words1 or not words2:
        return 0.0
    cnt1 = Counter(words1)
    cnt2 = Counter(words2)
    
    intersection = set(cnt1.keys()) & set(cnt2.keys())
    numerator = sum([cnt1[x] * cnt2[x] for x in intersection])
    
    sum1 = sum([cnt1[x]**2 for x in cnt1.keys()])
    sum2 = sum([cnt2[x]**2 for x in cnt2.keys()])
    denominator = math.sqrt(sum1) * math.sqrt(sum2)
    
    if not denominator:
        return 0.0
    return float(numerator) / denominator

def check_plagiarism_local(text1, text2):
    words1 = tokenize_and_clean(text1)
    words2 = tokenize_and_clean(text2)
    
    # Calculate overall word overlap (semantic proxy)
    overall_similarity = cosine_similarity_tf(words1, words2)
    
    # Calculate paragraph level alignments
    paragraphs1 = [p.strip() for p in text1.split('\n') if len(p.strip()) > 50]
    paragraphs2 = [p.strip() for p in text2.split('\n') if len(p.strip()) > 50]
    
    matching_paragraphs = []
    exact_matches_count = 0
    
    if paragraphs1 and paragraphs2:
        for p1 in paragraphs1:
            p1_words = tokenize_and_clean(p1)
            if not p1_words:
                continue
            best_score = 0.0
            best_match_text = ""
            
            for p2 in paragraphs2:
                p2_words = tokenize_and_clean(p2)
                if not p2_words:
                    continue
                score = cosine_similarity_tf(p1_words, p2_words)
                if score > best_score:
                    best_score = score
                    best_match_text = p2
                    
            if best_score > 0.70:
                matching_paragraphs.append({
                    "source_section": p1,
                    "match_section": best_match_text,
                    "similarity": round(best_score * 100, 2)
                })
                if best_score > 0.95:
                    exact_matches_count += 1
                    
    total_p = len(paragraphs1) if paragraphs1 else 1
    paragraph_similarity = len(matching_paragraphs) / total_p
    
    return {
        "overall_similarity": round(overall_similarity * 100, 2),
        "paragraph_similarity": round(paragraph_similarity * 100, 2),
        "exact_matches_count": exact_matches_count,
        "matching_sections": matching_paragraphs[:10]  # Cap reports to top 10 matches
    }

# ===== AI Semantic Search & Chunking Helpers =====
class LazySentenceTransformer:
    def __init__(self, model_name="all-MiniLM-L6-v2"):
        self.model_name = model_name
        self._model = None

    @property
    def model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            print(f"Loading SentenceTransformer model '{self.model_name}'...")
            self._model = SentenceTransformer(self.model_name)
            print("Model loaded successfully.")
        return self._model

    def encode(self, sentences):
        return self.model.encode(sentences)

class LazyFAISSIndex:
    def __init__(self, dimension=384, index_file="uploads/faiss_index.bin", mapping_file="uploads/faiss_mapping.json"):
        self.dimension = dimension
        self.index_file = index_file
        self.mapping_file = mapping_file
        self._index = None
        self._mapping = []
        self._loaded = False

    def _ensure_loaded(self):
        if self._loaded:
            return
        import os
        import json
        try:
            import faiss
            if os.path.exists(self.index_file) and os.path.exists(self.mapping_file):
                self._index = faiss.read_index(self.index_file)
                with open(self.mapping_file, "r") as f:
                    self._mapping = json.load(f)
                print("Lazy FAISS index loaded with", self._index.ntotal, "vectors.")
            else:
                self._index = faiss.IndexFlatIP(self.dimension)
                self._mapping = []
                print("Lazy FAISS index created.")
        except Exception as e:
            import faiss
            print("Error initializing FAISS index:", e)
            self._index = faiss.IndexFlatIP(self.dimension)
            self._mapping = []
        self._loaded = True

    @property
    def index(self):
        self._ensure_loaded()
        return self._index

    @property
    def mapping(self):
        self._ensure_loaded()
        return self._mapping

    def save(self):
        self._ensure_loaded()
        if self._index is None:
            return
        import faiss
        import json
        try:
            faiss.write_index(self._index, self.index_file)
            with open(self.mapping_file, "w") as f:
                json.dump(self._mapping, f)
        except Exception as e:
            print("Error saving FAISS index:", e)

    def add_vector(self, vector, book_id, chunk_number):
        self._ensure_loaded()
        if self._index is None:
            return
        import numpy as np
        import faiss
        vec_np = np.array([vector], dtype="float32")
        faiss.normalize_L2(vec_np)
        self._index.add(vec_np)
        self._mapping.append({"book_id": str(book_id), "chunk_number": chunk_number})
        self.save()

    def search(self, vector, k=10):
        self._ensure_loaded()
        if self._index is None or self._index.ntotal == 0:
            return []
        import numpy as np
        import faiss
        vec_np = np.array([vector], dtype="float32")
        faiss.normalize_L2(vec_np)
        distances, indices = self._index.search(vec_np, k)
        
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx < 0 or idx >= len(self._mapping):
                continue
            map_item = self._mapping[idx]
            results.append({
                "book_id": map_item["book_id"],
                "chunk_number": map_item["chunk_number"],
                "similarity": float(dist)
            })
        return results

    def rebuild_index(self):
        self._loaded = False
        self._ensure_loaded()
        import faiss
        self._index = faiss.IndexFlatIP(self.dimension)
        self._mapping = []
        
        chunks = list(book_chunks_collection.find())
        if not chunks:
            self.save()
            return
            
        vectors = []
        for chunk in chunks:
            vec = chunk.get("embedding_vector")
            if vec:
                vectors.append(vec)
                self._mapping.append({
                    "book_id": chunk["book_id"],
                    "chunk_number": chunk["chunk_number"]
                })
        
        if vectors:
            import numpy as np
            vec_np = np.array(vectors, dtype="float32")
            faiss.normalize_L2(vec_np)
            self._index.add(vec_np)
            
        self.save()
        print("Lazy FAISS index rebuilt with", self._index.ntotal, "vectors.")

def split_text_into_chunks(text, chunk_size=500, overlap=100):
    words = text.split()
    if not words:
        return []
    chunks = []
    step = chunk_size - overlap
    for i in range(0, len(words), step):
        chunk_words = words[i : i + chunk_size]
        chunks.append(" ".join(chunk_words))
        if i + chunk_size >= len(words):
            break
    return chunks

# Instantiate lazy managers
embedding_manager = LazySentenceTransformer("all-MiniLM-L6-v2")
vector_index = LazyFAISSIndex(dimension=384)

def warm_up_vector_index():
    import threading
    def perform_warmup():
        print("Warming up FAISS vector index...")
        try:
            # Locate all books with published or auto-published status
            published_books = list(books_collection.find({
                "status": {"$in": ["published", "pending_review", "copyright_review"]}
            }))
            
            for book in published_books:
                book_id = str(book["_id"])
                # Check if it has chunks cached in collection
                count = book_chunks_collection.count_documents({"book_id": book_id})
                if count == 0:
                    filepath = book.get("file_path")
                    if filepath and os.path.exists(filepath):
                        print(f"Back-populating semantic embeddings for legacy book '{book.get('title')}'...")
                        text = extract_book_text(filepath)
                        if text and text.strip():
                            chunks = split_text_into_chunks(text, chunk_size=500, overlap=100)
                            for num, chunk_txt in enumerate(chunks):
                                emb = embedding_manager.encode(chunk_txt).tolist()
                                book_chunks_collection.insert_one({
                                    "book_id": book_id,
                                    "chunk_number": num,
                                    "text": chunk_txt,
                                    "embedding_vector": emb
                                })
                            books_collection.update_one({"_id": book["_id"]}, {"$set": {
                                "embedding_model": "all-MiniLM-L6-v2",
                                "embedding_generated_at": datetime.datetime.utcnow(),
                                "chunk_count": len(chunks)
                            }})
            
            # Rebuild vector index from all chunks
            vector_index.rebuild_index()
        except Exception as e:
            print("Error during warmup indexing back-population:", e)
            
    threading.Thread(target=perform_warmup, daemon=True).start()

# ===== User Strike Helper =====
def issue_user_strike(user_email, reason):
    # Find current strikes count
    strike_doc = user_strikes_collection.find_one({"email": user_email})
    if not strike_doc:
        strikes = 0
        history = []
    else:
        strikes = strike_doc.get("strikes", 0)
        history = strike_doc.get("history", [])
        
    strikes += 1
    history.append({
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "reason": reason,
        "strike_number": strikes
    })
    
    status = "active"
    if strikes == 1:
        action = "Warning Issued"
    elif strikes == 2:
        action = "Temporary Publishing Restriction (48 Hours)"
    elif strikes == 3:
        action = "Account Suspended"
    else:
        action = "Permanently Banned"
        status = "suspended"
        
    user_strikes_collection.update_one(
        {"email": user_email},
        {"$set": {
            "strikes": strikes,
            "history": history,
            "action_taken": action,
            "status": status
        }},
        upsert=True
    )

# ===== Asynchronous Plagiarism Background Scan Task =====
def run_plagiarism_scan(book_id):
    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
        if not book:
            print(f"Book {book_id} not found for scanning.")
            return
            
        filepath = book.get("file_path")
        if not filepath or not os.path.exists(filepath):
            books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "published"}})
            return
            
        # 1. SHA-256 Exact Duplicate Check
        file_hash = calculate_sha256(filepath)
        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"sha256_hash": file_hash}})
        
        duplicate_book = books_collection.find_one({
            "sha256_hash": file_hash,
            "_id": {"$ne": ObjectId(book_id)},
            "status": {"$in": ["published", "pending_review", "copyright_review"]}
        })
        
        if duplicate_book:
            books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "rejected"}})
            plagiarism_reports_collection.insert_one({
                "book_id": str(book_id),
                "similarity_score": 100.0,
                "risk_level": "HIGH",
                "matched_book_id": str(duplicate_book["_id"]),
                "matched_title": duplicate_book.get("title"),
                "matching_sections": [{"source_section": "Entire File Match", "match_section": "Entire File Match", "similarity": 100.0}],
                "exact_matches_count": 1,
                "ai_explanation": f"File is an exact binary duplicate (SHA-256 match) of existing book '{duplicate_book.get('title')}' uploaded by another author.",
                "recommended_action": "auto_reject",
                "scanned_at": datetime.datetime.utcnow()
            })
            uploader_email = book.get("uploaded_by")
            issue_user_strike(uploader_email, f"Attempted to upload exact duplicate of '{duplicate_book.get('title')}'")
            return
            
        # 2. Extract and Split text into chunks
        text1 = extract_book_text(filepath)
        if not text1 or not text1.strip():
            books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "published"}})
            return
            
        # Store clean fingerprint
        cleaned_words = tokenize_and_clean(text1)
        fingerprint = " ".join(cleaned_words[:100])
        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"text_fingerprint": fingerprint}})
        
        chunks1 = split_text_into_chunks(text1, chunk_size=500, overlap=100)
        if not chunks1:
            books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "published"}})
            return
            
        # Generate embeddings for each chunk (if not already cached)
        embeddings1 = []
        cached_chunks = list(book_chunks_collection.find({"book_id": str(book_id)}))
        if len(cached_chunks) == len(chunks1):
            cached_chunks.sort(key=lambda x: x["chunk_number"])
            embeddings1 = [c["embedding_vector"] for c in cached_chunks]
        else:
            book_chunks_collection.delete_many({"book_id": str(book_id)})
            
            # Generate and cache embeddings
            embeddings1 = []
            for num, chunk_txt in enumerate(chunks1):
                emb = embedding_manager.encode(chunk_txt).tolist()
                embeddings1.append(emb)
                book_chunks_collection.insert_one({
                    "book_id": str(book_id),
                    "chunk_number": num,
                    "text": chunk_txt,
                    "embedding_vector": emb
                })
                
        # Update book meta
        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {
            "embedding_model": "all-MiniLM-L6-v2",
            "embedding_generated_at": datetime.datetime.utcnow(),
            "chunk_count": len(chunks1)
        }})
        
        # 3. Vector Database search (Find candidates in FAISS)
        candidate_chunk_scores = {}
        for chunk_emb in embeddings1:
            matches = vector_index.search(chunk_emb, k=10)
            for m in matches:
                bid = m["book_id"]
                sim = m["similarity"]
                if bid not in candidate_chunk_scores:
                    candidate_chunk_scores[bid] = []
                candidate_chunk_scores[bid].append(sim)
                
        # Filter candidate scores (exclude self, and check they exist and are published/reviewed)
        valid_candidates = {}
        for bid, sims in candidate_chunk_scores.items():
            if bid == str(book_id):
                continue
            cand_book = books_collection.find_one({"_id": ObjectId(bid)})
            if not cand_book or cand_book.get("status") not in ["published", "pending_review", "copyright_review"]:
                continue
            max_sim = max(sims) if sims else 0.0
            valid_candidates[bid] = max_sim * 100.0
            
        # Get Top 10 nearest matching candidates
        top_candidates = sorted(valid_candidates.items(), key=lambda x: x[1], reverse=True)[:10]
        
        highest_similarity = 0.0
        highest_match_book = None
        matching_report = None
        
        # 4. Detailed comparison on Top 10 candidates
        for bid, initial_score in top_candidates:
            cand_book = books_collection.find_one({"_id": ObjectId(bid)})
            if not cand_book:
                continue
            text2 = extract_book_text(cand_book.get("file_path"))
            if not text2:
                continue
                
            report = check_plagiarism_local(text1, text2)
            
            # Combine semantic similarity, text similarity, and paragraph similarity
            text_sim = report["overall_similarity"]
            paragraph_sim = report["paragraph_similarity"]
            combined_similarity = max(initial_score, text_sim, paragraph_sim)
            
            if combined_similarity > highest_similarity:
                highest_similarity = combined_similarity
                highest_match_book = cand_book
                matching_report = report
                
        # 5. Apply updated AI Decision Rules
        # 0-25% -> Published / Low Risk
        # 26-50% -> Published / Low Risk (store report)
        # 51-75% -> Pending review / Medium Risk
        # 76-100% -> Copyright review / High Risk
        status = "published"
        risk_level = "LOW"
        action = "publish"
        explanation = "The document similarity is low. Auto-published."
        
        if highest_similarity > 75.0:
            status = "copyright_review"
            risk_level = "HIGH"
            action = "copyright_review"
            explanation = f"Critical semantic overlap of {highest_similarity:.1f}% against '{highest_match_book.get('title')}'. Moved to Copyright Review queue."
        elif highest_similarity > 50.0:
            status = "pending_review"
            risk_level = "MEDIUM"
            action = "pending_review"
            explanation = f"Moderate semantic overlap of {highest_similarity:.1f}% against '{highest_match_book.get('title')}'. Moved to Moderator Review queue."
        elif highest_similarity > 25.0:
            status = "published"
            risk_level = "LOW"
            action = "publish"
            explanation = f"Low semantic overlap of {highest_similarity:.1f}% against '{highest_match_book.get('title')}'. Published."
            
        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": status}})
        
        heatmap_data = []
        if highest_match_book and matching_report:
            heatmap_data = [[round(highest_similarity * (0.8 if i!=j else 1.0), 2) for j in range(5)] for i in range(5)]
            
        plagiarism_reports_collection.insert_one({
            "book_id": str(book_id),
            "similarity_score": round(highest_similarity, 2),
            "risk_level": risk_level,
            "matched_book_id": str(highest_match_book["_id"]) if highest_match_book else None,
            "matched_title": highest_match_book.get("title") if highest_match_book else None,
            "matching_sections": matching_report["matching_sections"] if matching_report else [],
            "exact_matches_count": matching_report["exact_matches_count"] if matching_report else 0,
            "ai_explanation": explanation,
            "recommended_action": action,
            "heatmap_data": heatmap_data,
            "scanned_at": datetime.datetime.utcnow()
        })
        
        if status in ["pending_review", "copyright_review"]:
            moderation_queue_collection.insert_one({
                "book_id": str(book_id),
                "title": book.get("title"),
                "author": book.get("author"),
                "uploader": book.get("uploaded_by"),
                "similarity_score": round(highest_similarity, 2),
                "risk_level": risk_level,
                "matched_book_title": highest_match_book.get("title") if highest_match_book else None,
                "reason": explanation,
                "status": "pending",
                "queue_type": "plagiarism",
                "created_at": datetime.datetime.utcnow()
            })
            
        # Incremental indexing: add immediately to FAISS index if published
        if status == "published":
            print(f"Indexing published book {book_id} chunks in FAISS...")
            for num, emb in enumerate(embeddings1):
                vector_index.add_vector(emb, book_id, num)
                
    except Exception as e:
        print(f"Error in plagiarism scan thread for book {book_id}: {e}")
        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "published"}})

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

    # Check if uploader is suspended/banned due to copyright strikes
    strike_doc = user_strikes_collection.find_one({"email": author_email})
    if strike_doc and strike_doc.get("status") == "suspended":
        return jsonify({"error": "Your account is currently suspended due to copyright violations."}), 403

    # Verify Copyright Declaration
    declaration_accepted = request.form.get("declaration_accepted", "false").lower() == "true"
    if not declaration_accepted:
        return jsonify({"error": "You must accept the Copyright Declaration before publishing."}), 400

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

    # Record Copyright Declaration acceptance
    copyright_declarations_collection.insert_one({
        "user_id": str(author_doc["_id"]),
        "email": author_email,
        "accepted": True,
        "timestamp": datetime.datetime.utcnow()
    })

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

    res = books_collection.insert_one({
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
        "uploaded_by": author_email,
        "status":      "scanning"
    })

    # Trigger background Plagiarism & Fingerprint Scanning
    import threading
    scan_thread = threading.Thread(target=run_plagiarism_scan, args=(str(res.inserted_id),))
    scan_thread.daemon = True
    scan_thread.start()

    return jsonify({"message": "Book uploaded successfully! Scanning for plagiarism in progress.", "bookId": str(res.inserted_id)})

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
    book_chunks_collection.delete_many({"book_id": book_id})
    vector_index.rebuild_index()
    return jsonify({"message": "Book deleted successfully"}), 200

# ===== Edit Book Route (Version Controlled) =====
@app.route('/api/books/edit/<book_id>', methods=['POST'])
def edit_book(book_id):
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
    
    # Check suspension
    strike_doc = user_strikes_collection.find_one({"email": author_email})
    if strike_doc and strike_doc.get("status") == "suspended":
        return jsonify({"error": "Your account is currently suspended due to copyright violations."}), 403

    # Check declaration
    declaration_accepted = request.form.get("declaration_accepted", "false").lower() == "true"
    if not declaration_accepted:
        return jsonify({"error": "You must accept the Copyright Declaration before publishing edits."}), 400

    # Retrieve existing book
    book = books_collection.find_one({"_id": ObjectId(book_id), "uploaded_by": author_email})
    if not book:
        return jsonify({"error": "Book not found or unauthorized"}), 404

    title = request.form.get('title', '').strip()
    description = request.form.get('description', '').strip()
    author = request.form.get('author', '').strip()
    price = request.form.get('price', '0').strip()
    file = request.files.get('file')
    cover = request.files.get('cover')

    if not all([title, description, author]):
        return jsonify({"error": "Missing required fields (title, description, author)"}), 400

    # Fetch official author info
    author_doc = authors_collection.find_one({"email": author_email})
    official_name = author_doc.get("name", "").strip() if author_doc else ""
    pen_name = author_doc.get("penName", "").strip() if author_doc else ""
    
    allowed_names = [official_name.lower()]
    if pen_name:
        allowed_names.append(pen_name.lower())
    if author.lower() not in allowed_names:
        return jsonify({"error": f"Ownership mismatch: You can only publish under your registered name '{official_name}'."}), 403

    # 1. Archive current version to publication_versions
    ver_count = publication_versions_collection.count_documents({"book_id": book_id})
    version_number = ver_count + 1
    
    publication_versions_collection.insert_one({
        "book_id": book_id,
        "version_number": version_number,
        "title": book.get("title"),
        "description": book.get("description"),
        "price": book.get("price"),
        "rent_price": book.get("rent_price"),
        "genre": book.get("genre"),
        "language": book.get("language"),
        "tags": book.get("tags"),
        "file_path": book.get("file_path"),
        "cover_path": book.get("cover_path"),
        "updated_at": datetime.datetime.utcnow(),
        "updated_by": author_email
    })

    # 2. Process file changes
    filepath = book.get("file_path")
    if file and file.filename:
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)

    cover_path = book.get("cover_path")
    if cover and cover.filename:
        covername = secure_filename(cover.filename)
        cover_path = os.path.join(COVER_FOLDER, covername)
        cover.save(cover_path)

    genre = request.form.get('genre', '').strip()
    language = request.form.get('language', 'English').strip()
    tags = request.form.get('tags', '').strip()
    publisher = request.form.get('publisher', '').strip()
    isbn = request.form.get('isbn', '').strip()
    edition = request.form.get('edition', '').strip()
    pub_year = request.form.get('pub_year', '').strip()
    pages = request.form.get('pages', '').strip()
    rent_price = request.form.get('rent_price', '0').strip()
    is_free = request.form.get('is_free', 'false').lower() == 'true'
    trial_duration = request.form.get('trial_duration', '10').strip()

    tag_list = [t.strip() for t in tags.split(',') if t.strip()] if tags else []

    # Update main book entry and set status to scanning
    books_collection.update_one(
        {"_id": ObjectId(book_id)},
        {"$set": {
            "title": title,
            "description": description,
            "author": author,
            "price": price,
            "genre": genre,
            "language": language,
            "tags": tag_list,
            "publisher": publisher,
            "isbn": isbn,
            "edition": edition,
            "pub_year": pub_year,
            "pages": pages,
            "rent_price": rent_price,
            "is_free": is_free,
            "trial_duration": trial_duration,
            "file_path": filepath,
            "cover_path": cover_path,
            "updated_at": datetime.datetime.utcnow(),
            "status": "scanning"
        }}
    )

    # Record Copyright Declaration acceptance
    copyright_declarations_collection.insert_one({
        "user_id": str(author_doc["_id"]) if author_doc else "unknown",
        "email": author_email,
        "accepted": True,
        "timestamp": datetime.datetime.utcnow()
    })

    # Trigger background Plagiarism check
    import threading
    scan_thread = threading.Thread(target=run_plagiarism_scan, args=(book_id,))
    scan_thread.daemon = True
    scan_thread.start()

    return jsonify({"message": "Revision saved. Scanning for plagiarism in progress.", "bookId": book_id}), 200

# ===== Get All Books =====
@app.route("/get_uploaded_books", methods=["GET"])
def get_uploaded_books():
    books = list(books_collection.find({
        "$or": [
            {"status": "published"},
            {"status": {"$exists": False}}
        ]
    }))
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
    authors_collection.update_one({"email": email}, {"$set": update_fields})
    updated = authors_collection.find_one({"email": email})
    return jsonify(format_profile(updated)), 200


# ===== Community Report Route =====
@app.route("/api/books/report", methods=["POST"])
def report_book():
    data = request.get_json()
    book_id = data.get("bookId")
    reason = data.get("reason", "Other")
    comments = data.get("comments", "")
    
    if not book_id:
        return jsonify({"error": "Missing book ID"}), 400
        
    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
        
    if not book:
        return jsonify({"error": "Book not found"}), 404
        
    # Record community report
    copyright_reports_collection.insert_one({
        "book_id": book_id,
        "reason": reason,
        "comments": comments,
        "reported_at": datetime.datetime.utcnow()
    })
    
    # Count total reports
    report_count = copyright_reports_collection.count_documents({"book_id": book_id})
    
    # Auto-moderate if >= 3 reports
    if report_count >= 3:
        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "pending_review"}})
        
        # Add to moderation queue
        exists = moderation_queue_collection.find_one({"book_id": book_id, "queue_type": "report"})
        if not exists:
            moderation_queue_collection.insert_one({
                "book_id": book_id,
                "title": book.get("title"),
                "author": book.get("author"),
                "uploader": book.get("uploaded_by"),
                "reason": f"Community flagged: {report_count} reports. Primary issue: {reason}",
                "status": "pending",
                "queue_type": "report",
                "created_at": datetime.datetime.utcnow()
            })
            
    return jsonify({"message": "Thank you. Your report has been submitted to the moderation team."}), 200


# ===== Moderator Queue Endpoint =====
@app.route("/api/moderator/queue", methods=["GET"])
def get_moderator_queue():
    show_resolved = request.args.get("show_resolved") == "true"
    query = {} if show_resolved else {"status": "pending"}
    queue_items = list(moderation_queue_collection.find(query).sort("created_at", -1))
    for item in queue_items:
        item["_id"] = str(item["_id"])
        item["created_at"] = item["created_at"].isoformat() if isinstance(item["created_at"], datetime.datetime) else str(item["created_at"])
    return jsonify(queue_items), 200


# ===== Moderator Side-by-Side Comparison API =====
@app.route("/api/moderator/compare/<book_id>", methods=["GET"])
def get_moderator_compare(book_id):
    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if not book:
        return jsonify({"error": "Book not found"}), 404
        
    report = plagiarism_reports_collection.find_one({"book_id": book_id})
    
    matched_book = None
    if report and report.get("matched_book_id"):
        matched_book = books_collection.find_one({"_id": ObjectId(report.get("matched_book_id"))})
        
    book_text = extract_book_text(book.get("file_path"))[:4000]
    matched_text = extract_book_text(matched_book.get("file_path"))[:4000] if matched_book else ""
    
    versions = list(publication_versions_collection.find({"book_id": book_id}))
    for v in versions:
        v["_id"] = str(v["_id"])
        v["updated_at"] = v["updated_at"].isoformat() if isinstance(v["updated_at"], datetime.datetime) else str(v["updated_at"])

    q_entry = moderation_queue_collection.find_one({"book_id": book_id})
    q_data = None
    if q_entry:
        q_data = {
            "status": q_entry.get("status"),
            "resolved_by": q_entry.get("resolved_by"),
            "resolved_at": q_entry.get("resolved_at").isoformat() if isinstance(q_entry.get("resolved_at"), datetime.datetime) else str(q_entry.get("resolved_at")),
            "action_taken": q_entry.get("action_taken"),
            "resolution_reason": q_entry.get("resolution_reason")
        }

    return jsonify({
        "book": {
            "id": str(book["_id"]),
            "title": book.get("title"),
            "author": book.get("author"),
            "description": book.get("description"),
            "uploaded_by": book.get("uploaded_by"),
            "status": book.get("status"),
            "text_sample": book_text
        },
        "matched_book": {
            "id": str(matched_book["_id"]),
            "title": matched_book.get("title"),
            "author": matched_book.get("author"),
            "description": matched_book.get("description"),
            "uploaded_by": matched_book.get("uploaded_by"),
            "text_sample": matched_text
        } if matched_book else None,
        "plagiarism_report": {
            "similarity_score": report.get("similarity_score", 0.0) if report else 0.0,
            "risk_level": report.get("risk_level", "LOW") if report else "LOW",
            "matching_sections": report.get("matching_sections", []) if report else [],
            "exact_matches_count": report.get("exact_matches_count", 0) if report else 0,
            "ai_explanation": report.get("ai_explanation", "No similarity report found.") if report else "No similarity report found.",
            "heatmap_data": report.get("heatmap_data", []) if report else []
        },
        "versions": versions,
        "moderation_info": q_data
    }), 200


# ===== Moderator Action Endpoint =====
@app.route("/api/moderator/action", methods=["POST"])
def post_moderator_action():
    data = request.get_json()
    book_id = data.get("bookId")
    action = data.get("action") 
    reason = data.get("reason", "")
    
    if not book_id or not action:
        return jsonify({"error": "Missing bookId or action"}), 400
        
    try:
        book = books_collection.find_one({"_id": ObjectId(book_id)})
    except Exception:
        return jsonify({"error": "Invalid book ID format"}), 400
    if not book:
        return jsonify({"error": "Book not found"}), 404
        
    uploader_email = book.get("uploaded_by")
    
    if action in ["approve", "restore"]:
        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "published"}})
        moderation_queue_collection.update_many({"book_id": book_id}, {"$set": {"status": "resolved"}})
        
    elif action in ["reject", "remove"]:
        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": action + "d"}})
        moderation_queue_collection.update_many({"book_id": book_id}, {"$set": {"status": "resolved"}})
        
        issue_user_strike(uploader_email, f"Moderator action ({action}): {reason or 'Copyright/plagiarism violation'}")
        
    elif action == "warning":
        issue_user_strike(uploader_email, f"Moderator warning: {reason or 'Abuse report warnings issued.'}")
        
    return jsonify({"message": f"Moderator action '{action}' applied successfully."}), 200


# ===== Moderator Strike Overview & Override API =====
@app.route("/api/moderator/strikes/<email>", methods=["GET"])
def get_user_strikes(email):
    strike_doc = user_strikes_collection.find_one({"email": email})
    if not strike_doc:
        return jsonify({"strikes": 0, "status": "active", "history": []}), 200
        
    strike_doc["_id"] = str(strike_doc["_id"])
    return jsonify(strike_doc), 200


@app.route("/api/moderator/strikes/override", methods=["POST"])
def override_user_strikes():
    data = request.get_json()
    email = data.get("email")
    action = data.get("action") 
    
    if not email or not action:
        return jsonify({"error": "Missing email or action"}), 400
        
    if action == "reset":
        user_strikes_collection.update_one(
            {"email": email},
            {"$set": {"strikes": 0, "status": "active", "history": [{"timestamp": datetime.datetime.utcnow().isoformat(), "reason": "Strike override: Reset by administrator", "strike_number": 0}]}},
            upsert=True
        )
    elif action == "suspend":
        user_strikes_collection.update_one(
            {"email": email},
            {"$set": {"status": "suspended", "action_taken": "Account Suspended manually by administrator"}},
            upsert=True
        )
    elif action == "unsuspend":
        user_strikes_collection.update_one(
            {"email": email},
            {"$set": {"status": "active", "strikes": 0, "action_taken": "Restored manually by administrator"}},
            upsert=True
        )
        
    return jsonify({"message": f"User strike status set to '{action}' successfully."}), 200


# ===== Test Route =====
@app.route('/test-db')
def test_db():
    users = list(users_collection.find())
    authors = list(authors_collection.find())
    return jsonify({
        "user_count": len(users),
        "author_count": len(authors)
    })

def run_ai_moderator_loop():
    import time
    from bson import ObjectId
    import datetime
    
    # Wait for server warm up to complete
    time.sleep(15)
    print("AI Moderator Daemon started.")
    
    while True:
        try:
            pending_items = list(moderation_queue_collection.find({"status": "pending"}))
            for item in pending_items:
                book_id = item["book_id"]
                uploader_email = item.get("uploader")
                queue_type = item.get("queue_type")
                
                book = books_collection.find_one({"_id": ObjectId(book_id)})
                if not book:
                    moderation_queue_collection.update_one({"_id": item["_id"]}, {"$set": {"status": "skipped"}})
                    continue
                
                report = plagiarism_reports_collection.find_one({"book_id": book_id})
                similarity_score = report.get("similarity_score", 0.0) if report else 0.0
                risk_level = report.get("risk_level", "LOW") if report else "LOW"
                matched_title = report.get("matched_title") if report else None
                matched_book_id = report.get("matched_book_id") if report else None
                
                ai_action = None
                ai_reason = ""
                
                if queue_type == "plagiarism":
                    if risk_level == "HIGH" or similarity_score > 75.0:
                        ai_action = "reject_strike"
                        ai_reason = f"AI Auto-Moderator: Critical similarity level of {similarity_score}% detected against '{matched_title}'. Upload rejected and copyright warning strike issued."
                    elif risk_level == "MEDIUM" or similarity_score > 50.0:
                        is_own_work = False
                        if matched_book_id:
                            matched_book = books_collection.find_one({"_id": ObjectId(matched_book_id)})
                            if matched_book and matched_book.get("uploaded_by") == uploader_email:
                                is_own_work = True
                                
                        if is_own_work:
                            ai_action = "approve"
                            ai_reason = f"AI Auto-Moderator: Approved. Overlap of {similarity_score}% matches the author's own registered work '{matched_title}'."
                        else:
                            strike_history = user_strikes_collection.find_one({"email": uploader_email})
                            strikes_count = strike_history.get("strikes", 0) if strike_history else 0
                            
                            if strikes_count > 0:
                                ai_action = "reject_strike"
                                ai_reason = f"AI Auto-Moderator: Moderate similarity of {similarity_score}% detected. Uploader has prior copyright strikes; auto-rejected and strike issued."
                            else:
                                ai_action = "warn_reject"
                                ai_reason = f"AI Auto-Moderator: Moderate similarity of {similarity_score}% detected. Rejected with warning."
                    else:
                        ai_action = "approve"
                        ai_reason = "AI Auto-Moderator: Content cleared. Similarity index is within acceptable limits."
                        
                elif queue_type == "report":
                    if similarity_score > 50.0:
                        ai_action = "reject_strike"
                        ai_reason = f"AI Auto-Moderator: Community flagged. Semantic verification confirmed matching overlap of {similarity_score}% against '{matched_title}'."
                    else:
                        ai_action = "approve"
                        ai_reason = f"AI Auto-Moderator: Dismissed flags. Semantic plagiarism checks cleared with {similarity_score}% match score."
                
                if ai_action:
                    print(f"[AI Moderator] Processing book {book_id} -> Action: {ai_action}")
                    
                    if ai_action == "approve":
                        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "published"}})
                        chunks = list(book_chunks_collection.find({"book_id": book_id}))
                        for c in chunks:
                            vector_index.add_vector(c["embedding_vector"], book_id, c["chunk_number"])
                            
                    elif ai_action == "reject_strike":
                        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "rejected"}})
                        issue_user_strike(uploader_email, ai_reason)
                        
                    elif ai_action == "warn_reject":
                        books_collection.update_one({"_id": ObjectId(book_id)}, {"$set": {"status": "rejected"}})
                        strike_doc = user_strikes_collection.find_one({"email": uploader_email})
                        history = strike_doc.get("history", []) if strike_doc else []
                        history.append({
                            "timestamp": datetime.datetime.utcnow().isoformat(),
                            "reason": f"Warning issued: {ai_reason}",
                            "strike_number": len(history) + 1
                        })
                        user_strikes_collection.update_one(
                            {"email": uploader_email},
                            {"$set": {
                                "history": history
                            }},
                            upsert=True
                        )
                    
                    moderation_queue_collection.update_one({"_id": item["_id"]}, {"$set": {
                        "status": "resolved",
                        "resolved_by": "AI Moderator Bot",
                        "resolved_at": datetime.datetime.utcnow(),
                        "action_taken": ai_action,
                        "resolution_reason": ai_reason
                    }})
                    
        except Exception as e:
            print("Error in AI Moderator loop:", e)
            
        time.sleep(10)

if __name__ == "__main__":
    warm_up_vector_index()
    
    import threading
    ai_mod_thread = threading.Thread(target=run_ai_moderator_loop, daemon=True)
    ai_mod_thread.start()
    
    app.run(host="0.0.0.0", port=5000, debug=True)
