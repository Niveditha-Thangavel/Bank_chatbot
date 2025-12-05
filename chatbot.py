from crewai import Agent,Task,Crew,LLM
from crewai.tools import BaseTool,SerperDevTool
import os

os.environ["SERPER_API_KEY"] = "979682778de4ca972dfb070cd7d6d67906f33b15"

search_tool = SerperDevTool()

llm = LLM(
    model="ollama/phi3",
    base_url="http://localhost:11434"
)

prompt = ""

chatbot = Agent(role = "Chatbot",
        goal = f" Answer and accomplish the task in '{prompt}' ",
        backstory = "Expert in answering the question and assign the right task and complete it according the requirements",
        llm = llm
    )

chatbot_task = Task(
    description= "Answer to all the question asked by the user in prompt, and accomplish the task mentioned in the prompt by using the right tools for the right task",
    expected_output="Answer to the question with the tool output",

)
