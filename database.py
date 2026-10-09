"""
Supabase Database & Storage Client for Preech Bot.
Handles scripture progression tracking, sermon log creation,
MP3 audio file uploads to Supabase Storage, and vector embedding generation.
"""

import os
from openai import OpenAI
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file.")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
openrouter_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)
AUDIO_BUCKET = "sermon-audio"


def generate_embedding(text: str) -> list[float]:
    """Generates a 1536-dim vector embedding using OpenRouter."""
    if not OPENROUTER_API_KEY:
        print("[Embedding Warning] OPENROUTER_API_KEY missing, skipping embedding generation.")
        return []

    try:
        response = openrouter_client.embeddings.create(
            model="openai/text-embedding-3-small",
            input=text[:8000]  # Cap context length for embedding
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[Embedding Error] Failed to generate vector: {e}")
        return []


class SermonLog:
    def __init__(self):
        self.client = supabase

    def get_last_progression(self) -> tuple | None:
        """Fetch the latest scripture passage progression from Supabase."""
        response = self.client.table("progression") \
            .select("book, chapter, last_end_verse") \
            .order("updated_at", desc=True) \
            .limit(1) \
            .execute()

        if response.data:
            row = response.data[0]
            return row["book"], row["chapter"], row["last_end_verse"]
        return None

    def update_progression(self, book: str, chapter: int, last_end_verse: int):
        """Update progression tracker with the latest completed verse."""
        self.client.table("progression").insert({
            "book": book,
            "chapter": chapter,
            "last_end_verse": last_end_verse
        }).execute()

    def upload_audio_file(self, local_file_path: str, passage_ref: str) -> str:
        """Uploads local MP3 file to Supabase Storage bucket and returns the public URL."""
        if not os.path.exists(local_file_path):
            print(f"[Storage Warning] File not found for upload: {local_file_path}")
            return ""

        safe_ref = passage_ref.replace(":", "_").replace(" ", "_").replace("/", "_")
        remote_filename = f"{safe_ref}.mp3"

        with open(local_file_path, "rb") as f:
            file_bytes = f.read()

        print(f"--> Uploading {remote_filename} to Supabase Storage...")
        
        self.client.storage.from_(AUDIO_BUCKET).upload(
            path=remote_filename,
            file=file_bytes,
            file_options={"content-type": "audio/mpeg", "x-upsert": "true"}
        )

        public_url = self.client.storage.from_(AUDIO_BUCKET).get_public_url(remote_filename)
        return public_url

    def add_sermon(self, title: str, book: str, chapter: int, start_verse: int, end_verse: int,
                   sermon_text: str, audio_file_path: str, status: str = "COMPLETE", tags: list = None) -> int:
        """Uploads audio, generates embedding, and logs record into Supabase PostgreSQL."""
        passage_ref = f"{book} {chapter}:{start_verse}-{end_verse}"
        audio_url = ""

        if audio_file_path and os.path.exists(audio_file_path):
            audio_url = self.upload_audio_file(audio_file_path, passage_ref)

        print("--> Generating vector embedding for semantic search...")
        embedding_vector = generate_embedding(f"{title}\n{passage_ref}\n{sermon_text}")

        sermon_data = {
            "passage_ref": passage_ref,
            "title": title,
            "book": book,
            "chapter": chapter,
            "start_verse": start_verse,
            "end_verse": end_verse,
            "sermon_text": sermon_text,
            "audio_url": audio_url,
            "status": status,
            "tags": tags or [book],
        }

        if embedding_vector:
            sermon_data["embedding"] = embedding_vector

        response = self.client.table("sermons").insert(sermon_data).execute()
        
        if response.data:
            sermon_id = response.data[0]["id"]
            print(f"--> [Supabase] Sermon logged successfully with vector embedding (ID: {sermon_id})")
            return sermon_id
        return 0