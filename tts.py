"""
TTS module for Preech Bot - Kokoro ONNX (open-source/free).
Generates full-length MP3 audio by chunking text by paragraphs and stitching audio arrays.
"""
import os
import shutil
import urllib.request
import re
import numpy as np
from pathlib import Path

try:
    import kokoro_onnx
    import soundfile as sf
    KOKORO_AVAILABLE = True
except Exception as _e:
    KOKORO_AVAILABLE = False
    _IMPORT_ERROR = str(_e)

VOICE_STYLE = "af_bella"  # Warm, clear voice for sermon delivery

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_PATH = os.path.join(MODELS_DIR, "kokoro-v1.0.onnx")
VOICES_PATH = os.path.join(MODELS_DIR, "voices-v1.0.bin")

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"


def _ensure_weights() -> bool:
    """Download Kokoro ONNX weights if missing."""
    os.makedirs(MODELS_DIR, exist_ok=True)
    for url, dest in [(MODEL_URL, MODEL_PATH), (VOICES_URL, VOICES_PATH)]:
        if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
            continue
        print(f"  Downloading {os.path.basename(dest)}...")
        try:
            urllib.request.urlretrieve(url, dest)
            print(f"  -> {os.path.getsize(dest) / 1024 / 1024:.1f} MB saved to {dest}")
        except Exception as e:
            print(f"  Download failed: {e}")
            if os.path.exists(dest):
                os.remove(dest)
            return False
    return os.path.exists(MODEL_PATH) and os.path.exists(VOICES_PATH)


def _split_text_into_chunks(text: str) -> list[str]:
    """
    Cleans markdown formatting and splits sermon text into digestible paragraph 
    and sentence chunks so Kokoro ONNX context limits are never exceeded.
    """
    # Clean common markdown artifacts
    text = text.replace("**", "").replace("*", "").replace("##", "")
    
    # Split by double newline (paragraphs)
    raw_paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    
    chunks = []
    for paragraph in raw_paragraphs:
        # If paragraph is very long (> 400 chars), split by sentences
        if len(paragraph) > 400:
            sentences = re.split(r'(?<=[.!?]) +', paragraph)
            chunks.extend([s.strip() for s in sentences if s.strip()])
        else:
            chunks.append(paragraph)
            
    return chunks


def generate_audio(text: str, passage_ref: str, audio_dir: str = "./audio") -> str:
    """Generates full-length MP3 audio for sermon text using Kokoro ONNX chunk stitching."""
    os.makedirs(audio_dir, exist_ok=True)
    safe_ref = passage_ref.replace(":", "_").replace(" ", "_").replace("/", "_")
    output_path = os.path.join(audio_dir, f"{safe_ref}.mp3")

    if not KOKORO_AVAILABLE:
        print(f"TTS Error: Kokoro not available - {_IMPORT_ERROR}")
        return ""

    if not _ensure_weights():
        print("TTS Error: Could not verify weights.")
        return ""

    try:
        kokoro = kokoro_onnx.Kokoro(MODEL_PATH, VOICES_PATH)
    except Exception as e:
        print(f"TTS Init Failed: {e}")
        return ""

    chunks = _split_text_into_chunks(text)
    print(f"--> Processing {len(chunks)} text chunks for audio synthesis...")

    audio_segments = []
    sample_rate = 24000  # Default Kokoro sample rate

    for idx, chunk in enumerate(chunks):
        try:
            audio_array, sr = kokoro.create(
                text=chunk,
                voice=VOICE_STYLE,
                speed=1.0,
                lang="en-us",
                trim=True
            )
            sample_rate = sr
            audio_segments.append(audio_array)
            
            # Add 0.4s of silence between chunks (sample_rate * 0.4)
            silence_samples = int(sample_rate * 0.4)
            audio_segments.append(np.zeros(silence_samples, dtype=np.float32))
            
        except Exception as e:
            print(f"  [Warning] Failed to synthesize chunk {idx+1}/{len(chunks)}: {e}")
            continue

    if not audio_segments:
        print("TTS Error: No audio segments were successfully generated.")
        return ""

    # Stitch all chunks into a single audio array
    final_audio = np.concatenate(audio_segments)

    # Save as WAV
    wav_path = output_path.replace(".mp3", ".wav")
    sf.write(wav_path, final_audio, sample_rate)

    # Convert to MP3 via ffmpeg if available
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        ret = os.system(f'{ffmpeg} -y -i "{wav_path}" -codec:a libmp3lame -q:a 2 "{output_path}" 2>/dev/null')
        if ret == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            os.remove(wav_path)
            return output_path

    return wav_path