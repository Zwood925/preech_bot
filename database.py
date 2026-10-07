import sqlite3
from datetime import datetime
from typing import Optional, List, Tuple, Any

class SermonLog:
    def __init__(self, db_name="preech.db"):
        self.conn = sqlite3.connect(db_name)
        self.conn.row_factory = sqlite3.Row
        self.create_table()

    def create_table(self):
        cursor = self.conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sermons (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT,
                book TEXT,
                chapter INTEGER,
                start_verse INTEGER,
                end_verse INTEGER,
                sermon_text TEXT,
                audio_file_path TEXT,
                status TEXT,
                tags TEXT,  -- JSON array of tags
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS progression (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book TEXT,
                chapter INTEGER,
                last_verse INTEGER,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.conn.commit()

    def add_sermon(self, title, book, chapter, start_verse, end_verse, sermon_text, audio_file_path, status, tags=None):
        cursor = self.conn.cursor()
        import json
        tags_json = json.dumps(tags) if tags else "[]"
        cursor.execute(
            "INSERT INTO sermons (title, book, chapter, start_verse, end_verse, sermon_text, audio_file_path, status, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (title, book, chapter, start_verse, end_verse, sermon_text, audio_file_path, status, tags_json)
        )
        self.conn.commit()
        return cursor.lastrowid

    def get_last_studied_passage(self) -> Optional[Tuple]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM sermons ORDER BY id DESC LIMIT 1")
        return cursor.fetchone()

    def get_last_progression(self) -> Optional[Tuple]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT book, chapter, last_verse FROM progression ORDER BY id DESC LIMIT 1")
        return cursor.fetchone()

    def update_progression(self, book: str, chapter: int, last_verse: int):
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT INTO progression (book, chapter, last_verse) VALUES (?, ?, ?)",
            (book, chapter, last_verse)
        )
        self.conn.commit()

    def search_sermons(self, query: str, by_passage: bool = False, by_tags: bool = False) -> List[sqlite3.Row]:
        """Search sermons by passage reference or tags."""
        cursor = self.conn.cursor()
        if by_passage:
            cursor.execute(
                "SELECT * FROM sermons WHERE book LIKE ? OR title LIKE ? ORDER BY created_at DESC",
                (f"%{query}%", f"%{query}%")
            )
        elif by_tags:
            cursor.execute(
                "SELECT * FROM sermons WHERE tags LIKE ? ORDER BY created_at DESC",
                (f"%{query}%",)
            )
        else:
            # Full-text search on sermon_text and title
            cursor.execute(
                "SELECT * FROM sermons WHERE sermon_text LIKE ? OR title LIKE ? ORDER BY created_at DESC",
                (f"%{query}%", f"%{query}%")
            )
        return cursor.fetchall()

    def get_sermon_by_id(self, sermon_id: int) -> Optional[sqlite3.Row]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM sermons WHERE id = ?", (sermon_id,))
        return cursor.fetchone()

    def get_all_sermons(self) -> List[sqlite3.Row]:
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM sermons ORDER BY created_at DESC")
        return cursor.fetchall()