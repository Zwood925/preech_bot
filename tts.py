"""
TTS module for Preech Bot - Kokoro ONNX (open-source/free).
Generates MP3 audio using a configurable voice style (Irish female-style default).
"""
import os
import sys
import shutil
import urllib.request
import numpy as np
from pathlib import Path

# Try to import the deps
try:
    import kokoro_onnx
    import soundfile as sf
    KOKORO_AVAILABLE = True
except Exception as _e:
    KOKORO_AVAILABLE = False
    _IMPORT_ERROR = str(_e)


# Default voice style - kokoro's built-in voice list
# Available female voices: af_alloy, af_aoede, af_bella, af_heart, af_jessica,
# af_kore, af_nicole, af_nova, af_river, af_sarah, af_sky
# Irish-style options: bf_emma (British female, closest to Irish)
VOICE_STYLE = "af_bella"  # Warm, clear female — best for sermon delivery

# Model weight paths - downloaded into the project so they're persistent
# Kokoro ONNX v1.0 model + voices blob (both required)
MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_PATH = os.path.join(MODELS_DIR, "kokoro-v1.0.onnx")
VOICES_PATH = os.path.join(MODELS_DIR, "voices-v1.0.bin")

# Public source for weights (Kokoro ONNX release on Hugging Face / GitHub)
MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"


def _ensure_weights() -> bool:
    """Download Kokoro ONNX weights if missing. Returns True if both files are present."""
    os.makedirs(MODELS_DIR, exist_ok=True)

    for url, dest in [(MODEL_URL, MODEL_PATH), (VOICES_URL, VOICES_PATH)]:
        if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
            continue  # already downloaded
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


def generate_audio(text: str, passage_ref: str, audio_dir: str = "./audio", engine: str = "kokoro") -> str:
    """Generate MP3 audio for sermon text using Kokoro ONNX."""
    os.makedirs(audio_dir, exist_ok=True)
    safe_ref = passage_ref.replace(":", "_").replace(" ", "_").replace("/", "_")
    output_path = os.path.join(audio_dir, f"{safe_ref}.mp3")

    if not KOKORO_AVAILABLE:
        with open(output_path, "w") as f:
            f.write(f"# TTS unavailable: {_IMPORT_ERROR}\n")
        return output_path

    # Strip markdown before synthesis (prevents TTS from reading "asterisk asterisk")
    text = text.replace('**', '')

    # Download weights on first use
    if not _ensure_weights():
        with open(output_path, "w") as f:
            f.write(f"# TTS weights not downloaded. Check network or run manually.\n")
        return output_path

    # Initialize Kokoro
    try:
        kokoro = kokoro_onnx.Kokoro(MODEL_PATH, VOICES_PATH)
    except Exception as e:
        with open(output_path, "w") as f:
            f.write(f"# TTS init failed: {e}\n")
        return output_path

    # Generate audio
    try:
        audio_array, sample_rate = kokoro.create(
            text=text,
            voice=VOICE_STYLE,
            speed=1.0,
            lang="en-us",
            trim=True
        )
    except Exception as e:
        with open(output_path, "w") as f:
            f.write(f"# TTS synthesis failed: {e}\n")
        return output_path

    # Save as WAV first (soundfile native)
    wav_path = output_path.replace(".mp3", ".wav")
    sf.write(wav_path, audio_array, sample_rate)

    # Convert to MP3 with ffmpeg (installed system-wide)
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        ret = os.system(f'{ffmpeg} -y -i "{wav_path}" -codec:a libmp3lame -q:a 2 "{output_path}" 2>/dev/null')
        if ret == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            os.remove(wav_path)
            return output_path

    # Fallback: keep WAV
    return wav_path
