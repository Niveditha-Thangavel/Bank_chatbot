# backend.py
import json
import os
import tempfile
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional

from datetime import datetime
from threading import Lock
import asyncio

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

try:
    from crewai import Agent, Crew, LLM, Task
    from crewai.tools import BaseTool
except Exception:
    raise

# --- file paths ---
DATA_DIR = Path(__file__).resolve().parent
STATEMENTS_PATH = DATA_DIR / "bank_statements.json"
LOANS_PATH = DATA_DIR / "credits_loan.json"
SESSIONS_PATH = DATA_DIR / "session.json"
DECISIONS_PATH = "/Users/kabil/Desktop/Projects/Simplyfi/learning_model/banking_app/bank_chatbots/frontend/public/decisions.json"

_lock = Lock()

_sessions_by_id: Dict[str, List[Dict[str, str]]] = {}
_sessions_history_by_id: Dict[str, List[List[Dict[str, str]]]] = {}
_decisions: Dict[str, Dict[str, Any]] = {}

def _atomic_write(path: Path, obj: Any):
    path_parent = path.parent
    path_parent.mkdir(parents=True, exist_ok=True)
    fd, tmpname = tempfile.mkstemp(prefix=path.name + ".", dir=str(path_parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmpname, str(path))
    except Exception:
        try:
            if os.path.exists(tmpname):
                os.remove(tmpname)
        except Exception:
            pass
        raise

def _write_decisions_to_disk():
    with _lock:
        try:
            _atomic_write(DECISIONS_PATH, _decisions)
        except Exception as e:
            print("ERROR: failed to write decisions to disk:", str(e))
            traceback.print_exc()
            raise

def _load_decisions_from_disk():
    global _decisions
    try:
        with DECISIONS_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
            if isinstance(payload, dict):
                _decisions = payload
                return
    except Exception:
        _decisions = {}
    _decisions = {}

def _load_sessions_from_disk():
    global _sessions_by_id, _sessions_history_by_id
    if not SESSIONS_PATH.exists():
        _sessions_by_id = {}
        _sessions_history_by_id = {}
        return
    try:
        with SESSIONS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
            sessions_blob = data.get("sessions", {})
            _sessions_by_id = {}
            _sessions_history_by_id = {}
            for sid, blob in sessions_blob.items():
                _sessions_by_id[sid] = blob.get("current", [])
                _sessions_history_by_id[sid] = blob.get("history", [])
    except Exception:
        _sessions_by_id = {}
        _sessions_history_by_id = {}

def _write_sessions_to_disk():
    with _lock:
        obj = {"sessions": {}}
        for sid, cur in _sessions_by_id.items():
            obj["sessions"][sid] = {"current": cur, "history": _sessions_history_by_id.get(sid, [])}
        _atomic_write(SESSIONS_PATH, obj)

_load_sessions_from_disk()
_load_decisions_from_disk()

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

def build_crew(prompt: str) -> Crew:
    api_key = "AIzaSyAI_xnjw18Cu1NEWqolP_q0HeKpoKSe620"
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set in environment. Set it before starting the server.")
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

app = FastAPI(title="Banking Agent API", version="0.5.0 (per-session + safe keys)")

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

class ChatRequest(BaseModel):
    message: str
    customer_id: Optional[str] = None
    end_session: Optional[bool] = False
    session_id: Optional[str] = None

class UpdateDecisionsPayload(BaseModel):
    customer_id: str
    decision: str
    reason: Optional[str] = None
    session_id: Optional[str] = None

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/sessions")
async def get_sessions():
    with _lock:
        summary = {sid: {"current_len": len(cur), "history_len": len(_sessions_history_by_id.get(sid, []))} for sid, cur in _sessions_by_id.items()}
        return {"sessions": summary}

@app.get("/decisions")
async def get_decisions():
    with _lock:
        return {"decisions": dict(_decisions)}

@app.get("/decisions.json")
async def get_decisions_json():
    with _lock:
        try:
            return Response(content=Path(DECISIONS_PATH).read_text(encoding="utf-8"), media_type="application/json")
        except Exception:
            pass
        return Response(content=json.dumps(_decisions, ensure_ascii=False, indent=2), media_type="application/json")

@app.post("/chat")
async def chat(request: ChatRequest):
    import uuid
    prompt = request.message
    if request.customer_id:
        prompt += f"\nCustomer ID: {request.customer_id}"
    session_id = request.session_id or str(uuid.uuid4())
    with _lock:
        if session_id not in _sessions_by_id:
            _sessions_by_id[session_id] = []
            _sessions_history_by_id[session_id] = []
        _sessions_by_id[session_id].append({"role": "user", "text": prompt})
        session_text_lines = []
        for turn in _sessions_by_id[session_id]:
            role_tag = "USER" if turn.get("role") == "user" else "ASSISTANT"
            session_text_lines.append(f"{role_tag}: {turn.get('text')}")
        combined_context = "\n".join(session_text_lines)
    try:
        crew = build_crew(combined_context)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build crew: {str(exc)}")
    try:
        result = await asyncio.to_thread(crew.kickoff)
    except Exception as exc:
        with _lock:
            try:
                _write_sessions_to_disk()
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"LLM execution failed: {str(exc)}")
    try:
        # try to pull a reasonable reply from the result
        if hasattr(result, "output"):
            assistant_reply = result.output
        elif hasattr(result, "text"):
            assistant_reply = result.text
        elif isinstance(result, dict) and "reply" in result:
            assistant_reply = result["reply"]
        else:
            assistant_reply = result
    except Exception:
        assistant_reply = str(result)

    # --- NORMALIZE assistant_reply to be JSON-serializable (dict / list / str / number / bool / None) ---
    def _normalize_reply(obj):
        # fast-pass: if json.dumps works, return as-is
        try:
            json.dumps(obj)
            return obj
        except TypeError:
            pass

        # If it's an object with a dict, try to extract a useful mapping
        try:
            if hasattr(obj, "__dict__") and isinstance(obj.__dict__, dict):
                # filter out private/internal attrs
                simple = {k: v for k, v in obj.__dict__.items() if not k.startswith("_")}
                try:
                    json.dumps(simple)
                    return simple
                except TypeError:
                    # fallback to string
                    return str(obj)
        except Exception:
            pass

        # If it's iterable of simple items, try to convert
        try:
            if isinstance(obj, (list, tuple, set)):
                lst = list(obj)
                try:
                    json.dumps(lst)
                    return lst
                except TypeError:
                    return [str(i) for i in lst]
        except Exception:
            pass

        # last resort: stringify
        try:
            return str(obj)
        except Exception:
            return repr(obj)
    assistant_reply = _normalize_reply(assistant_reply)

    _sessions_by_id[session_id].append({"role": "assistant", "text": assistant_reply})
    if request.end_session:
        _sessions_history_by_id[session_id].append(list(_sessions_by_id[session_id]))
        _sessions_by_id[session_id].clear()
    try:
        _write_sessions_to_disk()
    except Exception as e:
        return {"reply": assistant_reply, "session_id": session_id, "warning": f"Failed to persist session to disk: {e}", "current_session": _sessions_by_id.get(session_id, [])}
    return {"reply": assistant_reply, "session_id": session_id, "current_session": _sessions_by_id.get(session_id, [])}

class UpdateDecisionPayload(BaseModel):
    customer_id: str
    decision: str
    reason: str | None = ""




@app.post("/update-decisions")
async def update_decisions(payload: UpdateDecisionPayload):
    customer_id = payload.customer_id.strip()
    decision = payload.decision.strip().upper()
    reason = payload.reason or ""

    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id is required")

    if decision not in {"APPROVE", "REJECT", "REVIEW"}:
        raise HTTPException(
            status_code=400,
            detail="decision must be APPROVE, REJECT or REVIEW",
        )

    now = datetime.utcnow().isoformat() + "Z"

    rec = {
        "decision": decision,
        "reason": reason,
        "updated_at": now
    }

    # Update in-memory mapping
    with _lock:
        _decisions[customer_id] = rec

        try:

            with open(DECISIONS_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)


            # 2) Modify only the specific customer_id
            data["decisions"][customer_id] = rec

            # 3) Write updated mapping back to file
            with open(DECISIONS_PATH, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)



        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to write decisions file: {e}"
            )

    return {"status": "ok", "decision": rec}