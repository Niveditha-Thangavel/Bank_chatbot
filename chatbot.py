from crewai import Agent,Task,Crew,LLM
from crewai.tools import BaseTool

llm = LLM(
    model="ollama/phi3",
    base_url="http://localhost:11434"
)

prompt = ""



task_coardinator = Agent(role = "Task coardinator ",
        goal = "Analyze user query and deligate to the appropriate tasks.",
        backstory = "Expert is assigning task to the different agents",
        llm = llm
        )

 
chatbot = Agent(role = "Chatbot",
        goal = f" Answer the question asked by the user ",
        backstory = "Expert in answering the question",
        llm = llm
    )

data_fetcher = ""




chatbot_task = Task(
    description= "Answer to all the question asked by the user in prompt, and accomplish the task mentioned in the prompt by using the right tools for the right task",
    expected_output="Answer to the question with the tool output",
    agent=chatbot
)

crew = Crew(
    agents=[chatbot],
    tasks=[chatbot_task],
    verbose = True
)