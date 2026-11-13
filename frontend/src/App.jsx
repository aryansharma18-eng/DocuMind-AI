
import { useRef, useState } from "react";
import {
  BrainCircuit,
  FileText,
  UploadCloud,
  Send,
  Trash2,
  Sparkles,
  ShieldCheck,
  Menu,
  X,
  LoaderCircle,
} from "lucide-react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function App() {
  const [file, setFile] = useState(null);
  const [documentId, setDocumentId] = useState(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState("");

  const uploadController = useRef(null);
  const chatController = useRef(null);

  const resetDocument = () => {
    uploadController.current?.abort();
    chatController.current?.abort();

    setFile(null);
    setDocumentId(null);
    setMessages([]);
    setQuestion("");
    setError("");
    setUploading(false);
    setThinking(false);
  };

  // Upload PDF to FastAPI
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];

    // Allow selecting the same file again
    e.target.value = "";

    if (!selectedFile) return;

    const isPDF =
      selectedFile.name.toLowerCase().endsWith(".pdf") &&
      (selectedFile.type === "application/pdf" ||
        selectedFile.type === "");

    if (!isPDF) {
      setError("Please select a valid PDF file.");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("Maximum file size is 10 MB.");
      return;
    }

    resetDocument();

    const controller = new AbortController();
    uploadController.current = controller;

    setFile(selectedFile);
    setUploading(true);
    setSidebarOpen(false);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(`${API_URL}/upload`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "PDF upload failed.");
      }

      if (!data.document_id) {
        throw new Error("Document ID was not returned.");
      }

      if (!controller.signal.aborted) {
        setDocumentId(data.document_id);
        setError("");
      }
    } catch (err) {
      if (err.name !== "AbortError" && !controller.signal.aborted) {
        setError(err.message || "Unable to process the PDF.");
        setDocumentId(null);
      }
    } finally {
      if (uploadController.current === controller) {
        setUploading(false);
        uploadController.current = null;
      }
    }
  };

  // Ask Gemini a question using RAG
  const handleSubmit = async (e) => {
    e.preventDefault();

    const userQuestion = question.trim();

    if (!userQuestion || thinking || uploading) return;

    if (!documentId) {
      setError("Please upload and process a PDF first.");
      return;
    }

    const controller = new AbortController();
    chatController.current = controller;

    setError("");
    setQuestion("");
    setThinking(true);

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: userQuestion,
      },
    ]);

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          document_id: documentId,
          question: userQuestion,
        }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to generate answer.");
      }

      if (!controller.signal.aborted) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            sources: data.sources || [],
          },
        ]);
      }
    } catch (err) {
      if (err.name !== "AbortError" && !controller.signal.aborted) {
        setError(err.message || "Unable to connect to the backend.");
        setQuestion(userQuestion);
      }
    } finally {
      if (chatController.current === controller) {
        setThinking(false);
        chatController.current = null;
      }
    }
  };

  const removeFile = () => {
    resetDocument();
  };

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-icon">
              <BrainCircuit size={24} />
            </div>
            <span>
              DocuMind <strong>AI</strong>
            </span>
          </div>

          <button
            className="close-sidebar"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={21} />
          </button>
        </div>

        <div className="sidebar-content">
          <div className="section-label">YOUR DOCUMENT</div>

          <label className="upload-box">
            {uploading ? (
              <LoaderCircle size={30} className="spin" />
            ) : (
              <UploadCloud size={30} />
            )}

            <h3>
              {uploading ? "Processing PDF..." : "Upload your PDF"}
            </h3>

            <p>
              {uploading
                ? "Creating embeddings and preparing your document."
                : "Choose a PDF to start exploring its content."}
            </p>

            <span className="upload-button">
              {uploading ? "Please wait..." : "Choose File"}
            </span>

            <small>PDF only · Max 10 MB</small>

            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              disabled={uploading || thinking}
              hidden
            />
          </label>

          {file && (
            <div className="uploaded-file">
              <div className="file-icon">
                <FileText size={22} />
              </div>

              <div className="file-details">
                <h4 title={file.name}>{file.name}</h4>

                <p>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>

                <span
                  className={`file-status ${
                    documentId ? "ready" : ""
                  }`}
                >
                  {uploading
                    ? "Processing..."
                    : documentId
                    ? "Ready to chat"
                    : "Not processed"}
                </span>
              </div>

              <button
                className="delete-button"
                onClick={removeFile}
                aria-label="Remove PDF"
                title="Remove document"
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}

          <div className="sidebar-info">
            <Sparkles size={19} />

            <div>
              <h4>Powered by RAG</h4>
              <p>
                DocuMind uses LangChain and Gemini to answer
                questions grounded in your documents.
              </p>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <ShieldCheck size={16} />
          <span>Simple. Smart. Document-focused.</span>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={23} />
            </button>

            <div>
              <h2>Document Assistant</h2>
              <p>Ask questions. Discover answers.</p>
            </div>
          </div>

          <div className="topbar-badge">
            <span
              className={`status-dot ${
                documentId ? "active" : ""
              }`}
            />
            {documentId ? "Document Ready" : "No Document"}
          </div>
        </header>

        <div className="chat-container">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-icon">
                <BrainCircuit size={37} strokeWidth={1.6} />
              </div>

              <h1>
                Chat with your <span>documents.</span>
              </h1>

              <p>
                Transform your PDFs into knowledge. Upload a
                document, ask questions, and get AI-powered answers.
              </p>

              <div className="feature-grid">
                <div className="feature-card">
                  <div className="feature-icon purple">
                    <FileText size={21} />
                  </div>
                  <h3>Upload PDFs</h3>
                  <p>
                    Bring your documents into one simple workspace.
                  </p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon blue">
                    <BrainCircuit size={21} />
                  </div>
                  <h3>Ask Anything</h3>
                  <p>
                    Ask natural-language questions about your PDF.
                  </p>
                </div>

                <div className="feature-card">
                  <div className="feature-icon green">
                    <Sparkles size={21} />
                  </div>
                  <h3>Smart Answers</h3>
                  <p>
                    Get relevant answers with document references.
                  </p>
                </div>
              </div>

              <div className="suggestion-area">
                <span>TRY ASKING</span>

                <div className="suggestions">
                  {[
                    "Summarize this document",
                    "What are the key concepts?",
                    "Explain the main topic",
                  ].map((item) => (
                    <button
                      key={item}
                      onClick={() => setQuestion(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="messages" aria-live="polite">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`message ${message.role}`}
                >
                  <div className="message-content">
                    {message.content}
                  </div>

                  {message.role === "assistant" &&
                    message.sources?.length > 0 && (
                      <div className="message-sources">
                        <FileText size={14} />

                        Retrieved pages:{" "}
                        {message.sources.join(", ")}
                      </div>
                    )}
                </div>
              ))}

              {thinking && (
                <div className="message assistant thinking">
                  <LoaderCircle size={17} className="spin" />
                  <span>DocuMind is thinking...</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="chat-bottom">
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}

          <form className="chat-input" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder={
                uploading
                  ? "Processing your document..."
                  : documentId
                  ? "Ask a question about your PDF..."
                  : "Upload a PDF to get started..."
              }
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setError("");
              }}
              disabled={uploading || thinking}
              aria-label="Ask a question"
            />

            <button
              type="submit"
              disabled={
                !documentId ||
                !question.trim() ||
                uploading ||
                thinking
              }
              aria-label="Send question"
            >
              {thinking ? (
                <LoaderCircle size={19} className="spin" />
              ) : (
                <Send size={19} />
              )}
            </button>
          </form>

          <p className="disclaimer">
            DocuMind AI · LangChain-powered RAG Assistant
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;