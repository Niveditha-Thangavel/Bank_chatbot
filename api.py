# backend.py
import json
import os
from pathlib import Path
from typing import Optional, List, Dict, Any
from threading import Lock
from datetime import datetime

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from crewai import Agent, Crew, LLM, Task
from crewai.tools import BaseTool
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# --- file paths ---
DATA_DIR = Path(__file__).resolve().parent
STATEMENTS_PATH = DATA_DIR / "bank_statements.json"
LOANS_PATH = DATA_DIR / "credits_loan.json"
SESSIONS_PATH = DATA_DIR / "session.json"
DECISIONS_PATH = DATA_DIR / "decisions.json"   # file that must be updated with manager overrides

# --- tools ---
class FetchTool(BaseTool):
    name: str = "FetchBankStatement"
    description: str = "Fetch bank statement and credit/loan profile for a specific customer_id"

    def _run(self, customer_id: str):
        if not STATEMENTS_PATH.exists():
            return {"error": f"Data file not found at {STATEMENTS_PATH}"}
        if not LOANS_PATH.exists():
            return {"error": f"Data file not found at {LOANS_PATH}"}

        with STATEMENTS_PATH.open("r", encoding="utf-8") as f:
            statements = json.load(f)
        with LOANS_PATH.open("r", encoding="utf-8") as f:
            credits = json.load(f)

        bank_record = next(
            (c for c in statements.get("bank_statements", []) if c.get("customer_id") == customer_id),
            None,
        )
        credit_record = next(
            (c for c in credits.get("customer_accounts", []) if c.get("customer_id") == customer_id),
            None,
        )

        if not bank_record and not credit_record:
            return {"error": f"Customer {customer_id} not found in any data source"}

        return {
            "customer_id": customer_id,
            "bank_statement": bank_record or {"error": "Bank statement not found"},
            "credit_profile": credit_record or {"error": "Credit/loan profile not found"},
        }


DEFAULT_RULES_TEXT = (
    "Rules:\n"
    "1. Income Check: Income must be ≥ ₹20,000 per month\n"
    "2. Account Age: Account must be ≥ 6 months old\n"
    "3. Payment History: Late payments must be ≤ 2\n"
    "4. Transaction Issues: There must be no transaction anomalies\n"
    "5. Credit Usage: Credit utilization must be < 70%\n"
    "6. Current Loans: Customer must have ≤ 1 active loan\n"
    "7. Income–Spend Health Check: Monthly income must show a clear positive margin over monthly spending\n"
    "8. Transaction Activity Check: Customer should have consistent and healthy transaction activity\n"
    "9. Outlier Behavior Check: There must be no extreme or unexplained large transaction outliers\n"
    "10. Liquidity Buffer Check: Customer should maintain a reasonable financial buffer or savings room\n"
    "11. Credit History Strength: Customer must show reliable and stable historical credit behavior\n"
    "Decision rule (exact mapping):\n"
    '- If number_of_rules_satisfied == 11 -> decision = \"APPROVE\"\n'
    '- If 8 <= number_of_rules_satisfied < 11 -> decision = \"REVIEW\"\n'
    '- If number_of_rules_satisfied < 8 -> decision = \"REJECT\"\n\n'
    'OUTPUT REQUIREMENT: Return exactly the JSON object {"decision":"APPROVE|REVIEW|REJECT","reason":"string"} and NOTHING else.'
)


class RulesTool(BaseTool):
    name: str = "Rules provider"
    description: str = "Provides the rule-set text to check eligibility of loan"
    rules_text: str = DEFAULT_RULES_TEXT

    def _run(self, *args, **kwargs):
        return self.rules_text


# --- Crew builder (keep your real LLM key secure in env in production) ---
def build_crew(prompt: str) -> Crew:
    api_key = os.getenv("GEMINI_API_KEY", "AIzaSyDYQsKi4jPy-Lmz5mpAnh7Gzs-wuH048iU")
    llm = LLM(model="gemini/gemini-2.5-flash", api_key=api_key)

    chatbot = Agent(
        role="Chatbot",
        goal=f"Answer and accomplish the task in '{prompt}'",
        backstory="Expert in answering questions and completing the right task using the right tool",
        tools=[FetchTool(), RulesTool()],
        llm=llm,
    )

    chatbot_task = Task(
        description=(
            "Answer all questions asked by the user in the prompt, and accomplish the task mentioned "
            "in the prompt by using the right tools for the right task. Use fetch tool to get the customer "
            "data using the customer id in the prompt for display details or similar tasks. "
            "If user asks to check eligibility of loan or similar tasks use the rules tool to fetch the tool "
            "and apply it on the customer data to provide the final decision."
            "If you are unable to answer a question, apologize to the user and tell that you will get back soon and thank the user"
        ),
        expected_output="Answer to the question with the tool output",
        agent=chatbot,
    )

    return Crew(agents=[chatbot], tasks=[chatbot_task], verbose=True)


# --- server state + utils ---
_lock = Lock()
_current_session: List[Dict[str, str]] = []
_sessions_history: List[List[Dict[str, str]]] = []
_decisions: Dict[str, Dict[str, Any]] = {}  # customer_id -> { decision, reason, updated_at }

import tempfile
import traceback

def _atomic_write(path: Path, obj: Any):
    """
    Write JSON obj to `path` atomically by writing to a temp file in the same
    directory and renaming it into place.
    """
    path_parent = path.parent
    path_parent.mkdir(parents=True, exist_ok=True)
    # Create a named temp file in same directory to allow atomic rename
    fd, tmpname = tempfile.mkstemp(prefix=path.name + ".", dir=str(path_parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        # Use os.replace for atomic rename (works on Windows/POSIX)
        os.replace(tmpname, str(path))
    except Exception:
        # If anything fails, ensure temp file is removed and raise
        try:
            if os.path.exists(tmpname):
                os.remove(tmpname)
        except Exception:
            pass
        raise

def _write_decisions_to_disk():
    """
    Persist _decisions to disk. We write two representations atomically:
      - decisions.json          : flat mapping (legacy / simple)
      - decisions-wrapper.json  : {"decisions": {...}} (frontend compatibility)
    """
    with _lock:
        try:
            # Flat mapping (legacy)
            _atomic_write(DECISIONS_PATH, _decisions)

            # Wrapper representation for frontends expecting {"decisions": {...}}
            wrapper_path = DECISIONS_PATH.with_name("decisions.json")
            _atomic_write(wrapper_path, {"decisions": _decisions})
        except Exception as e:
            # Log the traceback so you can see in the server logs what failed
            print("ERROR: failed to write decisions to disk:", str(e))
            traceback.print_exc()
            # re-raise so callers like manager_action can return 500
            raise



def _load_sessions_from_disk():
    global _current_session, _sessions_history
    if not SESSIONS_PATH.exists():
        _current_session = []
        _sessions_history = []
        return
    try:
        with SESSIONS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
            _current_session = data.get("current", [])
            _sessions_history = data.get("history", [])
    except Exception:
        _current_session = []
        _sessions_history = []


def _write_sessions_to_disk():
    data = {"current": _current_session, "history": _sessions_history}
    _atomic_write(SESSIONS_PATH, data)


def _load_decisions_from_disk():
    global _decisions
    if not DECISIONS_PATH.exists():
        _decisions = {}
        return
    try:
        with DECISIONS_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
            if isinstance(payload, dict) and "decisions" in payload and isinstance(payload["decisions"], dict):
                _decisions = payload["decisions"]
            elif isinstance(payload, dict):
                _decisions = payload
            else:
                _decisions = {}
    except Exception:
        _decisions = {}


# initial load
_load_sessions_from_disk()
_load_decisions_from_disk()


# --- web app ---
class ChatRequest(BaseModel):
    message: str
    customer_id: Optional[str] = None
    end_session: Optional[bool] = False
    session_id: Optional[str] = None


class ManagerActionRequest(BaseModel):
    action: str
    customer_id: str
    reason: Optional[str] = None


app = FastAPI(title="Banking Agent API", version="0.4.0 (manager override persistence)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/sessions")
def get_sessions():
    with _lock:
        return {"current": _current_session, "history_len": len(_sessions_history)}


@app.get("/decisions")
def get_decisions():
    with _lock:
        return {"decisions": dict(_decisions)}


@app.get("/decisions.json")
def get_decisions_json():
    """
    Serve the decisions.json that frontend tries to fetch directly.
    Returns a JSON body — if file missing, return empty mapping.
    """
    with _lock:
        return Response(content=json.dumps(_decisions, ensure_ascii=False, indent=2), media_type="application/json")


@app.post("/chat")
def chat(request: ChatRequest):
    import uuid
    
    prompt = request.message
    if request.customer_id:
        prompt += f"\nCustomer ID: {request.customer_id}"

    with _lock:
        # If no session_id provided, create a new one
        session_id = request.session_id or str(uuid.uuid4())
        
        # For this implementation, we use a single global session per request
        # In a multi-user system, you'd track sessions separately
        _current_session.append({"role": "user", "text": prompt})

        session_text_lines = []
        for turn in _current_session:
            role_tag = "USER" if turn.get("role") == "user" else "ASSISTANT"
            session_text_lines.append(f"{role_tag}: {turn.get('text')}")
        combined_context = "\n".join(session_text_lines)

    crew = build_crew(combined_context)
    try:
        result = crew.kickoff()
        assistant_reply = str(result)
    except Exception as exc:
        with _lock:
            _write_sessions_to_disk()
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    with _lock:
        _current_session.append({"role": "assistant", "text": assistant_reply})

        if request.end_session:
            _sessions_history.append(list(_current_session))
            _current_session.clear()

        try:
            _write_sessions_to_disk()
        except Exception as e:
            return {"reply": assistant_reply, "session_id": session_id, "warning": f"Failed to persist session to disk: {e}", "current_session": _current_session}

    return {"reply": assistant_reply, "session_id": session_id, "current_session": _current_session}


@app.post("/manager-action")
def manager_action(req: ManagerActionRequest):
    """
    Accept manager override actions and persist them to decisions.json.
    Example payload: { "action": "Approve", "customer_id": "C101", "reason": "Accepting despite missing doc" }
    """

    action_raw = (req.action or "").strip()
    customer_id = (req.customer_id or "").strip()
    reason = req.reason or ""

    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id is required")
    if not action_raw:
        raise HTTPException(status_code=400, detail="action is required")

    # Normalize action (accept common synonyms/case-insensitive)
    mapping = {"APPROVE": "APPROVE", "REJECT": "REJECT", "REVIEW": "REVIEW"}
    normalized = mapping.get(action_raw.upper())
    if normalized is None:
        raise HTTPException(status_code=400, detail=f"action must be one of {list(mapping.keys())}")

    now = datetime.utcnow().isoformat() + "Z"
    record = {"decision": normalized, "reason": reason, "updated_at": now}

    with _lock:
        # update in-memory mapping
        _decisions[customer_id] = record

        # persist decisions.json and wrapper atomically
        try:
            _write_decisions_to_disk()
        except Exception as e:
            # Rollback in-memory change if you prefer; here we keep it but report failure
            raise HTTPException(status_code=500, detail=f"Failed to persist decisions file: {e}")

        # append a machine-readable override message to session so the LLM sees it
        override_text = json.dumps(
            {
                "manager_override": {
                    "customer_id": customer_id,
                    "decision": normalized,
                    "reason": reason,
                    "ts": now,
                }
            },
            ensure_ascii=False,
        )

        # use a clear prefix so the agent can detect it easily
        _current_session.append({"role": "assistant", "text": f"MANAGER_OVERRIDE: {override_text}"})

        # persist sessions too (best-effort)
        try:
            _write_sessions_to_disk()
        except Exception:
            # decisions saved; session persist is best-effort
            pass

    # Return the saved record to the client (frontend will use this to update UI)
    return {"status": "ok", "decision": record}


@app.post("/update-decisions")
def update_decisions(payload: Dict[str, Any]):
    """
    Backwards-compatible endpoint.
    Body example: { "customer_id": "C101", "decision": "APPROVE", "reason": "..." }
    """
    customer_id = str(payload.get("customer_id", "")).strip()
    decision = str(payload.get("decision", "")).strip().upper()
    reason = str(payload.get("reason", "") or "")

    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id is required")
    if decision not in {"APPROVE", "REJECT", "REVIEW"}:
        raise HTTPException(status_code=400, detail="decision must be APPROVE, REJECT or REVIEW")

    now = datetime.utcnow().isoformat() + "Z"
    rec = {"decision": decision, "reason": reason, "updated_at": now}

    with _lock:
        _decisions[customer_id] = rec
        try:
            _write_decisions_to_disk()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to persist decisions file: {e}")

        override_text = json.dumps({"manager_override": {"customer_id": customer_id, "decision": decision, "reason": reason, "ts": now}}, ensure_ascii=False)
        _current_session.append({"role": "assistant", "text": f"MANAGER_OVERRIDE: {override_text}"})
        try:
            _write_sessions_to_disk()
        except Exception:
            pass

    return {"status": "ok", "decision": rec}
