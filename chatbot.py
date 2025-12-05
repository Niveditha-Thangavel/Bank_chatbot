from crewai import Agent,Task,Crew,LLM

import os
import json 
from crewai.tools import BaseTool
from crewai_tools import SerperDevTool



prompt = input("Enter the prompt: ")

class FetchTool(BaseTool):
    name: str = "FetchBankStatement"
    description: str = "Fetch the bank statement for a specific customer_id"

    def _run(self, customer_id: str):
        with open("bank_statements.json", "r") as f:
            data = json.load(f)

        for customer in data["bank_statements"]:
            if customer["customer_id"] == customer_id:
                print(customer)
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
    "- If number_of_rules_satisfied == 11 -> decision = \"APPROVE\"\n"
    "- If 8 <= number_of_rules_satisfied < 11 -> decision = \"REVIEW\"\n"
    "- If number_of_rules_satisfied < 8 -> decision = \"REJECT\"\n\n"
    "OUTPUT REQUIREMENT: Return exactly the JSON object {\"decision\":\"APPROVE|REVIEW|REJECT\",\"reason\":\"string\"} and NOTHING else."
)

class rules_tool(BaseTool):
    name: str = "Rules provider"
    description: str = "Provides the rule-set text to check eligibility of loan"
    rules_text: str = DEFAULT_RULES_TEXT
    def _run(self, *args, **kwargs):
        return self.rules_text




llm = LLM(
    model="ollama/phi3",
    base_url="http://localhost:11434"
)



chatbot = Agent(role = "Chatbot",
        goal = f" Answer and accomplish the task in '{prompt}' ",
        backstory = "Expert in answering the question and complete the right task using the right tool",
        tools = [FetchTool(),rules_tool()],
        llm = llm
    )

chatbot_task = Task(
    description= f"""Answer to all the question asked by the user in {prompt}, and accomplish the task mentioned in the {prompt} by using the right tools for the right task. Use fetch tool to get the customer data using the customer id in the prompt for display details or similair task
   if user asked to check eligibility of loan or similair task use the rules tool to fetch the tool and apply it on the customer data to provide the final decision""",
    expected_output="Answer to the question with the tool output",
    agent = chatbot

)

crew = Crew(
    agents=[chatbot],
    tasks=[chatbot_task],
    verbose=True

)

result = crew.kickoff()
print(result)