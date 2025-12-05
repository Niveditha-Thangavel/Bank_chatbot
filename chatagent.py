from crewai import Agent, Task, Crew, LLM
from crewai.tools import BaseTool
from typing import List, Dict, Any, Optional
import os, json, requests, math, hashlib, tempfile, pathlib, logging

API_KEY = "AIzaSyDdX_fA26leyYXc1imywz4P6fUNOqtxWx8"
ollm = LLM(model='gemini/gemini-2.5-flash', api_key=API_KEY)

# Optional libraries (install as needed)
try:
    from PyPDF2 import PdfReader
except Exception:
    PdfReader = None

try:
    import tiktoken
except Exception:
    tiktoken = None

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None

# qdrant / faiss clients optional
try:
    from qdrant_client import QdrantClient
    from qdrant_client.http import models as qmodels
except Exception:
    QdrantClient = None
    qmodels = None

try:
    import faiss
    import numpy as np
except Exception:
    faiss = None
    np = None

# Logging
logger = logging.getLogger(__name__)

# Helper: simple ID generation for docs
def _doc_id_for(source: Dict[str, Any]) -> str:
    base = source.get("id") or source.get("path") or source.get("url") or source.get("title") or json.dumps(source, sort_keys=True)
    return hashlib.sha1(base.encode()).hexdigest()[:12]

class IngestTool(BaseTool):
    name: str = "Ingest Tool"
    description: str = "Ingest documents from pdf/url/text/docx and return raw text + metadata."

    def _run(self, source: Dict[str, Any]) -> Dict[str, Any]:
        """
        source: {"type":"pdf"|"url"|"text", "path":..., "url":..., "text":..., "meta": {...}}
        returns: {"id":..., "text":..., "meta": {...}}
        """
        stype = source.get("type", "text")
        text = ""
        meta = source.get("meta", {})
        if stype == "pdf":
            if PdfReader is None:
                raise RuntimeError("PyPDF2 not installed; pip install PyPDF2")
            path = source["path"]
            reader = PdfReader(path)
            pages = [p.extract_text() or "" for p in reader.pages]
            text = "\n".join(pages)
            meta.setdefault("source_type", "pdf")
            meta.setdefault("filename", pathlib.Path(path).name)
        elif stype == "url":
            r = requests.get(source["url"], timeout=15)
            # naive HTML -> text; you can use BeautifulSoup in production
            text = r.text
            meta.setdefault("source_type", "url")
            meta.setdefault("url", source["url"])
        elif stype == "text":
            text = source.get("text", "")
            meta.setdefault("source_type", "text")
        else:
            # extend for docx / ocr
            raise ValueError(f"Unsupported ingest type: {stype}")
        doc = {"id": _doc_id_for(source), "text": text, "meta": meta}
        return doc

    # compatibility wrapper used by your sample
    def run(self, *args, **kwargs):
        return self._run(*args, **kwargs)


# ---------- ChunkTool ----------
class ChunkTool(BaseTool):
    name: str = "Chunk Tool"
    description: str = "Token-aware chunking using tiktoken or simple word-split fallback."

    def _run(self, doc: Dict[str, Any], max_tokens: int = 600, overlap: int = 100) -> List[Dict[str, Any]]:
        text = doc.get("text", "")
        if tiktoken is None:
            # fallback - simple word chunking
            words = text.split()
            chunks = []
            i = 0
            while i < len(words):
                chunk_words = words[i:i+max_tokens]
                chunk_text = " ".join(chunk_words)
                chunks.append({
                    "doc_id": doc["id"],
                    "text": chunk_text,
                    "start_word": i,
                    "end_word": i + len(chunk_words),
                    "meta": doc.get("meta", {})
                })
                i += max_tokens - overlap
            return chunks
        else:
            enc = tiktoken.get_encoding("cl100k_base")
            toks = enc.encode(text)
            chunks = []
            i = 0
            while i < len(toks):
                slice_ = toks[i:i+max_tokens]
                chunk_text = enc.decode(slice_)
                chunks.append({
                    "doc_id": doc["id"],
                    "text": chunk_text,
                    "start_token": i,
                    "end_token": i + len(slice_),
                    "meta": doc.get("meta", {})
                })
                i += max_tokens - overlap
            return chunks

    def run(self, *args, **kwargs):
        return self._run(*args, **kwargs)


# ---------- EmbedTool ----------
class EmbedTool(BaseTool):
    name: str = "Embed Tool"
    description: str = "Produce embeddings for a list of texts. Uses SentenceTransformers locally if available. If you want cloud embeddings, implement the TODO."

    # cache simple in-memory (small scale)
    _model = None

    def __init__(self, model_name_local: str = "all-MiniLM-L6-v2", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.model_name_local = model_name_local
        # lazy init model
        if SentenceTransformer is not None:
            try:
                self._model = SentenceTransformer(self.model_name_local)
            except Exception as e:
                logger.warning("SentenceTransformer init failed: %s", e)
                self._model = None

    def _run(self, texts: List[str]) -> List[List[float]]:
        """
        texts: list of strings
        returns: list of vectors (lists of floats)
        """
        # If user wants to use cloud embeddings (Gemini/OpenAI), implement here:
        # TODO: call cloud embeddings API and return vectors
        if self._model is not None:
            vectors = self._model.encode(texts, show_progress_bar=False, convert_to_numpy=False)
            # convert numpy->list if necessary
            return [v.tolist() if hasattr(v, "tolist") else list(v) for v in vectors]
        else:
            # placeholder: return zero vectors (NOT for production)
            dim = 384
            return [[0.0] * dim for _ in texts]

    def run(self, *args, **kwargs):
        return self._run(*args, **kwargs)


# ---------- IndexTool (Qdrant + FAISS fallback) ----------
class IndexTool(BaseTool):
    name: str = "Index Tool"
    description: str = "Index vectors into Qdrant (preferred) or FAISS (local) as a fallback."

    def __init__(self, collection_name: str = "docs", qdrant_url: str = None, qdrant_api_key: str = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.collection_name = collection_name
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", "http://localhost:6333")
        self.qdrant_api_key = qdrant_api_key or os.getenv("QDRANT_API_KEY")
        self._qclient = None
        self._faiss_index = None
        self._faiss_dim = None
        if QdrantClient is not None:
            try:
                self._qclient = QdrantClient(url=self.qdrant_url, api_key=self.qdrant_api_key)
            except Exception:
                self._qclient = None

    def _ensure_qdrant_collection(self, dim: int):
        if self._qclient is None:
            return
        try:
            # create collection if not exists (simple config)
            self._qclient.recreate_collection(
                collection_name=self.collection_name,
                vectors_config=qmodels.VectorParams(size=dim, distance=qmodels.Distance.COSINE),
            )
        except Exception as e:
            logger.warning("Qdrant collection create/recreate error: %s", e)

    def _run(self, vectors: List[List[float]], metadatas: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        vectors: list of vectors
        metadatas: list of payloads (must correspond by index). Each payload should include 'text' and doc_id at minimum.
        returns: insertion summary
        """
        n = len(vectors)
        if n == 0:
            return {"inserted": 0}

        dim = len(vectors[0])
        # Try Qdrant first
        if self._qclient is not None:
            try:
                self._ensure_qdrant_collection(dim)
                points = []
                for i in range(n):
                    pid = metadatas[i].get("id") or f"{metadatas[i].get('doc_id', 'doc')}_{i}"
                    points.append({"id": pid, "vector": vectors[i], "payload": metadatas[i]})
                self._qclient.upsert(collection_name=self.collection_name, points=points)
                return {"inserted": n, "backend": "qdrant"}
            except Exception as e:
                logger.warning("Qdrant upsert failed: %s", e)

        # FAISS fallback (in-memory)
        if faiss is None or np is None:
            raise RuntimeError("No vector DB available (install qdrant-client or faiss & numpy)")

        if self._faiss_index is None:
            self._faiss_dim = dim
            self._faiss_index = faiss.IndexFlatL2(dim)
        else:
            if self._faiss_dim != dim:
                # recreate if dimension changed
                self._faiss_index = faiss.IndexFlatL2(dim)
                self._faiss_dim = dim
        arr = np.array(vectors, dtype="float32")
        self._faiss_index.add(arr)
        # store payloads in temporary location mapping id->payload (simple persistence)
        # NOTE: for production, persist to DB
        if not hasattr(self, "_faiss_payloads"):
            self._faiss_payloads = []
        self._faiss_payloads.extend(metadatas)
        return {"inserted": n, "backend": "faiss", "total_indexed": int(self._faiss_index.ntotal)}

    def run(self, *args, **kwargs):
        return self._run(*args, **kwargs)


# ---------- RetrieveTool ----------
class RetrieveTool(BaseTool):
    name: str = "Retrieve Tool"
    description: str = "Retrieve top-k relevant chunks for a query using Qdrant or FAISS fallback."

    def __init__(self, index_tool: IndexTool, embed_tool: EmbedTool, collection_name: str = "docs", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.index_tool = index_tool
        self.embed_tool = embed_tool
        self.collection_name = collection_name

    def _run(self, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        q_vecs = self.embed_tool._run([query])
        q_vec = q_vecs[0]
        # Qdrant branch
        if self.index_tool._qclient is not None:
            try:
                hits = self.index_tool._qclient.search(collection_name=self.collection_name, query_vector=q_vec, limit=top_k)
                result = []
                for h in hits:
                    payload = h.payload or {}
                    result.append({
                        "text": payload.get("text", payload.get("content", "")),
                        "score": float(h.score),
                        "id": h.id,
                        "meta": payload
                    })
                return result
            except Exception as e:
                logger.warning("Qdrant search error: %s", e)

        # FAISS fallback
        if faiss is None or np is None:
            raise RuntimeError("No retrieval backend available (install qdrant-client or faiss & numpy)")

        if not hasattr(self.index_tool, "_faiss_index") or self.index_tool._faiss_index is None:
            return []

        D, I = self.index_tool._faiss_index.search(np.array([q_vec], dtype="float32"), top_k)
        out = []
        for score, idx in zip(D[0].tolist(), I[0].tolist()):
            try:
                payload = self.index_tool._faiss_payloads[idx]
            except Exception:
                payload = {}
            out.append({
                "text": payload.get("text", ""),
                "score": float(score),
                "id": payload.get("id", str(idx)),
                "meta": payload
            })
        return out

    def run(self, *args, **kwargs):
        return self._run(*args, **kwargs)


# ---------- AssembleTool ----------
class AssembleTool(BaseTool):
    name: str = "Assemble Tool"
    description: str = "Assemble top-k retrieved chunks into a prompt/context for the LLM."

    def _run(self, query: str, retrieved: List[Dict[str, Any]], max_chars: int = 3000) -> Dict[str, Any]:
        chunks = []
        total = 0
        for r in retrieved:
            t = r.get("text", "")
            if total + len(t) > max_chars:
                # include partial slice if possible
                remaining = max_chars - total
                if remaining <= 0:
                    break
                t = t[:remaining]
            chunks.append(f"Source: {r.get('id')}\n{t}")
            total += len(t)
            if total >= max_chars:
                break
        context = "\n\n---\n\n".join(chunks)
        prompt = (
            "SYSTEM: You are an assistant. Use ONLY the context below to answer. "
            "If answer is not present in the context, say 'I don't know'.\n\n"
            f"CONTEXT:\n{context}\n\nUSER QUESTION: {query}\n\nANSWER:"
        )
        return {"prompt": prompt, "context_chunks": chunks}

    def run(self, *args, **kwargs):
        return self._run(*args, **kwargs)


# ---------- GenerateTool ----------
class GenerateTool(BaseTool):
    name: str = "Generate Tool"
    description: str = "Generate final answer using the provided LLM. Uses the 'ollm' provided in your app context."

    def __init__(self, ollm_instance: Any = None, model: str = "gemini/gemini-2.5-flash", temperature: float = 0.0, max_output_tokens: int = 512, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.ollm = ollm_instance  # your LLM object, e.g., ollm = LLM(...)
        self.model = model
        self.temperature = temperature
        self.max_output_tokens = max_output_tokens

    def _run(self, prompt: str) -> Dict[str, Any]:
        if self.ollm is None:
            # fallback: echo the prompt (for testing)
            return {"text": "LLM not configured. Prompt was:\n" + prompt}
        # You must adapt to the exact LLM client's API. Example below uses .generate_content() / .models.generate_content
        try:
            # many LLM wrappers use different call names. Adapt this to your running ollm client.
            resp = self.ollm.generate_content(model=self.model, contents=prompt, max_output_tokens=self.max_output_tokens, temperature=self.temperature)
            # resp format depends on client; try to extract text:
            if hasattr(resp, "text"):
                text = resp.text
            elif isinstance(resp, dict) and resp.get("output_text"):
                text = resp["output_text"]
            else:
                # fallback stringify
                text = str(resp)
            return {"text": text, "raw": resp}
        except Exception as e:
            logger.warning("LLM generate exception: %s", e)
            # second attempt for different SDKs
            try:
                resp2 = self.ollm(models=self.model, prompt=prompt, max_tokens=self.max_output_tokens, temperature=self.temperature)
                return {"text": getattr(resp2, "text", str(resp2)), "raw": resp2}
            except Exception as e2:
                raise RuntimeError(f"LLM invocation failed: {e} / {e2}")

    def run(self, *args, **kwargs):
        return self._run(*args, **kwargs)


# ---------- ServeTool (orchestrator callable) ----------
class ServeTool(BaseTool):
    name: str = "Serve Tool"
    description: str = "Orchestrator: retrieve -> assemble -> generate. Returns answer + sources."

    def __init__(self, retrieve_tool: RetrieveTool, assemble_tool: AssembleTool, generate_tool: GenerateTool, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.retrieve_tool = retrieve_tool
        self.assemble_tool = assemble_tool
        self.generate_tool = generate_tool

    def _run(self, query: str, top_k: int = 5) -> Dict[str, Any]:
        retrieved = self.retrieve_tool._run(query, top_k=top_k)
        assembled = self.assemble_tool._run(query, retrieved)
        gen = self.generate_tool._run(assembled["prompt"])
        sources = [r.get("id") for r in retrieved]
        return {"answer": gen.get("text"), "raw": gen.get("raw"), "sources": sources, "context_chunks": assembled["context_chunks"]}

    def run(self, *args, **kwargs):
        return self._run(*args, **kwargs)


ingest_tool = IngestTool()
chunk_tool = ChunkTool()
embed_tool = EmbedTool()
index_tool = IndexTool()
retrieve_tool = RetrieveTool(index_tool=index_tool, embed_tool=embed_tool, collection_name="docs")
assemble_tool = AssembleTool()
generate_tool = GenerateTool(ollm_instance=ollm, model="gemini/gemini-2.5-flash", temperature=0.0, max_output_tokens=512)
serve_tool = ServeTool(retrieve_tool=retrieve_tool, assemble_tool=assemble_tool, generate_tool=generate_tool)


rag_agent = Agent(
    role="RAG Retrieval & Answering Agent",
    goal=(
        "You are an advanced Retrieval-Augmented Generation (RAG) agent. "
        "Your primary goal is to answer user queries using ONLY the information retrieved "
        "from the provided RAG tools. You must never guess or create information that "
        "is not supported by retrieved context."
    ),
    backstory=(
        "You operate inside a controlled RAG pipeline. Your responsibility is to:"
        "\n1. Use the IngestTool to load documents when required."
        "\n2. Use the ChunkTool to split documents into chunks."
        "\n3. Use the EmbedTool to convert chunks into embeddings."
        "\n4. Use the IndexTool to store embeddings in the vector database."
        "\n5. Use the RetrieveTool to find relevant text chunks for the user’s query."
        "\n6. Use the AssembleTool to build a grounded prompt using retrieved context."
        "\n7. Use the GenerateTool to produce the final answer."
        "\nYou must always rely on retrieved context. If context is missing, you must reply: "
        "'I don't know based on the available data.'"
    ),
    allow_delegation=False,
    verbose=True,
    tools=[ingest_tool, chunk_tool, embed_tool, index_tool, retrieve_tool, assemble_tool, generate_tool, serve_tool],
    llm=ollm
)

rag_task = Task(
    description=(
        "Your job is to answer the user query using a strict RAG process. "
        "You MUST follow these steps IN ORDER using the available tools:\n\n"

        "1) If documents need to be added to the knowledge base, call IngestTool first.\n"
        "2) Then call ChunkTool to convert the ingested document into manageable chunks.\n"
        "3) Use EmbedTool to produce embeddings for each chunk.\n"
        "4) Call IndexTool to store embeddings into the vector database.\n\n"

        "5) For answering a user query, call RetrieveTool to find the most relevant chunks.\n"
        "6) Use AssembleTool to construct a context-rich prompt containing ONLY the retrieved chunks.\n"
        "7) Finally, call GenerateTool to generate the final grounded answer.\n\n"

        "RULES YOU MUST FOLLOW:\n"
        "- Do NOT answer based on your own knowledge. Only use retrieved context.\n"
        "- If the answer is not present in retrieved context, respond: 'I don't know based on the available data.'\n"
        "- Do NOT hallucinate.\n"
        "- Do NOT skip tool calls.\n"
        "- Cite sources when meaningful by mentioning the retrieved chunk IDs.\n"
        "- Your final output MUST be the LLM-generated answer returned from GenerateTool.\n"
    ),
    expected_output="A grounded, context-dependent answer generated strictly using retrieved RAG data.",
    agent=rag_agent
)

crew = Crew(
    agents = [rag_agent],
    tasks = [rag_task],
    verbose = True
)

crew.kickoff()