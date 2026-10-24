"""
Supabase Database & Storage Client for Preech Bot.
Handles scripture progression tracking, sermon log creation, search metadata,
MP3 audio uploads to Supabase Storage, and vector embedding generation.

NOTE: run supabase/migrations/20261022_search_and_metadata.sql once before using the new
metadata columns. add_sermon() falls back to the legacy columns if the migration hasn't run yet.
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

# Columns added by the migration; stripped on fallback if the migration hasn't been applied.
NEW_COLUMNS = ("summary", "testament", "genre", "book_order", "word_count", "research")


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


def build_embedding_text(title: str, passage_ref: str, summary: str, themes: list, keywords: list, body: str) -> str:
    """Front-load the semantic signal (summary/themes) so short topical queries match well."""
    head = f"{title}\n{passage_ref}\n{summary}\nThemes: {', '.join(themes or [])}\nKeywords: {', '.join(keywords or [])}\n"
    return head + body


class SermonLog:
    def __init__(self):
        self.client = supabase

    # ---- progression ----------------------------------------------------------------------

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

    # ---- coverage / continuity --------------------------------------------------------------

    def get_all_sermon_ranges(self) -> list[tuple]:
        """Every (book, chapter, start_verse, end_verse) already in the database."""
        rows, offset = [], 0
        while True:
            resp = self.client.table("sermons") \
                .select("book, chapter, start_verse, end_verse") \
                .order("id") \
                .range(offset, offset + 999) \
                .execute()
            batch = resp.data or []
            rows.extend((r["book"], r["chapter"], r["start_verse"], r["end_verse"]) for r in batch)
            if len(batch) < 1000:
                return rows
            offset += 1000

    def get_previous_context(self, book: str) -> str:
        """One-line description of the most recent study in this book, for sermon continuity."""
        for cols in ("passage_ref, title, summary", "passage_ref, title"):
            try:
                resp = self.client.table("sermons").select(cols).eq("book", book) \
                    .order("id", desc=True).limit(1).execute()
                if resp.data:
                    r = resp.data[0]
                    line = f"{r['passage_ref']} titled '{r['title']}'"
                    if r.get("summary"):
                        line += f" ({r['summary']})"
                    return line
                return ""
            except Exception:
                continue
        return ""

    # ---- storage ----------------------------------------------------------------------------

    def upload_audio_file(self, local_file_path: str, passage_ref: str) -> str:
        """Uploads local audio file to Supabase Storage bucket and returns the public URL."""
        if not os.path.exists(local_file_path):
            print(f"[Storage Warning] File not found for upload: {local_file_path}")
            return ""

        ext = os.path.splitext(local_file_path)[1] or ".mp3"
        safe_ref = passage_ref.replace(":", "_").replace(" ", "_").replace("/", "_")
        remote_filename = f"{safe_ref}{ext}"
        content_type = "audio/mpeg" if ext == ".mp3" else "audio/wav"

        with open(local_file_path, "rb") as f:
            file_bytes = f.read()

        print(f"--> Uploading {remote_filename} to Supabase Storage...")

        self.client.storage.from_(AUDIO_BUCKET).upload(
            path=remote_filename,
            file=file_bytes,
            file_options={"content-type": content_type, "x-upsert": "true"}
        )

        return self.client.storage.from_(AUDIO_BUCKET).get_public_url(remote_filename)

    # ---- sermons ----------------------------------------------------------------------------

    def add_sermon(self, title: str, book: str, chapter: int, start_verse: int, end_verse: int,
                   sermon_text: str, audio_file_path: str, status: str = "COMPLETE", tags: list = None,
                   summary: str = "", testament: str = None, genre: str = None, book_order: int = None,
                   word_count: int = None, embedding_text: str = None, research: dict = None) -> int:
        """Uploads audio, generates embedding, and logs record into Supabase PostgreSQL."""
        passage_ref = f"{book} {chapter}:{start_verse}-{end_verse}"
        audio_url = ""

        if audio_file_path and os.path.exists(audio_file_path):
            audio_url = self.upload_audio_file(audio_file_path, passage_ref)

        print("--> Generating vector embedding for semantic search...")
        embedding_vector = generate_embedding(embedding_text or f"{title}\n{passage_ref}\n{sermon_text}")

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
            "summary": summary,
            "testament": testament,
            "genre": genre,
            "book_order": book_order,
            "word_count": word_count,
            "research": research,  # original-language dossier (jsonb) - powers future "word card" UI
        }

        if embedding_vector:
            sermon_data["embedding"] = embedding_vector

        try:
            response = self.client.table("sermons").insert(sermon_data).execute()
        except Exception as e:
            print(f"[Supabase] Insert with metadata failed ({e}). Retrying without new columns "
                  f"(has the migration been applied?).")
            for col in NEW_COLUMNS:
                sermon_data.pop(col, None)
            response = self.client.table("sermons").insert(sermon_data).execute()

        if response.data:
            sermon_id = response.data[0]["id"]
            print(f"--> [Supabase] Sermon logged successfully (ID: {sermon_id})")
            return sermon_id
        return 0

    def update_sermon(self, sermon_id: int, fields: dict):
        self.client.table("sermons").update(fields).eq("id", sermon_id).execute()
