
import os
from io import BytesIO

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pypdf import PdfReader

from rag import process_pdf, ask_question


# ==========================================
# ENVIRONMENT CONFIGURATION
# ==========================================

load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL", "").strip().rstrip("/")

MAX_FILE_SIZE = 10 * 1024 * 1024
MAX_PAGES = 40


# ==========================================
# FASTAPI APPLICATION
# ==========================================

app = FastAPI(
    title="DocuMind AI API",
    description="RAG-based PDF Question Answering API using LangChain and Gemini",
    version="1.0.0",
)


# ==========================================
# CORS CONFIGURATION
# ==========================================

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Add the deployed Vercel frontend URL
if FRONTEND_URL and FRONTEND_URL not in allowed_origins:
    allowed_origins.append(FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ==========================================
# PYDANTIC MODELS
# ==========================================

class ChatRequest(BaseModel):
    document_id: str
    question: str = Field(
        min_length=1,
        max_length=2000
    )


# ==========================================
# HOME / HEALTH CHECK
# ==========================================

@app.get("/")
def home():
    return {
        "message": "DocuMind AI Backend is running!",
        "status": "healthy",
        "version": "1.0.0"
    }


# ==========================================
# PDF UPLOAD ENDPOINT
# ==========================================

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):

    # Validate file extension
    if (
        not file.filename
        or not file.filename.lower().endswith(".pdf")
    ):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are allowed."
        )

    # Read file with size limit
    content = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="PDF must be 10 MB or less."
        )

    # Check PDF signature
    if not content.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=400,
            detail="Invalid PDF file."
        )

    try:
        # Validate PDF and page count
        reader = PdfReader(BytesIO(content))

        if reader.is_encrypted:
            raise HTTPException(
                status_code=400,
                detail="Password-protected PDFs are not supported."
            )

        total_pages = len(reader.pages)

        if total_pages == 0:
            raise HTTPException(
                status_code=400,
                detail="The PDF contains no pages."
            )

        if total_pages > MAX_PAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Maximum {MAX_PAGES} pages allowed."
            )

        # Process PDF using LangChain RAG
        result = process_pdf(content)

        return {
            "message": "PDF processed successfully!",
            "filename": file.filename,
            **result,
        }

    except HTTPException:
        raise

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception as error:
        print("PDF processing error:", repr(error))

        raise HTTPException(
            status_code=500,
            detail="PDF processing failed. Please try again."
        )


# ==========================================
# RAG CHAT ENDPOINT
# ==========================================

@app.post("/chat")
def chat(request: ChatRequest):

    question = request.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="Question cannot be empty."
        )

    try:
        result = ask_question(
            document_id=request.document_id,
            question=question,
        )

        return result

    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error)
        )

    except Exception as error:
        print("Chat error:", repr(error))

        raise HTTPException(
            status_code=500,
            detail="Unable to generate answer. Please try again."
        )