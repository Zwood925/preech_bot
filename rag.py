import chromadb

class VectorStore:
    def __init__(self, db_path="./chroma_db"):
        self.client = chromadb.PersistentClient(path=db_path)
        self.collection = self.client.get_or_create_collection("sermon_context")

    def add_documents(self, documents, metadata, ids):
        self.collection.add(documents=documents, metadatas=metadata, ids=ids)

    def query_context(self, query_text, n_results=2):
        results = self.collection.query(query_texts=[query_text], n_results=n_results)
        return results

