"""
Preech Bot - Main Engine Runner
===============================
Walks sequentially through scripture, generates full sermon scripts via OpenRouter,
renders full-length chunked audio via Kokoro ONNX, and logs results to SQLite.
"""

import os
import sys
import re
from datetime import datetime
from database import SermonLog
from agents import generate_full_sermon_script
from tts import generate_audio

GENESIS_VERSE_COUNTS = {
    1: 31, 2: 25, 3: 24, 4: 26, 5: 32, 6: 22, 7: 24, 8: 22, 9: 29, 10: 32,
    11: 32, 12: 20, 13: 18, 14: 24, 15: 21, 16: 16, 17: 27, 18: 33, 19: 38, 20: 18,
    21: 34, 22: 24, 23: 20, 24: 67, 25: 18, 26: 35, 27: 46, 28: 22, 29: 35, 30: 43,
    31: 55, 32: 32, 33: 20, 34: 31, 35: 29, 36: 43, 37: 36, 38: 30, 39: 23, 40: 23,
    41: 57, 42: 38, 43: 34, 44: 34, 45: 28, 46: 34, 47: 31, 48: 22, 49: 33, 50: 26,
}

DEFAULT_CHUNK_SIZE = 10  # verses per sermon


def get_next_passage(db: SermonLog) -> tuple:
    """Determine next passage to preach on, starting at Genesis 10:1."""
    last = db.get_last_progression()

    if not last:
        return "Genesis", 10, 1

    book, chapter, last_end_verse = last
    max_verse = GENESIS_VERSE_COUNTS.get(chapter, 30)
    next_start = last_end_verse + 1

    if next_start > max_verse:
        next_chapter = chapter + 1
        if next_chapter > 50:
            return None
        return "Genesis", next_chapter, 1

    return book, chapter, next_start


def get_passage_ref(book: str, chapter: int, start: int, end: int) -> str:
    return f"{book} {chapter}:{start}-{end}"


def generate_sermon(passage_ref: str, book: str, chapter: int, start_v: int, end_v: int, db: SermonLog, audio_dir: str = "./audio") -> dict:
    """Runs text drafting + phonetic sanitization + audio chunk stitching."""
    print(f"\n{'='*60}")
    print(f"  --> Generating complete sermon for: {passage_ref}")
    print(f"{'='*60}")

# Step 1: OpenRouter Script Generation
    title, sermon_text = generate_full_sermon_script(passage_ref)
    word_count = len(sermon_text.split())

    print(f"\n=== Sermon Generated: '{title}' ===")
    print(f"Word Count: {word_count} words")
    print(f"Preview: {sermon_text[:180]}...\n")

    # Step 2: Audio Chunking & Rendering
    print("--> Rendering audio via Kokoro ONNX...")
    audio_file = generate_audio(sermon_text, passage_ref, audio_dir)
    status = "COMPLETE" if audio_file else "TTS_FAILED"

    # Step 3: Save to Database
    sermon_id = db.add_sermon(
        title=title,
        book=book,
        chapter=chapter,
        start_verse=start_v,
        end_verse=end_v,
        sermon_text=sermon_text,
        audio_file_path=audio_file,
        status=status,
        tags=[book, f"Chapter {chapter}"]
    )
    
    # Step 4: Update Scripture Progression
    db.update_progression(book, chapter, end_v)

    return {
        "id": sermon_id,
        "passage": passage_ref,
        "words": word_count,
        "audio": audio_file,
        "status": status,
    }


def run_single(passage_ref: str):
    """Generates a single sermon for testing."""
    db = SermonLog()
    match = re.match(r"(\w+)\s+(\d+):(\d+)-(\d+)", passage_ref)
    if not match:
        print(f"Invalid reference format: {passage_ref}. Use 'Genesis 11:1-9'")
        return

    book, chapter, start_v, end_v = match.groups()
    result = generate_sermon(passage_ref, book, int(chapter), int(start_v), int(end_v), db)
    print(f"\n[Success] Processed sermon #{result['id']}: {result['passage']} ({result['words']} words)")
    print(f"Audio file saved to: {result['audio']}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Preech Bot Engine")
    parser.add_argument("--single", type=str, help="Generate a single sermon (e.g. 'Genesis 11:1-9')")
    args = parser.parse_args()

    if args.single:
        run_single(args.single)
    else:
        print("Usage: python3 main.py --single 'Genesis 11:1-9'")