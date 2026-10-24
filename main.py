"""
Preech Bot - Main Engine Runner
===============================
Walks sequentially through the ENTIRE Bible (Genesis -> Revelation), generates full sermon scripts via
OpenRouter, renders audio via Kokoro ONNX, and logs results (with search metadata) to Supabase.

Examples:
  python main.py --auto 2                 # next two studies in canonical order (what the daily workflow runs)
  python main.py --status                 # where are we, how much is left
  python main.py --audit                  # verses skipped before the current position (e.g. old data bugs)
  python main.py --fill-gaps 3            # generate up to 3 of the skipped passages (does not move the bookmark)
  python main.py --single "John 1:1-14"   # one-off study; add --advance to also move the progression bookmark
  python main.py --auto 1 --no-audio      # skip TTS (cheap test of the text pipeline)
"""

import re
import sys

from agents import generate_full_sermon_script
from bible import (
    CANON, BOOKS_BY_NAME, CHUNK_TARGET, chunk_end, fetch_passage_text, iter_all_passages,
    next_passage_after, resolve_book, verse_count,
)
from database import SermonLog, build_embedding_text
from tts import generate_audio


def get_next_passage(db: SermonLog):
    """Next (book, chapter, start_verse) in canonical order, or None when Revelation is finished."""
    last = db.get_last_progression()
    if not last:
        return "Genesis", 1, 1

    book, chapter, last_end_verse = last
    resolved = resolve_book(book)
    if not resolved:
        raise ValueError(f"Progression table contains an unknown book name: {book!r}")
    book = resolved.name
    chapter = min(chapter, len(resolved.chapters))
    return next_passage_after(book, chapter, last_end_verse)


def generate_sermon(book: str, chapter: int, start_v: int, end_v: int, db: SermonLog,
                    audio_dir: str = "./audio", update_progress: bool = True, with_audio: bool = True) -> dict:
    """Runs research + drafting + pronunciation + metadata, renders audio, saves to the database."""
    passage_ref = f"{book} {chapter}:{start_v}-{end_v}"
    meta = BOOKS_BY_NAME[book]
    print(f"\n{'=' * 60}\n  --> Generating study for: {passage_ref}  [{meta.testament} / {meta.genre}]\n{'=' * 60}")

    passage_text = fetch_passage_text(book, chapter, start_v, end_v)
    if not passage_text:
        print("  [Warning] Could not fetch verse text; the model will work from memory.")
    prev_context = db.get_previous_context(book)

    pkg = generate_full_sermon_script(book, chapter, start_v, end_v,
                                      passage_text=passage_text, prev_context=prev_context)
    print(f"\n=== Study Generated: '{pkg['title']}' ({pkg['word_count']} words) ===")
    print(f"Summary: {pkg['summary']}")
    print(f"Themes: {', '.join(pkg['themes'])}")
    print(f"Preview: {pkg['sermon_text'][:180]}...\n")

    audio_file = ""
    if with_audio:
        print("--> Rendering audio via Kokoro ONNX...")
        audio_file = generate_audio(pkg["tts_text"], passage_ref, audio_dir)
        status = "COMPLETE" if audio_file else "TTS_FAILED"
    else:
        status = "NO_AUDIO"

    tags = [book, meta.genre, meta.testament, f"Chapter {chapter}"] + pkg["themes"] + pkg["keywords"]
    sermon_id = db.add_sermon(
        title=pkg["title"], book=book, chapter=chapter, start_verse=start_v, end_verse=end_v,
        sermon_text=pkg["sermon_text"], audio_file_path=audio_file, status=status, tags=tags,
        summary=pkg["summary"], testament=meta.testament, genre=meta.genre, book_order=meta.order,
        word_count=pkg["word_count"], research=pkg["research"],
        embedding_text=build_embedding_text(pkg["title"], passage_ref, pkg["summary"], pkg["themes"],
                                            pkg["keywords"], pkg["sermon_text"]),
    )

    if update_progress:
        db.update_progression(book, chapter, end_v)

    return {"id": sermon_id, "passage": passage_ref, "words": pkg["word_count"], "audio": audio_file, "status": status}


def run_single(passage_ref: str, advance: bool, with_audio: bool):
    db = SermonLog()
    match = re.match(r"^\s*(.+?)\s+(\d+):(\d+)(?:-(\d+))?\s*$", passage_ref)
    if not match:
        print(f"Invalid reference format: {passage_ref}. Use 'Genesis 11:1-9'")
        return
    name, chapter, start_v, end_v = match.groups()
    book = resolve_book(name)
    if not book:
        print(f"Unknown book: {name}")
        return
    chapter, start_v = int(chapter), int(start_v)
    end_v = int(end_v) if end_v else start_v
    end_v = min(end_v, verse_count(book.name, chapter))
    result = generate_sermon(book.name, chapter, start_v, end_v, db, update_progress=advance, with_audio=with_audio)
    print(f"\n[Success] Processed study #{result['id']}: {result['passage']} ({result['words']} words)")
    print(f"Audio file saved to: {result['audio']}")


def run_auto(count: int, with_audio: bool):
    """Generate the next N studies in canonical order, stopping cleanly at the end of Revelation."""
    db = SermonLog()
    for _ in range(count):
        next_pass = get_next_passage(db)
        if not next_pass:
            print("[Auto Progression] The whole Bible is complete. Genesis through Revelation: done!")
            return
        book, chapter, start_v = next_pass
        end_v = chunk_end(book, chapter, start_v)
        try:
            result = generate_sermon(book, chapter, start_v, end_v, db, with_audio=with_audio)
        except Exception as e:
            # Progression only advances after a successful save, so the next run retries this passage.
            print(f"[Auto Error] {book} {chapter}:{start_v}-{end_v} failed: {e}")
            sys.exit(1)
        print(f"\n[Auto Success] Processed study #{result['id']}: {result['passage']} ({result['words']} words)")


# ------------------------------------------------------------------------------------------
# Coverage tools
# ------------------------------------------------------------------------------------------

def _frontier(db: SermonLog):
    last = db.get_last_progression()
    if not last:
        return None
    book = resolve_book(last[0])
    return (book.order, last[1], last[2]) if book else None


def find_gaps(db: SermonLog) -> list[tuple]:
    """Uncovered passages BEFORE the current progression position, as (book, chapter, start, end)."""
    frontier = _frontier(db)
    if not frontier:
        return []
    covered: dict = {}
    for book, ch, s, e in db.get_all_sermon_ranges():
        covered.setdefault((book, ch), set()).update(range(s, e + 1))

    gaps = []
    for b in CANON:
        for ch in range(1, len(b.chapters) + 1):
            missing = [v for v in range(1, b.chapters[ch - 1] + 1)
                       if (b.order, ch, v) <= frontier and v not in covered.get((b.name, ch), set())]
            # group into contiguous runs, then split long runs into sermon-sized pieces
            run = []
            for v in missing + [None]:
                if run and (v is None or v != run[-1] + 1):
                    n = max(1, int(len(run) / CHUNK_TARGET + 0.5))
                    size = -(-len(run) // n)
                    for i in range(0, len(run), size):
                        piece = run[i:i + size]
                        gaps.append((b.name, ch, piece[0], piece[-1]))
                    run = []
                if v is not None:
                    run.append(v)
    return gaps


def run_status():
    db = SermonLog()
    total_sermons = sum(1 for _ in iter_all_passages())
    ranges = db.get_all_sermon_ranges()
    covered_verses = set()
    for book, ch, s, e in ranges:
        covered_verses.update((book, ch, v) for v in range(s, e + 1))
    total_verses = sum(sum(b.chapters) for b in CANON)
    nxt = get_next_passage(db)
    print(f"Studies in database: {len(ranges)} of ~{total_sermons} planned for the whole Bible")
    print(f"Verses covered: {len(covered_verses)} / {total_verses} ({100 * len(covered_verses) / total_verses:.1f}%)")
    print(f"Next passage: {'COMPLETE' if not nxt else f'{nxt[0]} {nxt[1]}:{nxt[2]}'}")
    remaining = max(0, total_sermons - len(ranges))
    for per_day in (1, 2, 3):
        print(f"  At {per_day}/day, ~{remaining / per_day / 365:.1f} years remaining")


def run_audit():
    gaps = find_gaps(SermonLog())
    if not gaps:
        print("No gaps: every verse before the current position has a study.")
        return
    print(f"{len(gaps)} skipped passage(s) found before the current position:")
    for book, ch, s, e in gaps:
        print(f"  {book} {ch}:{s}-{e}")
    print("Generate them with: python main.py --fill-gaps N")


def run_fill_gaps(count: int, with_audio: bool):
    db = SermonLog()
    for book, ch, s, e in find_gaps(db)[:count]:
        generate_sermon(book, ch, s, e, db, update_progress=False, with_audio=with_audio)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Preech Bot Engine")
    parser.add_argument("--single", type=str, help="Generate one study (e.g. 'John 1:1-14')")
    parser.add_argument("--advance", action="store_true", help="With --single: also move the progression bookmark")
    parser.add_argument("--auto", type=int, nargs="?", const=1, help="Generate the next N studies in order (default 1)")
    parser.add_argument("--status", action="store_true", help="Show progress through the Bible")
    parser.add_argument("--audit", action="store_true", help="List skipped passages before the current position")
    parser.add_argument("--fill-gaps", type=int, nargs="?", const=1, help="Generate up to N skipped passages")
    parser.add_argument("--no-audio", action="store_true", help="Skip text-to-speech")
    args = parser.parse_args()
    audio = not args.no_audio

    if args.status:
        run_status()
    elif args.audit:
        run_audit()
    elif args.fill_gaps is not None:
        run_fill_gaps(args.fill_gaps, audio)
    elif args.single:
        run_single(args.single, args.advance, audio)
    elif args.auto is not None:
        run_auto(args.auto, audio)
    else:
        parser.print_help()
