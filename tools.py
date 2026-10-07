from crewai.tools import tool
from rag import VectorStore


store = VectorStore()

@tool("Search Theological Commentary and Lexicon")
def search_theological_context(query: str) -> str:
    """Useful for searching ancient Greek/Hebrew/Aramaic definitions, historical context, and Matthew Henry commentary related to a passage or topic."""

    results = store.query_context(query_text=query, n_results=2)

    documents = results.get('documents', [[]])[0]
    return "\n\n".join(documents) if documents else "No relevant context found."



