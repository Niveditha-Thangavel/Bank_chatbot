import streamlit as st
from crewai import Agent, Task, Crew, LLM

API_KEY = "AIzaSyDdX_fA26leyYXc1imywz4P6fUNOqtxWx8"
ollm = LLM(model="gemini/gemini-2.5-flash", api_key=API_KEY)

chat_agent = Agent(
    role="ChatBot",
    goal="Chat with the user in a friendly and helpful way.",
    backstory="You are a chatbot built to keep users engaged and assist them naturally.",
    allow_delegation=False,
    llm=ollm,
    verbose=False
)

st.set_page_config(page_title="CrewAI Chatbot", page_icon="🤖")
st.title("🤖 Simple CrewAI Chatbot")

if "messages" not in st.session_state:
    st.session_state.messages = [
        {"role": "assistant", "content": "Hello! What’s on your mind today?"}
    ]

for m in st.session_state.messages:
    if m["role"] == "user":
        st.markdown(f"**You:** {m['content']}")
    else:
        st.markdown(f"**Chatbot:** {m['content']}")

user_input = st.text_input("You:", "")

if st.button("Send"):
    if user_input.strip():
        st.session_state.messages.append({"role": "user", "content": user_input})

        task = Task(
            description=(
                f"The user says: '{user_input}'. "
                "Respond conversationally and helpfully. "
                "If the user says 'bye', reply with 'bye' only."
            ),
            expected_output="A friendly chatbot-style message.",
            agent = chat_agent
        )

        crew = Crew(agents=[chat_agent], tasks=[task], verbose=False)
        reply = crew.kickoff()

        st.session_state.messages.append({"role": "assistant", "content": reply})

