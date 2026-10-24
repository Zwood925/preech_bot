"""
Bible canon data and passage-chunking helpers for Preech Bot.

Contains all 66 books (Protestant canon) with per-chapter verse counts, testament,
genre, and genre-specific interpretive guidance for the sermon writer.

Run `python bible.py` to validate the data against known per-book verse totals and
print how many sermons the whole Bible will produce at the current chunk size.
"""

import json
import os
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Iterator, Optional

# Target verses per sermon. Chunks are balanced so a 31-verse chapter becomes
# 11/10/10 rather than 10/10/10/1.
CHUNK_TARGET = int(os.getenv("CHUNK_SIZE", "10"))


@dataclass(frozen=True)
class Book:
    name: str
    order: int
    testament: str  # "OT" | "NT"
    genre: str
    chapters: tuple  # verse count per chapter, index 0 = chapter 1


_RAW = [
    ("Genesis", "OT", "Law", [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26]),
    ("Exodus", "OT", "Law", [22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38]),
    ("Leviticus", "OT", "Law", [17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34]),
    ("Numbers", "OT", "Law", [54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13]),
    ("Deuteronomy", "OT", "Law", [46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12]),
    ("Joshua", "OT", "History", [18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33]),
    ("Judges", "OT", "History", [36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25]),
    ("Ruth", "OT", "History", [22,23,18,22]),
    ("1 Samuel", "OT", "History", [28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13]),
    ("2 Samuel", "OT", "History", [27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25]),
    ("1 Kings", "OT", "History", [53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53]),
    ("2 Kings", "OT", "History", [18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30]),
    ("1 Chronicles", "OT", "History", [54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30]),
    ("2 Chronicles", "OT", "History", [17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23]),
    ("Ezra", "OT", "History", [11,70,13,24,17,22,28,36,15,44]),
    ("Nehemiah", "OT", "History", [11,20,32,23,19,19,73,18,38,39,36,47,31]),
    ("Esther", "OT", "History", [22,23,15,17,14,14,10,17,32,3]),
    ("Job", "OT", "Poetry & Wisdom", [22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17]),
    ("Psalms", "OT", "Poetry & Wisdom", [6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6]),
    ("Proverbs", "OT", "Poetry & Wisdom", [33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31]),
    ("Ecclesiastes", "OT", "Poetry & Wisdom", [18,26,22,16,20,12,29,17,18,20,10,14]),
    ("Song of Solomon", "OT", "Poetry & Wisdom", [17,17,11,16,16,13,13,14]),
    ("Isaiah", "OT", "Prophecy", [31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24]),
    ("Jeremiah", "OT", "Prophecy", [19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34]),
    ("Lamentations", "OT", "Prophecy", [22,22,66,22,22]),
    ("Ezekiel", "OT", "Prophecy", [28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35]),
    ("Daniel", "OT", "Prophecy", [21,49,30,37,31,28,28,27,27,21,45,13]),
    ("Hosea", "OT", "Prophecy", [11,23,5,19,15,11,16,14,17,15,12,14,16,9]),
    ("Joel", "OT", "Prophecy", [20,32,21]),
    ("Amos", "OT", "Prophecy", [15,16,15,13,27,14,17,14,15]),
    ("Obadiah", "OT", "Prophecy", [21]),
    ("Jonah", "OT", "Prophecy", [17,10,10,11]),
    ("Micah", "OT", "Prophecy", [16,13,12,13,15,16,20]),
    ("Nahum", "OT", "Prophecy", [15,13,19]),
    ("Habakkuk", "OT", "Prophecy", [17,20,19]),
    ("Zephaniah", "OT", "Prophecy", [18,15,20]),
    ("Haggai", "OT", "Prophecy", [15,23]),
    ("Zechariah", "OT", "Prophecy", [21,13,10,14,11,15,14,23,17,12,17,14,9,21]),
    ("Malachi", "OT", "Prophecy", [14,17,18,6]),
    ("Matthew", "NT", "Gospel", [25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20]),
    ("Mark", "NT", "Gospel", [45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20]),
    ("Luke", "NT", "Gospel", [80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53]),
    ("John", "NT", "Gospel", [51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25]),
    ("Acts", "NT", "History", [26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31]),
    ("Romans", "NT", "Epistle", [32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27]),
    ("1 Corinthians", "NT", "Epistle", [31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24]),
    ("2 Corinthians", "NT", "Epistle", [24,17,18,18,21,18,16,24,15,18,33,21,14]),
    ("Galatians", "NT", "Epistle", [24,21,29,31,26,18]),
    ("Ephesians", "NT", "Epistle", [23,22,21,32,33,24]),
    ("Philippians", "NT", "Epistle", [30,30,21,23]),
    ("Colossians", "NT", "Epistle", [29,23,25,18]),
    ("1 Thessalonians", "NT", "Epistle", [10,20,13,18,28]),
    ("2 Thessalonians", "NT", "Epistle", [12,17,18]),
    ("1 Timothy", "NT", "Epistle", [20,15,16,16,25,21]),
    ("2 Timothy", "NT", "Epistle", [18,26,17,22]),
    ("Titus", "NT", "Epistle", [16,15,15]),
    ("Philemon", "NT", "Epistle", [25]),
    ("Hebrews", "NT", "Epistle", [14,18,19,16,14,20,28,13,28,39,40,29,25]),
    ("James", "NT", "Epistle", [27,26,18,17,20]),
    ("1 Peter", "NT", "Epistle", [25,25,22,19,14]),
    ("2 Peter", "NT", "Epistle", [21,22,18]),
    ("1 John", "NT", "Epistle", [10,29,24,21,21]),
    ("2 John", "NT", "Epistle", [13]),
    ("3 John", "NT", "Epistle", [14]),
    ("Jude", "NT", "Epistle", [25]),
    ("Revelation", "NT", "Apocalyptic", [20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21]),
]

CANON: list[Book] = [Book(n, i + 1, t, g, tuple(c)) for i, (n, t, g, c) in enumerate(_RAW)]
BOOKS_BY_NAME: dict[str, Book] = {b.name: b for b in CANON}

_ALIASES = {
    "psalm": "Psalms",
    "song of songs": "Song of Solomon",
    "songs of solomon": "Song of Solomon",
    "canticles": "Song of Solomon",
    "revelations": "Revelation",
    "revelation of john": "Revelation",
    "the revelation": "Revelation",
    "the acts": "Acts",
    "acts of the apostles": "Acts",
}


def resolve_book(name: str) -> Optional[Book]:
    """Resolve a user/LLM-supplied book name ('1st John', 'psalm', ...) to a Book."""
    if not name:
        return None
    key = " ".join(name.lower().replace(".", " ").split())
    for prefix, digit in (("first ", "1 "), ("second ", "2 "), ("third ", "3 "),
                          ("1st ", "1 "), ("2nd ", "2 "), ("3rd ", "3 ")):
        if key.startswith(prefix):
            key = digit + key[len(prefix):]
    key = _ALIASES.get(key, key)
    for b in CANON:
        if b.name.lower() == key:
            return b
    return None


def verse_count(book: str, chapter: int) -> int:
    b = BOOKS_BY_NAME[book]
    if chapter < 1 or chapter > len(b.chapters):
        raise ValueError(f"{book} has no chapter {chapter}")
    return b.chapters[chapter - 1]


def chunk_end(book: str, chapter: int, start: int, target: int = CHUNK_TARGET) -> int:
    """
    Last verse of the sermon beginning at `start`. Remaining verses in the chapter are
    split evenly into round(remaining / target) sermons so we never get 1-verse tails.
    """
    total = verse_count(book, chapter)
    remaining = total - start + 1
    n = max(1, int(remaining / target + 0.5))
    size = -(-remaining // n)  # ceil
    return min(total, start + size - 1)


def next_passage_after(book: str, chapter: int, last_end_verse: int) -> Optional[tuple]:
    """(book, chapter, start_verse) following the given position, rolling into the next
    chapter / next book. Returns None once Revelation 22 is finished."""
    b = BOOKS_BY_NAME[book]
    if last_end_verse < verse_count(book, chapter):
        return book, chapter, last_end_verse + 1
    if chapter < len(b.chapters):
        return book, chapter + 1, 1
    if b.order >= len(CANON):
        return None
    return CANON[b.order].name, 1, 1  # CANON[b.order] is the next book (order is 1-based)


def iter_all_passages(target: int = CHUNK_TARGET) -> Iterator[tuple]:
    """Yield (book, chapter, start, end) for every sermon in the whole Bible."""
    for b in CANON:
        for ch in range(1, len(b.chapters) + 1):
            start = 1
            total = b.chapters[ch - 1]
            while start <= total:
                end = chunk_end(b.name, ch, start, target)
                yield b.name, ch, start, end
                start = end + 1


GENRE_GUIDANCE = {
    "Law": (
        "This is Torah: a mix of narrative and instruction. In narrative, track what the story is "
        "quietly teaching about God's character, covenant and promise, and notice how the narrator "
        "withholds judgment and lets details speak. In laws, ask what the law reveals about God's "
        "holiness and about the world of ancient Israel, and how Jesus and the apostles read it. "
        "Never flatten a law into a moral platitude; show what problem it solved for its first audience."
    ),
    "History": (
        "This is Israelite or early-church historical narrative. Read it as theologically shaped storytelling: "
        "notice repetition, the narrator's quiet evaluations ('in those days there was no king'), and "
        "contrasts between characters. Do not treat every character action as a model to copy; ask "
        "what the narrator wants the original audience to see about God and his purposes."
    ),
    "Poetry & Wisdom": (
        "This is Hebrew poetry or wisdom literature. Honor the poetic form: parallelism (the second line "
        "echoes, intensifies or contrasts the first), imagery and metaphor, and in Psalms the "
        "emotional movement from lament to trust or praise. Proverbs are general patterns, not promises; "
        "Job and Ecclesiastes wrestle honestly with suffering and meaning. Do not read the imagery woodenly."
    ),
    "Prophecy": (
        "This is prophetic literature. First recover what the prophet said to his own audience: the "
        "covenant lawsuit, the historical crisis (Assyria, Babylon, return), and the specific sins and "
        "hopes addressed. Then show how the New Testament picks it up. Hear the poetry and the "
        "symbolic acts. Avoid speculative end-times charts."
    ),
    "Gospel": (
        "This is a Gospel. Attend to what this particular evangelist is doing: his selection, ordering, "
        "and emphasis, and how the scene fits his larger portrait of Jesus. Place the scene in its "
        "first-century Jewish and Roman context (honor and shame, Temple, purity, Messianic hope), "
        "and notice the Old Testament texts echoing underneath."
    ),
    "Epistle": (
        "This is a letter. Reconstruct the situation behind it (who is writing, to whom, what prompted it) "
        "and follow the flow of the argument: what each 'therefore' and 'for' is doing. Distinguish "
        "what Paul or the other author was correcting from what he was affirming, and show how "
        "doctrine drives the commands."
    ),
    "Apocalyptic": (
        "This is apocalyptic literature. Read the symbols as symbols, drawing on their Old Testament sources "
        "(Daniel, Ezekiel, Exodus, the Temple) and on what the first-century churches under Rome "
        "needed to hear. Emphasize the unveiling of Christ's victory and call to faithful endurance, "
        "not date-setting or speculative timelines."
    ),
}


def fetch_passage_text(book: str, chapter: int, start: int, end: int, translation: str = "web") -> str:
    """
    Fetch the actual verse text from bible-api.com (public-domain World English Bible by
    default) so the sermon quotes real scripture instead of recalling it from memory.
    Returns "" on failure; the pipeline degrades gracefully.
    """
    ref = f"{book} {chapter}:{start}-{end}"
    url = f"https://bible-api.com/{urllib.parse.quote(ref)}?translation={translation}"
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "preech-bot/1.0"})
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            verses = data.get("verses") or []
            if not verses:
                return (data.get("text") or "").strip()
            return "\n".join(f"{v['verse']}. {' '.join(v['text'].split())}" for v in verses)
        except Exception as e:  # network, rate limit, bad ref
            print(f"  [Passage Text] attempt {attempt + 1} failed for {ref}: {e}")
    return ""


# Known per-book verse totals (standard Protestant versification) used for validation.
_KNOWN_TOTALS = {
    "Genesis": 1533, "Exodus": 1213, "Leviticus": 859, "Numbers": 1288, "Deuteronomy": 959,
    "Joshua": 658, "Judges": 618, "Ruth": 85, "1 Samuel": 810, "2 Samuel": 695, "1 Kings": 816,
    "2 Kings": 719, "1 Chronicles": 942, "2 Chronicles": 822, "Ezra": 280, "Nehemiah": 406,
    "Esther": 167, "Job": 1070, "Psalms": 2461, "Proverbs": 915, "Ecclesiastes": 222,
    "Song of Solomon": 117, "Isaiah": 1292, "Jeremiah": 1364, "Lamentations": 154, "Ezekiel": 1273,
    "Daniel": 357, "Hosea": 197, "Joel": 73, "Amos": 146, "Obadiah": 21, "Jonah": 48, "Micah": 105,
    "Nahum": 47, "Habakkuk": 56, "Zephaniah": 53, "Haggai": 38, "Zechariah": 211, "Malachi": 55,
    "Matthew": 1071, "Mark": 678, "Luke": 1151, "John": 879, "Acts": 1007, "Romans": 433,
    "1 Corinthians": 437, "2 Corinthians": 257, "Galatians": 149, "Ephesians": 155,
    "Philippians": 104, "Colossians": 95, "1 Thessalonians": 89, "2 Thessalonians": 47,
    "1 Timothy": 113, "2 Timothy": 83, "Titus": 46, "Philemon": 25, "Hebrews": 303, "James": 108,
    "1 Peter": 105, "2 Peter": 61, "1 John": 105, "2 John": 13, "3 John": 14, "Jude": 25,
    "Revelation": 404,
}


def validate() -> bool:
    ok = True
    for b in CANON:
        got, want = sum(b.chapters), _KNOWN_TOTALS[b.name]
        if got != want:
            ok = False
            print(f"  MISMATCH {b.name}: have {got} verses, expected {want}")
    total = sum(sum(b.chapters) for b in CANON)
    print(f"Books: {len(CANON)} | Verses: {total} (expected 31102) | {'OK' if ok and total == 31102 else 'CHECK DATA'}")
    return ok and total == 31102


if __name__ == "__main__":
    validate()
    passages = list(iter_all_passages())
    print(f"Chunk target {CHUNK_TARGET} verses -> {len(passages)} sermons for the whole Bible.")
    for per_day in (1, 2, 3, 5):
        print(f"  at {per_day}/day: {len(passages) / per_day / 365:.1f} years")
