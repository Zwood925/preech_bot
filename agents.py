"""
OpenRouter API Pipeline for Preech Bot.
Replaces local Ollama/CrewAI with fast, low-cost cloud LLMs.
Pass 1: Drafts a creative title and full sermon (~1,200-1,500 words).
Pass 2: Sanitizes ancient terms with phonetic spellings and cleans TTS formatting.
"""

import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
PRIMARY_MODEL = os.getenv("PRIMARY_MODEL", "google/gemini-2.5-flash")
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "deepseek/deepseek-chat")

if not OPENROUTER_API_KEY:
    print("[Warning] OPENROUTER_API_KEY not found in environment or .env file.")

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_API_KEY,
)

# Build fallback list for OpenRouter auto-routing
MODEL_FALLBACKS = [PRIMARY_MODEL]
if FALLBACK_MODEL and FALLBACK_MODEL != PRIMARY_MODEL:
    MODEL_FALLBACKS.append(FALLBACK_MODEL)
if "meta-llama/llama-3.3-70b-instruct" not in MODEL_FALLBACKS:
    MODEL_FALLBACKS.append("meta-llama/llama-3.3-70b-instruct")


def generate_sermon_draft(passage_ref: str) -> str:
    """Pass 1: Drafts a creative title and 10-15 minute sermon script."""
    system_prompt = (
        "You are an experienced, engaging Christian pastor and exegetical scholar. "
        "Your task is to write a compelling sermon title and complete 10-15 minute spoken sermon script."
    )
    
    user_prompt = f"""
Write a full, engaging spoken sermon on the passage '{passage_ref}'.

Structure:
0. Title: On the VERY FIRST line of your response, write a creative, engaging sermon title (3-7 words) in the exact format: TITLE: Your Sermon Title Here
1. Opening Hook: Start immediately after the title line with an engaging real-world story, historical anecdote, or modern analogy that illustrates the central theme.
2. Exegesis & Context: Walk through '{passage_ref}', explaining original historical background, focusing on original languages (Hebrew/Aramaic and the Greek Septuagint) and key theological themes clearly.
3. Practical Application: Give two concrete, modern daily life applications for believers today.
4. Closing: End with a memorable reflection or closing prayer.

Formatting Rules for Text-to-Speech (TTS):
- Write numbers as words (e.g., 'three' instead of '3', 'chapter four' instead of 'ch. 4').
- Do NOT use markdown headers (no ##), bullet points (* or -), or bold markers (**text**). Write purely spoken prose.
- Target roughly 1,200 to 1,500 words.
"""

    print(f"--> [Pass 1] Generating sermon draft & title via OpenRouter ({PRIMARY_MODEL})...")
    response = client.chat.completions.create(
        model=PRIMARY_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        extra_body={"models": MODEL_FALLBACKS},
        temperature=0.7,
        max_tokens=3500,
    )

    return response.choices[0].message.content


def sanitize_for_tts(sermon_text: str) -> str:
    """Pass 2: Sanitizes ancient Hebrew/Greek pronunciation and formatting for Kokoro TTS."""
    system_prompt = (
        "You are an expert audio transcript proofreader for Text-To-Speech (TTS) engines."
    )

    user_prompt = f"""
Review and refine the following sermon text specifically for a Text-To-Speech (TTS) voice engine.

Instructions:
1. Preserve the 'TITLE: ...' line on the very first line exactly as written.
2. Replace ancient Hebrew, Greek, or Latin biblical names/words with simple phonetic spellings so the voice reads them naturally (e.g., replace 'Ruach' with 'Roo-ahk', replace 'Agape' with 'Ah-gah-pay', replace 'YHWH' with 'Yah-way').
3. Ensure there are NO remaining markdown symbols, asterisks, brackets, or section headers in the sermon body.
4. Keep every paragraph intact; do not shorten or summarize the sermon.

Here is the sermon text:
{sermon_text}
"""

    print(f"--> [Pass 2] Applying TTS Phonetic Sanitization...")
    response = client.chat.completions.create(
        model=PRIMARY_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        extra_body={"models": MODEL_FALLBACKS},
        temperature=0.2,
        max_tokens=3500,
    )

    return response.choices[0].message.content


def generate_full_sermon_script(passage_ref: str) -> tuple[str, str]:
    """
    Executes the complete two-pass generation workflow.
    Returns:
        tuple[str, str]: (sermon_title, clean_sermon_text)
    """
    raw_draft = generate_sermon_draft(passage_ref)
    clean_script = sanitize_for_tts(raw_draft)

    # Default title fallback
    title = f"Study on {passage_ref}"
    lines = clean_script.strip().split("\n")

    # Extract TITLE line and remove it from spoken audio body
    if lines and lines[0].startswith("TITLE:"):
        title = lines[0].replace("TITLE:", "").strip()
        sermon_body = "\n".join(lines[1:]).strip()
    else:
        sermon_body = clean_script

    return title, sermon_body