import json
from pathlib import Path
from typing import Optional

from crewai import Agent, Crew, LLM, Task
from crewai.tools import BaseTool
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


DATA_DIR = Path(__file__).resolve().parent
STATEMENTS_PATH = DATA_DIR / "bank_statements.json"


class FetchTool(BaseTool):
    name: str = "FetchBankStatement"
    description: str = "Fetch the bank statement for a specific customer_id"

    def _run(self, customer_id: str):
        if not STATEMENTS_PATH.exists():
            return {"error": f"Data file not found at {STATEMENTS_PATH}"}

        with STATEMENTS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)

        for customer in data.get("bank_statements", []):
            if customer.get("customer_id") == customer_id:
                return customer

        return {"error": "Customer not found"}


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
    llm = LLM(model="ollama/phi3", base_url="http://localhost:11434")

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
        ),
        expected_output="Answer to the question with the tool output",
        agent=chatbot,
    )

    return Crew(agents=[chatbot], tasks=[chatbot_task], verbose=True)


class ChatRequest(BaseModel):
    message: str
    customer_id: Optional[str] = None


app = FastAPI(title="Banking Agent API", version="0.1.0")

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


@app.post("/chat")
def chat(request: ChatRequest):
    prompt = request.message
    if request.customer_id:
        prompt += f"\nCustomer ID: {request.customer_id}"

    crew = build_crew(prompt)
    try:
        result = crew.kickoff()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"reply": str(result)}

