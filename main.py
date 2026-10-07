"""
Preech Bot - Nightly Sermon Generator
=====================================
Generates 3-5 sermons per night, walking sequentially through Genesis starting at chapter 10.
Saves text + audio to SQLite, logs to file for morning review.
"""

import sys
import json
import random
import subprocess
from datetime import datetime
from crewai import Crew, Process
from database import SermonLog
from agents import hook_agent, exegesis_agent, writer_agent
from tasks import create_hook_task, create_exegesis_task, create_sermon_writing_task


# Genesis 10 verse counts (approximate, for sequential progression)
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

    if next_start + DEFAULT_CHUNK_SIZE - 1 > max_verse:
        next_chapter = chapter + 1
        if next_chapter > 50:
            return None
        return "Genesis", next_chapter, 1

    return book, chapter, next_start


def get_passage_ref(book: str, chapter: int, start: int, end: int) -> str:
    return f"{book} {chapter}:{start}-{end}"


def generate_sermon(passage_ref: str, book: str, chapter: int, start_v: int, end_v: int, db: SermonLog, audio_dir: str, tts_engine: str = "kokoro") -> dict:
    """Run the CrewAI pipeline for one sermon passage."""
    print(f"\n{'='*60}")
    print(f"  --> Generating sermon for: {passage_ref}")
    print(f"{'='*60}")

    hook_task = create_hook_task(hook_agent, passage_ref)
    exegesis_task = create_exegesis_task(exegesis_agent, passage_ref)
    writing_task = create_sermon_writing_task(writer_agent, passage_ref, [hook_task, exegesis_task])

    preech_crew = Crew(
        agents=[hook_agent, exegesis_agent, writer_agent],
        tasks=[hook_task, exegesis_task, writing_task],
        process=Process.sequential,
        verbose=True
    )

    print(f"--> Kicking off CrewAI generation for {passage_ref}...")
    result = preech_crew.kickoff()
    sermon_text = str(result)

    print(f"\n=== Sermon Generated ===")
    print(f"Length: {len(sermon_text.split())} words")
    print(f"Preview: {sermon_text[:200]}...")

    # Generate audio
    audio_file = ""
    audio_status = ""
    try:
        from tts import generate_audio
        audio_file = generate_audio(sermon_text, passage_ref, audio_dir, engine=tts_engine)
        audio_status = "COMPLETE"
        print(f"--> Audio generated: {audio_file}")
    except Exception as e:
        audio_status = f"TTS_FAILED: {e}"
        print(f"--> TTS failed: {e}")

    # Auto-tag based on content keywords
    tags = _auto_tag(sermon_text, book, chapter)

    # Save to DB
    sermon_id = db.add_sermon(
        title=f"Study on {passage_ref}",
        book=book,
        chapter=chapter,
        start_verse=start_v,
        end_verse=end_v,
        sermon_text=sermon_text,
        audio_file_path=audio_file,
        status=audio_status,
        tags=tags
    )

    # Update progression
    db.update_progression(book, chapter, end_v)

    return {
        "id": sermon_id,
        "passage": passage_ref,
        "words": len(sermon_text.split()),
        "audio": audio_file if audio_file else "N/A",
        "status": audio_status,
        "tags": tags,
    }


def _auto_tag(text: str, book: str, chapter: int) -> list:
    """Auto-generate tags based on sermon content keywords."""
    text_lower = text.lower()
    tags = [book]

    keyword_map = {
        "creation": ["creation", "beginning", "made", "formed", "garden"],
        "family": ["family", "children", "marriage", "wife", "husband", "son", "daughter"],
        "faith": ["faith", "believe", "trust", "obey", "covenant"],
        "sin": ["sin", "fall", "disobey", "temptation", "evil"],
        "judgment": ["judgment", "flood", "destroy", "punish", "wrath"],
        "promises": ["promise", "blessing", "descendants", "seed"],
        "leadership": ["lead", "ruler", "king", "servant", "authority"],
        "salvation": ["save", "redeem", "rescue", "deliver"],
        "Providence": ["providence", "hand of god", "guide", "plan"],
        "worship": ["worship", "praise", "glory", "honor"],
        "covenant": ["covenant", "sign", "promise", "everlasting"],
    }

    for tag, keywords in keyword_map.items():
        if any(kw in text_lower for kw in keywords):
            tags.append(tag)

    # Add chapter-based tags
    if book == "Genesis":
        if 1 <= chapter <= 3:
            tags.append("Creation & Fall")
        elif 4 <= chapter <= 11:
            tags.append("Patriarchs-Early")
        elif 12 <= chapter <= 25:
            tags.append("Abraham")
        elif 26 <= chapter <= 35:
            tags.append("Isaac & Jacob")
        elif 36 <= chapter <= 50:
            tags.append("Joseph")

    return list(set(tags))  # deduplicate


def run_nightly(n_sermons: int = 4, tts_engine: str = "kokoro", audio_dir: str = "./audio"):
    """Main nightly run: generate n sermons starting from where we left off."""
    import os
    os.makedirs(audio_dir, exist_ok=True)

    log_lines = []
    log_lines.append(f"\n{'='*70}")
    log_lines.append(f"PREECH BOT NIGHTLY RUN - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log_lines.append(f"{'='*70}")

    db = SermonLog()

    results = []
    for i in range(n_sermons):
        passage = get_next_passage(db)
        if passage is None:
            log_lines.append(f"Reached end of Genesis at sermon {i}. Stopping.")
            break

        book, chapter, start_v = passage
        end_v = min(start_v + DEFAULT_CHUNK_SIZE - 1, GENESIS_VERSE_COUNTS.get(chapter, start_v + DEFAULT_CHUNK_SIZE - 1))
        passage_ref = get_passage_ref(book, chapter, start_v, end_v)

        result = generate_sermon(passage_ref, book, chapter, start_v, end_v, db, audio_dir, tts_engine)
        results.append(result)
        log_lines.append(f"  [{i+1}/{n_sermons}] {passage_ref} | {result['words']} words | Audio: {result['audio']} | Tags: {result['tags']}")

    # Write log
    log_file = f"preech_log_{datetime.now().strftime('%Y-%m-%d')}.txt"
    with open(log_file, "a") as f:
        f.write("\n".join(log_lines))
        f.write(f"\nTotal sermons generated: {len(results)}\n")

    log_lines.append(f"\nTotal sermons: {len(results)}")
    log_lines.append(f"Log saved to: {log_file}")

    print("\n".join(log_lines))
    return results


def run_single(passage_ref: str, tts_engine: str = "kokoro"):
    """Run a single sermon for a specific passage (for testing)."""
    db = SermonLog()

    # Parse "Genesis 10:1-10" style reference
    import re
    match = re.match(r"(\w+)\s+(\d+):(\d+)-(\d+)", passage_ref)
    if not match:
        print(f"Invalid passage format: {passage_ref}")
        return

    book, chapter, start_v, end_v = match.groups()
    chapter, start_v, end_v = int(chapter), int(start_v), int(end_v)

    result = generate_sermon(passage_ref, book, chapter, start_v, end_v, db, "./audio", tts_engine)
    return result


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Preech Bot - Sermon Generator")
    parser.add_argument("--single", type=str, help="Generate a single sermon for a passage (e.g. 'Genesis 10:1-10')")
    parser.add_argument("--nightly", action="store_true", help="Run the nightly multi-sermon generation")
    parser.add_argument("--count", type=int, default=4, help="Number of sermons to generate in nightly mode (default: 4)")
    parser.add_argument("--tts", type=str, default="kokoro", choices=["kokoro", "xtts"], help="TTS engine to use")
    args = parser.parse_args()

    if args.single:
        run_single(args.single, tts_engine=args.tts)
    elif args.nightly:
        run_nightly(n_sermons=args.count, tts_engine=args.tts)
    else:
        print("Use --single 'Genesis 10:1-10' or --nightly")
        parser.print_help()
