from crewai import LLM, Agent
from tools import search_theological_context


# Ollama models available:
# - deepseek-r1:8b (5.2GB): reasoning-heavy, excellent for theological analysis and Greek/Hebrew deep dives
# - qwen2.5-coder:14b (9.0GB): excellent for structured writing/analysis, best for sermon synthesis
# - llama3.1:8b (4.9GB): fast, decent for hooks/exegesis/creative storytelling

# 2. Agent 1: The Creative Hook / Illustration Specialist
# Uses llama3.1:8b - fast, creative, good for storytelling hooks
local_llm_hook = LLM(
    model="ollama/llama3.1:8b",
    base_url="http://localhost:11434",
)

# 3. Agent 2: The Exegetical & Linguistic Scholar
# Note: deepseek-r1:8b does NOT support tool calls in CrewAI/Ollama.
# Using llama3.1:8b for exegesis agent so the RAG search tool works.
local_llm_exegesis = LLM(
    model="ollama/llama3.1:8b",
    base_url="http://localhost:11434",
)

# 4. Agent 3: The Sermon Writer
# Uses qwen2.5-coder:14b - excellent for structured writing and synthesis
local_llm_writer = LLM(
    model="ollama/qwen2.5-coder:14b",
    base_url="http://localhost:11434",
)


# 2. Agent 1: The Creative Hook / Illustration Specialist
hook_agent = Agent(
    role="Sermon Hook & Storytelling Specialist",
    goal="Find compelling real-world stories, modern analogies, or historical anecdotes that capture attention.",
    backstory="You are an expert communicator who knows how to open a speech with an unforgettably engaging story.",
    verbose=True,
    llm=local_llm_hook
)


# 3. Agent 2: The Exegetical & Linguistic Scholar
exegesis_agent = Agent(
    role="Biblical Exegesis & Linguistic Scholar",
    goal="Uncover Greek/Hebrew meanings, original language nuances, and historical background of passages.",
    backstory="You are a scholar skilled in ancient languages. You ALWAYS search theological commentary for accuracy.",
    tools=[search_theological_context],
    verbose=True,
    llm=local_llm_exegesis
)


# 4. Agent 3: The Sermon Writer
writer_agent = Agent(
    role="Master Sermon Writer",
    goal="Synthesize engaging hooks, solid exegesis, and practical application into a cohesive sermon script.",
    backstory="You are an empathetic communicator who writes spoken-word sermons optimized for clear audio delivery.",
    verbose=True,
    llm=local_llm_writer
)