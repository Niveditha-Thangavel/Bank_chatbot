# server.py (updated)
import json
import re
import os
from pathlib import Path
from typing import Optional, List, Dict, Any
from threading import Lock
from datetime import datetime

from crewai import Agent, Crew, LLM, Task
from crewai.tools import BaseTool
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DATA_DIR = Path(__file__).resolve().parent
STATEMENTS_PATH = DATA_DIR / "bank_statements.json"
LOANS_PATH = DATA_DIR / "credits_loan.json"
SESSIONS_PATH = DATA_DIR / "session.json"

# Server-side decisions file (fallback)
DECISIONS_PATH = DATA_DIR / "decisions.json"

# Attempt to locate the frontend public decisions.json
# Default assumed location: ../frontend/public/decisions.json (adjust if your folder structure differs)
FRONTEND_DECISIONS_PATH = (DATA_DIR / ".." / "frontend" / "public" / "decisions.json").resolve()

_lock = Lock()


class FetchTool(BaseTool):
    name: str = "FetchBankStatement"
    description: str = "Fetch the bank statement and credit/loan profile for a specific customer_id"

    def _run(self, customer_id: str):
        if not STATEMENTS_PATH.exists():
            return {"error": f"Data file not found at {STATEMENTS_PATH}"}
        if not LOANS_PATH.exists():
            return {"error": f"Data file not found at {LOANS_PATH}"}
        with STATEMENTS_PATH.open("r", encoding="utf-8") as f:
            statements = json.load(f)
        with LOANS_PATH.open("r", encoding="utf-8") as f:
            credits = json.load(f)
        bank_record = next((c for c in statements.get("bank_statements", []) if c.get("customer_id") == customer_id), None)
        credit_record = next((c for c in credits.get("customer_accounts", []) if c.get("customer_id") == customer_id), None)
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
    '- If number_of_rules_satisfied == 11 -> decision = "APPROVE"\n'
    '- If 8 <= number_of_rules_satisfied < 11 -> decision = "REVIEW"\n'
    '- If number_of_rules_satisfied < 8 -> decision = "REJECT"\n\n'
    'OUTPUT REQUIREMENT: Return exactly the JSON object {"decision":"APPROVE|REVIEW|REJECT","reason":"string"} and NOTHING else.' 
)


class RulesTool(BaseTool):
    name: str = "Rules provider"
    description: str = "Provides the rule-set text to check eligibility of loan"
    rules_text: str = DEFAULT_RULES_TEXT
    def _run(self, *args, **kwargs):
        return self.rules_text


def build_crew(prompt: str) -> Crew:
    llm = LLM(model="gemini/gemini-2.5-flash", api_key=os.environ.get("GOOGLE_API_KEY", "AIzaSyDKGc0XDzM4awKRKZxs2OjbnZ_y9vzT6Us"))
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
            "use session.json to see the previous chats to reduce processing time"
            "provide all the answers in user friendly sentences no json out"
            "don't bold anything"
            "If you are unable to answer a question, apologize to the user and tell that you will get back soon and thank the user"
        ),
        expected_output="Answer to the question with the tool output",
        agent=chatbot,
    )
    return Crew(agents=[chatbot], tasks=[chatbot_task], verbose=True)


_current_session: List[Dict[str, str]] = []
_sessions_history: List[List[Dict[str, str]]] = []


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
    temp = SESSIONS_PATH.with_suffix(".tmp")
    with temp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    temp.replace(SESSIONS_PATH)


# --- Decisions helpers (now support frontend public location) ---
def _get_active_decisions_path() -> Path:
    """
    Return the path that should be used for reading/writing decisions.
    Preference order:
      1) FRONTEND_DECISIONS_PATH if it exists or its parent exists (we will create file if missing)
      2) DECISIONS_PATH (server-side fallback)
    """
    # If frontend public folder exists, prefer it
    try:
        frontend_parent = FRONTEND_DECISIONS_PATH.parent
        if frontend_parent.exists():
            return FRONTEND_DECISIONS_PATH
    except Exception:
        pass
    return DECISIONS_PATH


def _load_decisions_from_disk(path: Optional[Path] = None) -> Dict[str, Dict[str, Any]]:
    if path is None:
        path = _get_active_decisions_path()
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
            # Support two shapes:
            # 1) { "decisions": { "C101": {...} } }
            # 2) { "C101": {...}, ... }
            if isinstance(data, dict):
                if "decisions" in data and isinstance(data["decisions"], dict):
                    return data["decisions"]
                return data
    except Exception:
        pass
    return {}


def _write_decisions_to_disk(data: Dict[str, Dict[str, Any]], path: Optional[Path] = None):
    if path is None:
        path = _get_active_decisions_path()

    # If existing file used a wrapper { "decisions": {...} } preserve that shape if file exists
    final_obj: Dict[str, Any] = {}
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as f:
                existing = json.load(f)
            if isinstance(existing, dict) and "decisions" in existing and isinstance(existing["decisions"], dict):
                final_obj = {"decisions": data}
            else:
                final_obj = data
        except Exception:
            final_obj = data
    else:
        # default to a wrapper shape to be conservative (frontend can handle both)
        final_obj = {"decisions": data}

    temp = path.with_suffix(".tmp")
    temp.parent.mkdir(parents=True, exist_ok=True)
    with temp.open("w", encoding="utf-8") as f:
        json.dump(final_obj, f, ensure_ascii=False, indent=2)
    temp.replace(path)


def _extract_decision_and_reason(reply_text: str) -> Optional[Dict[str, str]]:
    """
    Try multiple strategies to extract a JSON-like {"decision":"...","reason":"..."} from the assistant reply.
    Returns {'decision': 'APPROVE'|'REVIEW'|'REJECT', 'reason': '...'} or None.
    """
    if not reply_text:
        return None

    # 1) Try to parse the whole reply as JSON
    try:
        parsed = json.loads(reply_text)
        if isinstance(parsed, dict) and 'decision' in parsed and 'reason' in parsed:
            return {
                'decision': str(parsed['decision']),
                'reason': str(parsed['reason']),
            }
    except Exception:
        pass

    # 2) Search for the JSON object anywhere in the text using regex (simple approach)
    json_obj_re = re.compile(
        r'\{\s*"decision"\s*:\s*"(APPROVE|REVIEW|REJECT)"\s*,\s*"reason"\s*:\s*"([^"]+)"\s*\}',
        flags=re.IGNORECASE | re.DOTALL,
    )
    m = json_obj_re.search(reply_text)
    if m:
        return {'decision': m.group(1).upper(), 'reason': m.group(2).strip()}

    # 3) Looser regex: decision first then reason on separate lines or text
    loose_re = re.compile(r'decision\s*[:=]\s*(APPROVE|REVIEW|REJECT)', flags=re.IGNORECASE)
    reason_re = re.compile(r'reason\s*[:=]\s*["\']?(.+?)(?:["\']?$|\n)', flags=re.IGNORECASE | re.DOTALL)
    md = loose_re.search(reply_text)
    if md:
        dd = md.group(1).upper()
        mr = reason_re.search(reply_text)
        rr = mr.group(1).strip() if mr else ''
        return {'decision': dd, 'reason': rr}

    return None


_load_sessions_from_disk()


def _is_end_session_message(text: Optional[str]) -> bool:
    if not text:
        return False
    t = text.strip().lower()
    end_phrases = {"end", "end session", "bye", "goodbye", "finish", "done", "close session", "exit", "see you"}
    return any(t == p or t.startswith(p + " ") or t.startswith(p + ",") for p in end_phrases)


class ChatRequest(BaseModel):
    message: str
    customer_id: Optional[str] = None
    end_session: Optional[bool] = False


class UpdateDecisionRequest(BaseModel):
    customer_id: str
    decision: str
    reason: Optional[str] = ""


app = FastAPI(title="Banking Agent API", version="0.2.0 (with sessions & decisions)")

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
    """
    Returns the whole decisions mapping (customer_id -> {decision, reason, updated_at}).
    """
    with _lock:
        data = _load_decisions_from_disk()
        return {"count": len(data), "decisions": data}


@app.get("/decisions.json")
def serve_decisions_json():
    """
    Serve the decisions.json file that the frontend expects in its public folder.
    Falls back to the server DECISIONS_PATH if frontend file is missing.
    """
    with _lock:
        active_path = _get_active_decisions_path()
        if not active_path.exists():
            # return an empty wrapper so frontend always gets valid JSON
            return {"decisions": {}}
        try:
            with active_path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
                # ensure consistent shape: prefer { decisions: { ... } }
                if isinstance(payload, dict) and "decisions" in payload and isinstance(payload["decisions"], dict):
                    return payload
                if isinstance(payload, dict):
                    # return wrapped shape for convenience
                    return {"decisions": payload}
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to load {active_path}: {exc}")
        return {"decisions": {}}


@app.post("/update-decisions")
def update_decision(req: UpdateDecisionRequest):
    """
    Update a single customer's decision in the active decisions.json (frontend public file if present,
    otherwise the server-side decisions.json). Overwrites the customer's record only if the decision changed.
    Returns metadata indicating whether the file was updated.
    """
    if not req.customer_id or not req.decision:
        raise HTTPException(status_code=400, detail="customer_id and decision are required")

    cust = str(req.customer_id)
    new_decision = str(req.decision).upper()
    new_reason = str(req.reason or "")

    with _lock:
        path = _get_active_decisions_path()
        decisions = _load_decisions_from_disk(path)
        existing = decisions.get(cust)
        now = datetime.utcnow().isoformat() + "Z"

        if existing is None:
            # add new
            decisions[cust] = {"decision": new_decision, "reason": new_reason, "updated_at": now}
            try:
                _write_decisions_to_disk(decisions, path)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to write decisions: {e}")
            return {"updated": True, "created": True, "customer_id": cust, "decision": new_decision}
        else:
            if str(existing.get("decision", "")).upper() != new_decision:
                decisions[cust] = {"decision": new_decision, "reason": new_reason, "updated_at": now}
                try:
                    _write_decisions_to_disk(decisions, path)
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Failed to write decisions: {e}")
                return {"updated": True, "created": False, "customer_id": cust, "decision": new_decision}
            else:
                # decision unchanged -> do not overwrite file
                return {"updated": False, "created": False, "customer_id": cust, "decision": new_decision, "reason": "Decision unchanged"}


@app.post("/chat")
def chat(request: ChatRequest):
    prompt = request.message or ""
    if request.customer_id:
        prompt += f"\nCustomer ID: {request.customer_id}"

    client_requested_end = bool(request.end_session)
    message_requests_end = _is_end_session_message(request.message)

    with _lock:
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
            try:
                _write_sessions_to_disk()
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    # Attempt to extract decision+reason from the assistant reply
    extracted = _extract_decision_and_reason(assistant_reply)
    stored = False
    overwritten = False

    # Update decisions file only when we have customer_id and we could extract a decision
    if request.customer_id and extracted:
        cust = str(request.customer_id)
        with _lock:
            path = _get_active_decisions_path()
            decisions = _load_decisions_from_disk(path)
            existing = decisions.get(cust)
            new_decision = extracted['decision']
            new_reason = extracted['reason']
            now = datetime.utcnow().isoformat() + "Z"

            if existing is None:
                # Add new
                decisions[cust] = {"decision": new_decision, "reason": new_reason, "updated_at": now}
                stored = True
            else:
                # If decision changed -> overwrite, else don't modify
                if str(existing.get("decision")).upper() != new_decision.upper():
                    decisions[cust] = {"decision": new_decision, "reason": new_reason, "updated_at": now}
                    stored = True
                    overwritten = True
                else:
                    stored = False
            try:
                _write_decisions_to_disk(decisions, path)
            except Exception as e:
                # non-fatal: still proceed but inform via response
                return {"reply": assistant_reply, "archived": False, "stored": stored, "overwritten": overwritten, "warning": f"Failed to write decisions: {e}"}

    will_archive = client_requested_end or message_requests_end

    with _lock:
        _current_session.append({"role": "assistant", "text": assistant_reply})
        if will_archive:
            _sessions_history.append(list(_current_session))
            _current_session.clear()
        try:
            _write_sessions_to_disk()
        except Exception as e:
            return {
                "reply": assistant_reply,
                "archived": will_archive,
                "current_session": _current_session,
                "stored": stored,
                "overwritten": overwritten,
                "warning": str(e),
            }

    return {
        "reply": assistant_reply,
        "archived": will_archive,
        "current_session": _current_session,
        "stored": stored,
        "overwritten": overwritten,
        "extracted_decision": extracted,
    }
