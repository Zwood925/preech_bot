"""
Backfill categorisation metadata for sermons created before the metadata migration.

  python backfill.py               # free: fills testament / genre / book_order / word_count and base tags
  python backfill.py --metadata    # also LLM-generates summary + themes + keywords and RE-EMBEDS (small cost)
  python backfill.py --metadata --limit 50
"""

import argparse

from agents import generate_metadata
from bible import resolve_book
from database import SermonLog, build_embedding_text, generate_embedding


def backfill_structural(db: SermonLog) -> int:
    done = 0
    while True:
        resp = db.client.table("sermons").select("id, book, chapter, sermon_text, tags") \
            .is_("testament", "null").order("id").limit(200).execute()
        rows = resp.data or []
        if not rows:
            return done
        for r in rows:
            book = resolve_book(r["book"])
            if not book:
                print(f"  Skipping #{r['id']}: unknown book {r['book']!r}")
                # mark so we don't loop forever
                db.update_sermon(r["id"], {"testament": "??"})
                continue
            tags = list(r.get("tags") or [])
            for t in (book.name, book.genre, book.testament, f"Chapter {r['chapter']}"):
                if t not in tags:
                    tags.append(t)
            db.update_sermon(r["id"], {
                "testament": book.testament, "genre": book.genre, "book_order": book.order,
                "word_count": len((r.get("sermon_text") or "").split()), "tags": tags,
            })
            done += 1
        print(f"  structural backfill: {done} rows")


def backfill_llm(db: SermonLog, limit: int) -> int:
    done = 0
    while done < limit:
        resp = db.client.table("sermons").select("id, title, passage_ref, sermon_text, tags") \
            .is_("summary", "null").order("id").limit(min(25, limit - done)).execute()
        rows = resp.data or []
        if not rows:
            break
        for r in rows:
            meta = generate_metadata(r["title"], r["passage_ref"], r["sermon_text"])
            tags = list(r.get("tags") or [])
            for t in meta["themes"] + meta["keywords"]:
                if t not in tags:
                    tags.append(t)
            fields = {"summary": meta["summary"] or r["title"], "tags": tags}
            vec = generate_embedding(build_embedding_text(
                r["title"], r["passage_ref"], meta["summary"], meta["themes"], meta["keywords"], r["sermon_text"]))
            if vec:
                fields["embedding"] = vec
            db.update_sermon(r["id"], fields)
            done += 1
            print(f"  #{r['id']} {r['passage_ref']}: {', '.join(meta['themes'])}")
    return done


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--metadata", action="store_true", help="Also generate LLM summaries/themes and re-embed")
    ap.add_argument("--limit", type=int, default=100000)
    args = ap.parse_args()
    db = SermonLog()
    print(f"Structural backfill complete: {backfill_structural(db)} rows updated.")
    if args.metadata:
        print(f"LLM metadata backfill complete: {backfill_llm(db, args.limit)} rows updated.")
