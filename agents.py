"""
OpenRouter generation pipeline for Preech Bot.

Stages (each can use a different model; see the env vars below):

  1. RESEARCH  - A "biblical languages scholar" prompt mines the passage for the handful of original-language
                 insights that genuinely change how the verse is heard (concrete imagery, English flattening,
                 canonical echoes, wordplay/grammar, cultural practice) and rates its own confidence.
  2. DRAFT     - A pastor-teacher prompt writes the spoken sermon around that dossier using a
                 Picture -> Pivot -> Press pattern for every word study.
  3. PRONOUNCE - A cheap model returns a JSON {term: respelling} map. We apply it ONLY to the text sent to the
                 TTS engine, so the on-screen transcript keeps clean spellings and a long sermon can never be
                 truncated by a "rewrite the whole thing" pass.
  4. METADATA  - A cheap model produces a summary + themes + keywords for search, categorisation and plans.

Environment variables (all optional):
  RESEARCH_MODEL   default anthropic/claude-sonnet-4.5
  DRAFT_MODEL      default anthropic/claude-sonnet-4.5
  UTILITY_MODEL    default google/gemini-2.5-flash   (pronunciations + metadata)
  FALLBACK_MODELS  default google/gemini-2.5-pro,deepseek/deepseek-chat   (comma separated)
"""

import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from openai import OpenAI

import bible

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
RESEARCH_MODEL = os.getenv("RESEARCH_MODEL", "anthropic/claude-sonnet-4.5")
DRAFT_MODEL = os.getenv("DRAFT_MODEL", "anthropic/claude-sonnet-4.5")
UTILITY_MODEL = os.getenv("UTILITY_MODEL", "google/gemini-2.5-flash")
FALLBACK_MODELS = [m.strip() for m in os.getenv(
    "FALLBACK_MODELS", "google/gemini-2.5-pro,deepseek/deepseek-chat").split(",") if m.strip()]

MIN_WORDS = 1900  # below this we ask for one expansion pass

if not OPENROUTER_API_KEY:
    print("[Warning] OPENROUTER_API_KEY not found in environment or .env file.")

client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)

# Controlled vocabulary so categorisation/filters in the app stay consistent across ~3,000 sermons.
THEME_VOCAB = [
    "Identity in Christ", "Grace", "Faith", "Trust in God", "Forgiveness", "Repentance", "Salvation",
    "Redemption", "Covenant", "Promises of God", "God's Character", "Holiness", "Worship", "Prayer",
    "Love", "Mercy", "Justice", "Judgment", "Wisdom", "Obedience", "Humility", "Pride",
    "Suffering", "Hope", "Courage", "Anxiety & Peace", "Temptation & Sin", "Spiritual Warfare",
    "Holy Spirit", "Kingdom of God", "Creation", "Death & Resurrection", "Idolatry",
    "Community & Unity", "Family & Marriage", "Leadership", "Work & Calling", "Money & Generosity",
    "Evangelism & Mission", "Rest & Sabbath", "Calling & Purpose", "Sovereignty of God",
]


# --------------------------------------------------------------------------------------------
# Plumbing
# --------------------------------------------------------------------------------------------

def _chat(model: str, system: str, user: str, temperature: float, max_tokens: int,
          json_mode: bool = False, retries: int = 3) -> str:
    """Chat completion with OpenRouter model fallbacks, retries and optional JSON mode."""
    models = [model] + [m for m in FALLBACK_MODELS if m != model]
    kwargs = dict(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        extra_body={"models": models},
        temperature=temperature,
        max_tokens=max_tokens,
    )
    last_err: Optional[Exception] = None
    use_json = json_mode
    for attempt in range(1, retries + 1):
        try:
            if use_json:
                kwargs["response_format"] = {"type": "json_object"}
            else:
                kwargs.pop("response_format", None)
            resp = client.chat.completions.create(**kwargs)
            content = resp.choices[0].message.content
            if content and content.strip():
                return content
            raise RuntimeError("empty completion")
        except Exception as e:
            last_err = e
            if use_json and "response_format" in str(e).lower():
                use_json = False  # model/provider doesn't support JSON mode; parse leniently instead
            wait = 3 * attempt
            print(f"  [LLM] attempt {attempt}/{retries} failed ({e}); retrying in {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"LLM call failed after {retries} attempts: {last_err}")


def _parse_json(raw: str):
    """Leniently parse a JSON object out of a model response."""
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            return json.loads(raw[start:end + 1])
        raise


# --------------------------------------------------------------------------------------------
# Stage 1: original-language research dossier
# --------------------------------------------------------------------------------------------

RESEARCH_SYSTEM = (
    "You are a biblical-languages scholar fluent in Biblical Hebrew, Aramaic and Koine Greek, trained in "
    "lexicography (BDB, HALOT, BDAG, TDNT), the Septuagint, and Second Temple and Greco-Roman background. "
    "You also have a teacher's instinct for the detail that makes a listener sit up and say 'I never saw that.' "
    "You are rigorously honest: you never invent etymologies or sources, and you flag anything uncertain."
)


def build_research_dossier(passage_ref: str, passage_text: str, genre: str) -> dict:
    """Stage 1: returns a dossier dict of vetted language / background insights for the passage."""
    text_block = passage_text or "(Passage text unavailable; work from your knowledge of the original text.)"
    user = f"""
Prepare a research dossier for a teacher who will preach on {passage_ref} (genre: {genre}).

PASSAGE TEXT (World English Bible):
{text_block}

YOUR JOB: find the original-language and background insights that DEEPEN this passage. Not translations, insight.

A word or construction earns a place in the dossier ONLY if at least one of these is true:
 1. CONCRETE IMAGE: its ordinary use pictures something physical or cultural (a trade, tool, animal, body part,
    legal procedure, ritual, farming, military or seafaring practice) that English has dissolved into an abstraction.
 2. ENGLISH FLATTENING: one English word hides a distinction (two Hebrew words became one English word), or
    the same Hebrew/Greek word is translated differently elsewhere, hiding a link a first-century or ancient reader would hear.
 3. CANONICAL ECHO: the same word, phrase or rare construction appears in a well-known earlier or later text
    (Exodus, Psalms, a Septuagint passage a New Testament author quotes) so that the echo changes how this verse reads.
 4. SOUND, STRUCTURE OR GRAMMAR: wordplay, a repeated key word (Leitwort), inclusio, chiasm, parallelism, or a
    grammatical feature (Greek tense/aspect/voice/mood, Hebrew stem or construction) that sharpens the claim beyond what English shows.
 5. ANCIENT PRACTICE: the word is tied to a custom (covenant-cutting, kinsman-redeemer, threshing floor, patronage,
    honor and shame, Roman triumph, the Temple) that changes what the first audience heard.

REJECT (do not include):
 - A word merely because it has a Hebrew/Greek equivalent. "The Hebrew for love is X, which means love" is worthless.
 - Any word whose English translation is already accurate and transparent.
 - Circular glosses ("unity means to be united").

HONESTY RULES:
 - Do NOT invent etymologies, ancient sources, quotations or statistics. Meaning comes from usage, not roots alone
   (avoid the root fallacy). If you lean on a root image, say how usage supports it.
 - Rate every item: "established" (standard lexicons agree), "probable" (reasonable scholarly inference), or
   "debated" (disputed or only popular teaching). Wide-circulating claims you cannot verify go in "popular_claims_to_avoid".
 - Only use words from verses within {passage_ref}, except for the cross-references you cite as echoes.

Return ONLY a JSON object with exactly these keys:
{{
  "main_thrust": "one sentence: what this passage is doing and saying",
  "word_studies": [   // 2 to 5 items, best first; fewer is fine if the passage doesn't warrant more
    {{
      "verse": "e.g. 14",
      "original": "word in Hebrew/Greek/Aramaic script",
      "transliteration": "plain ASCII transliteration, no diacritics (e.g. eskenosen, hesed)",
      "language": "Hebrew | Greek | Aramaic",
      "english_rendering": "how common translations render it",
      "why_it_earns_a_place": "which of the five criteria above, in one line",
      "concrete_image": "the physical or cultural picture behind the word",
      "other_usage": "where else this word/root appears and what it does there (cite references)",
      "what_english_hides": "what a modern reader misses",
      "the_pivot": "how hearing it the way the first audience did changes THIS verse",
      "question_for_listener": "a pointed question that follows from the insight",
      "confidence": "established | probable | debated"
    }}
  ],
  "structure_notes": "literary structure, repetition, parallelism, or flow of argument across the passage",
  "cultural_background": ["2-4 specific background facts that illuminate the passage (not generic history)"],
  "canonical_connections": ["2-4 cross-references that genuinely illuminate the passage, with one line on why"],
  "common_misreadings": ["1-3 ways this passage is commonly misunderstood or misapplied"],
  "popular_claims_to_avoid": ["widely repeated claims about this passage or its words that are dubious, with a brief reason"]
}}
"""
    print(f"--> [Stage 1/4] Research dossier via {RESEARCH_MODEL}...")
    raw = _chat(RESEARCH_MODEL, RESEARCH_SYSTEM, user, temperature=0.3, max_tokens=4500, json_mode=True)
    try:
        return _parse_json(raw)
    except Exception as e:
        print(f"  [Research] Could not parse dossier JSON ({e}); passing raw text to the drafter.")
        return {"raw_notes": raw}


# --------------------------------------------------------------------------------------------
# Stage 2: sermon draft
# --------------------------------------------------------------------------------------------

DRAFT_SYSTEM = (
    "You are a gifted expository pastor and teacher, known for making ancient texts feel startlingly alive. "
    "You are theologically careful, warm, honest about difficulty, and you never moralize or pad. "
    "You write for the ear: the sermon will be read aloud by a text-to-speech voice."
)

MODEL_EXAMPLE = (
    "John writes that the Word 'dwelt' among us. The verb is eskenosen, and it comes from the noun skene, which means "
    "a tent. Not a house. A tent. The kind of thing you pitch in a field and carry through a desert. And John, a Jewish "
    "man, knows exactly what else was pitched in a desert: the tabernacle, where God's glory once filled a tent at Sinai. "
    "So when he writes that the Word 'tented' among us, and in the very next breath says we beheld his glory, he is "
    "telling every Jewish ear: the glory has moved back in. Christmas is not God sending a message. It is God "
    "pitching camp in the middle of our mess. If God was willing to set up a tent in the dust of your life, what "
    "room are you still keeping him out of? Sit with that for a moment."
)


def _draft_prompt(passage_ref: str, passage_text: str, genre: str, dossier: dict,
                  prev_context: str, is_book_start: bool) -> str:
    guidance = bible.GENRE_GUIDANCE.get(genre, "")
    text_block = passage_text or "(Passage text unavailable; quote only what you are certain of.)"
    book_intro = (
        "\nThis is the FIRST study in this book. Spend roughly two hundred words early on introducing the book: "
        "author, original audience, rough date, occasion and purpose, and how it fits into the larger story of Scripture. "
        "Keep this tight and interesting, not encyclopedic.\n"
    ) if is_book_start else ""
    prev_block = (
        f"\nCONTINUITY: The previous study in this series was: {prev_context}\n"
        "Use at most one natural sentence to bridge from it. Do not recap.\n"
    ) if prev_context else ""

    return f"""
Write a complete spoken sermon on {passage_ref}. Genre: {genre}.

PASSAGE TEXT (World English Bible). Quote short key phrases aloud; never read the whole passage:
{text_block}

GENRE GUIDANCE: {guidance}
{book_intro}{prev_block}
RESEARCH DOSSIER (vetted by a scholar; this is your raw material for original-language insights):
{json.dumps(dossier, ensure_ascii=False, indent=1)}

LENGTH: between 2,300 and 2,900 words. This is a fifteen to twenty minute audio study. Do not summarize or rush any section.

SHAPE (flow naturally; no headings, no labels spoken aloud):
 1. Opening hook (about 300 words). One vivid, TRUE or clearly hypothetical story, image, historical moment or modern scene that
    plants the tension this passage resolves. Vary your approach (a scene, a question, a surprising fact, a confession).
    Never invent a real person's quote or a statistic. If a story is hypothetical, say so with a phrase like 'Picture a...'.
 2. Setting the scene (about 250 words). Who, where, when, and what is at stake, using the dossier's cultural background. Specific, not generic.
 3. Walking through the passage (about 1,100 words). Move through the passage in order. Weave the dossier's word studies in AT THE
    VERSE where they occur, never clumped together and never as a separate 'Hebrew section'. Include the structure notes and the
    canonical connections where they genuinely illuminate. Address at least one common misreading honestly.
 4. The big idea (about 150 words). State the one central truth of the passage in a single memorable sentence, then unpack it.
 5. Where it lands (about 500 words). Two concrete, specific, fully-imagined modern scenarios (a Tuesday-morning kind of
    detail), and what faithful response looks like in each. Challenge, not just comfort. Connect to Christ as the passage allows.
 6. Closing (about 250 words). A memorable final thought that circles back to the hook, then a short, sincere prayer.

HOW TO USE THE ORIGINAL LANGUAGES (the most important instruction in this prompt):
Use only the best two to four word studies from the dossier, and give each the full treatment in three beats:
 - PICTURE: Say the word (in plain letters, e.g. eskenosen) and paint the concrete image or ancient practice behind it as a scene,
   not a definition.
 - PIVOT: Show what the English hides and how hearing it the way the first audience did changes THIS verse. Tie it to the other
   place in Scripture where the same word or image lights up. This is the 'oh!' moment.
 - PRESS: Land it on the listener with a pointed question or implication, leave a beat ('Sit with that.'), and move on. Do not
   explain what you just revealed.
Study the craft in this model, which is about a different passage. Imitate the craft, never the content, and do not reuse it:
\"\"\"{MODEL_EXAMPLE}\"\"\"

NEVER do any of the following:
 - Define a word with itself ('the word means to be united, which is significant because it says we should be united').
 - Give a dictionary list of glosses, or announce 'the Hebrew word for X is Y' as if that were the insight.
 - State a Greek or Hebrew word and then merely restate the English verse.
 - Present a 'debated' item as settled fact. If you use one, frame it honestly ('some teachers suggest... careful scholars note...').
 - Use anything listed under popular_claims_to_avoid.
 - Moralize with generic filler ('we should all try harder to love one another').
 - Fabricate quotations from rabbis, church fathers, historians or scholars.

FORMAT FOR TEXT-TO-SPEECH:
 - First line exactly: TITLE: <an evocative title of eight words or fewer, not 'Study on...'>
 - Then spoken prose only. No markdown, no headers, no bullet points, no bold, no asterisks, no brackets, no verse-number markers.
 - Write ALL numbers as words ('chapter four, verse seven', 'two thousand years').
 - Transliterate Hebrew and Greek in plain ASCII letters without accent marks.
 - Short paragraphs separated by blank lines. Vary sentence length. Use contractions. Speak directly to the listener.
"""


def generate_sermon_draft(passage_ref: str, passage_text: str, genre: str, dossier: dict,
                          prev_context: str = "", is_book_start: bool = False) -> str:
    """Stage 2: the sermon itself (with a TITLE: line)."""
    prompt = _draft_prompt(passage_ref, passage_text, genre, dossier, prev_context, is_book_start)
    print(f"--> [Stage 2/4] Drafting sermon via {DRAFT_MODEL}...")
    draft = _chat(DRAFT_MODEL, DRAFT_SYSTEM, prompt, temperature=0.75, max_tokens=8000)

    words = len(draft.split())
    if words < MIN_WORDS:
        print(f"  [Draft] Only {words} words; requesting one expansion pass.")
        expand = f"""
The sermon below is too short ({words} words). Rewrite it to between 2,300 and 2,900 words by deepening, not padding:
more verse-by-verse engagement, fuller word studies (Picture, Pivot, Press), a richer opening and more specific application scenarios.
Keep the TITLE line first, keep everything TTS-safe (no markdown, numbers as words), and return the complete sermon.

{draft}
"""
        draft = _chat(DRAFT_MODEL, DRAFT_SYSTEM, expand, temperature=0.7, max_tokens=8000)
    return draft


# --------------------------------------------------------------------------------------------
# Stage 3: TTS pronunciation (applied ONLY to the audio text)
# --------------------------------------------------------------------------------------------

def build_pronunciation_map(sermon_text: str) -> dict:
    """Stage 3: ask a cheap model for {term: respelling}; never rewrites the sermon itself."""
    user = f"""
Below is a sermon that will be read by an English text-to-speech engine. List every word or name a generic
English engine would likely mispronounce: transliterated Hebrew/Greek/Aramaic words, and biblical names or places with
non-obvious pronunciation (e.g. Melchizedek, Nebuchadnezzar, Ephesians is fine and should be skipped).

Return ONLY a JSON object mapping each term EXACTLY as it appears in the text to a respelling in plain English syllables
separated by hyphens, all lowercase, e.g. {{"hesed": "heh-sed", "ruach": "roo-akh", "Melchizedek": "mel-kiz-eh-dek"}}.
Do not include ordinary English words. If nothing needs help, return {{}}.

SERMON:
{sermon_text}
"""
    try:
        raw = _chat(UTILITY_MODEL, "You are a pronunciation expert preparing text for TTS.", user,
                    temperature=0.1, max_tokens=2000, json_mode=True)
        data = _parse_json(raw)
        return {k: v for k, v in data.items() if isinstance(k, str) and isinstance(v, str) and k.strip() and v.strip()}
    except Exception as e:
        print(f"  [Pronunciation] Skipped ({e})")
        return {}


def apply_pronunciations(text: str, pron_map: dict) -> str:
    """Replace whole-word occurrences, longest terms first. Used only for the TTS copy."""
    for term in sorted(pron_map, key=len, reverse=True):
        text = re.sub(rf"\b{re.escape(term)}\b", pron_map[term], text)
    return text


# --------------------------------------------------------------------------------------------
# Stage 4: metadata for search / categorisation / plans
# --------------------------------------------------------------------------------------------

def generate_metadata(title: str, passage_ref: str, sermon_text: str) -> dict:
    """Stage 4: summary, themes (controlled vocabulary) and free keywords."""
    user = f"""
Create search metadata for this Bible study.

Title: {title}
Passage: {passage_ref}

Return ONLY a JSON object:
{{
  "summary": "two plain sentences (max 45 words) describing what this study explores; no TTS formatting",
  "themes": ["2 to 5 items chosen ONLY from this list: {json.dumps(THEME_VOCAB)}"],
  "keywords": ["3 to 6 short free-form topical keywords or phrases a reader might search for"]
}}

STUDY TEXT:
{sermon_text[:7000]}
"""
    try:
        raw = _chat(UTILITY_MODEL, "You are a careful librarian categorising sermons.", user,
                    temperature=0.2, max_tokens=700, json_mode=True)
        data = _parse_json(raw)
        themes = [t for t in data.get("themes", []) if t in THEME_VOCAB][:5]
        keywords = [str(k).strip() for k in data.get("keywords", []) if str(k).strip()][:6]
        return {"summary": str(data.get("summary", "")).strip(), "themes": themes, "keywords": keywords}
    except Exception as e:
        print(f"  [Metadata] Skipped ({e})")
        return {"summary": "", "themes": [], "keywords": []}


# --------------------------------------------------------------------------------------------
# Orchestrator
# --------------------------------------------------------------------------------------------

def generate_full_sermon_script(book: str, chapter: int, start_v: int, end_v: int,
                                passage_text: str = "", prev_context: str = "") -> dict:
    """
    Runs all stages for one passage.
    Returns: {title, sermon_text, tts_text, summary, themes, keywords, word_count, research}
    """
    passage_ref = f"{book} {chapter}:{start_v}-{end_v}"
    meta = bible.BOOKS_BY_NAME[book]

    dossier = build_research_dossier(passage_ref, passage_text, meta.genre)
    raw = generate_sermon_draft(
        passage_ref, passage_text, meta.genre, dossier,
        prev_context=prev_context, is_book_start=(chapter == 1 and start_v == 1),
    )

    # Split TITLE line from the body and strip any stray markdown for display + TTS.
    lines = raw.strip().split("\n")
    title = f"Study on {passage_ref}"
    body = raw.strip()
    if lines and lines[0].strip().upper().startswith("TITLE:"):
        title = lines[0].split(":", 1)[1].strip().strip('"*') or title
        body = "\n".join(lines[1:]).strip()
    body = re.sub(r"^#+\s*", "", body, flags=re.MULTILINE).replace("**", "").replace("*", "")

    print("--> [Stage 3/4] Building pronunciation map...")
    tts_text = apply_pronunciations(body, build_pronunciation_map(body))

    print("--> [Stage 4/4] Generating search metadata...")
    meta_info = generate_metadata(title, passage_ref, body)

    return {
        "title": title,
        "sermon_text": body,
        "tts_text": tts_text,
        "summary": meta_info["summary"],
        "themes": meta_info["themes"],
        "keywords": meta_info["keywords"],
        "word_count": len(body.split()),
        "research": dossier,
    }
