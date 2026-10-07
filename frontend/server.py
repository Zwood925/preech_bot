"""
PreechBot Frontend Server
=========================
Serves the retro HTML frontend and provides a JSON API backed by preech.db.
Run: python server.py
Then open http://localhost:8080 in your browser.
"""
import http.server
import socketserver
import json
import sqlite3
import os
import time

PORT = 8080
DB_PATH = "../preech.db"
FRONTEND_DIR = "."

_cache = {"data": None, "timestamp": 0}
_CACHE_TTL = 30


def get_sermons() -> list:
    """Read all sermons from the DB, sorted newest-first."""
    now = time.time()
    if _cache["data"] and (now - _cache["timestamp"]) < _CACHE_TTL:
        return _cache["data"]

    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(script_dir, DB_PATH)
    if not os.path.exists(db_path):
        return []

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, book, chapter, start_verse, end_verse,
               sermon_text, audio_file_path, status, tags, created_at
        FROM sermons ORDER BY id DESC
    """)
    rows = cur.fetchall()
    conn.close()

    sermons = []
    for r in rows:
        audio_rel = ""
        if r["audio_file_path"]:
            audio_name = os.path.basename(r["audio_file_path"])
            audio_rel = f"/audio/{audio_name}"
            # Resolve relative to script dir to check existence
            resolved = os.path.join(script_dir, audio_rel)
            if os.path.exists(resolved):
                pass  # audio_rel is correct
            else:
                audio_rel = f"/audio/{audio_name}"

        tags = []
        try:
            tags = json.loads(r["tags"]) if r["tags"] else []
        except Exception:
            tags = []

        text = r["sermon_text"] or ""
        preview = (text[:400] + "...") if len(text) > 400 else text

        sermons.append({
            "id": r["id"],
            "title": r["title"],
            "passage": f"{r['book']} {r['chapter']}:{r['start_verse']}-{r['end_verse']}",
            "book": r["book"],
            "chapter": r["chapter"],
            "start": r["start_verse"],
            "end": r["end_verse"],
            "status": r["status"],
            "tags": tags,
            "word_count": len(text.split()),
            "preview": preview,
            "audio": audio_rel,
            "created_at": r["created_at"],
        })

    _cache["data"] = sermons
    _cache["timestamp"] = now
    return sermons


def send_json(http_handler, data: dict):
    """Helper: write a JSON response from any handler method."""
    body = json.dumps(data, indent=2).encode("utf-8")
    http_handler.send_response(200)
    http_handler.send_header("Content-Type", "application/json")
    http_handler.send_header("Access-Control-Allow-Origin", "*")
    http_handler.send_header("Content-Length", len(body))
    http_handler.end_headers()
    http_handler.wfile.write(body)


def _get_sermon_by_id(sermon_id: int) -> dict | None:
    """Return a single sermon by ID with full text (not just preview)."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(script_dir, DB_PATH)
    if not os.path.exists(db_path):
        return None
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT * FROM sermons WHERE id = ?", (sermon_id,))
    r = cur.fetchone()
    conn.close()
    if not r:
        return None
    audio_rel = ""
    if r["audio_file_path"]:
        audio_name = os.path.basename(r["audio_file_path"])
        audio_rel = f"/audio/{audio_name}"
    tags = []
    try:
        tags = json.loads(r["tags"]) if r["tags"] else []
    except Exception:
        tags = []
    return {
        "id": r["id"],
        "title": r["title"],
        "passage": f"{r['book']} {r['chapter']}:{r['start_verse']}-{r['end_verse']}",
        "book": r["book"],
        "chapter": r["chapter"],
        "start": r["start_verse"],
        "end": r["end_verse"],
        "status": r["status"],
        "tags": tags,
        "word_count": len(r["sermon_text"].split()) if r["sermon_text"] else 0,
        "preview": r["sermon_text"] or "",  # Full text in preview field for this endpoint
        "audio": audio_rel,
        "created_at": r["created_at"],
    }


class PreechHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def do_GET(self):
        if self.path == "/":
            # Pre-load sermons into HTML for faster display
            sermons = get_sermons()
            preview_chunks = []
            for s in sermons[:3]:
                text_preview = (s.get("preview") or "")[:200]
                preview_chunks.append(f'<div class="sermon-preview">{text_preview}...</div>')
            html_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
            with open(html_path) as f:
                content = f.read()
            # Simple injection: replace empty sermons div with pre-loaded content
            content = content.replace('<div id="sermons"></div>',
                                      '<div id="sermons">' + "".join(preview_chunks) + '</div>')
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", len(content.encode("utf-8")))
            self.end_headers()
            self.wfile.write(content.encode("utf-8"))
            return
        if self.path == "/api/sermons":
            send_json(self, get_sermons())
        elif self.path == "/api/stats":
            sermons = get_sermons()
            send_json(self, {
                "total": len(sermons),
                "with_audio": sum(1 for s in sermons if s["audio"]),
                "current_passage": sermons[0]["passage"] if sermons else "N/A",
            })
        elif self.path.startswith("/api/sermon/"):
            # /api/sermon/<id> - return full sermon text
            try:
                sermon_id = int(self.path.split("/")[-1])
            except ValueError:
                send_json(self, {"error": "Invalid sermon ID"})
                return
            sermon = _get_sermon_by_id(sermon_id)
            if sermon:
                send_json(self, sermon)
            else:
                send_json(self, {"error": "Sermon not found"})
        elif self.path.startswith("/audio/"):
            # Serve audio files from ../audio/
            audio_name = self.path[len("/audio/"):]
            if ".." in audio_name or "/" in audio_name:
                send_json(self, {"error": "Invalid audio path"})
                return
            audio_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio", audio_name)
            if not os.path.exists(audio_path):
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"File not found")
                return
            ext = os.path.splitext(audio_path)[1].lower()
            mime = "audio/mpeg" if ext == ".mp3" else "audio/wav" if ext == ".wav" else "application/octet-stream"
            file_size = os.path.getsize(audio_path)
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", file_size)
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with open(audio_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            super().do_GET()

    def log_message(self, format, *args):
        # Only log non-API requests to keep output clean
        if "/api/" not in self.path:
            print(f"[{self.log_date_time_string()}] {args[0]}")


class ReuseTCPServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    print("PreechBot Frontend Server")
    print(f"  URL:       http://localhost:{PORT}")
    print(f"  Frontend:  index.html")
    print(f"  DB:        {DB_PATH}")
    print(f"  Audio:     ../audio/")
    print()
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with ReuseTCPServer(("", PORT), PreechHandler) as httpd:
        print(f"Listening on http://localhost:{PORT}")
        print("Open http://localhost:8080 in your browser")
        httpd.serve_forever()
