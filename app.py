"""English Daily Reader - Flask Backend (stateless)."""

import json
import os
import random
import sys
import traceback
from datetime import datetime, date
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory

from generator import ReadingGenerator
from dictionary import Dictionary

load_dotenv()

# --- Paths (support PyInstaller frozen exe for static files) ---
if getattr(sys, "frozen", False):
    EXE_DIR = Path(sys.executable).parent
    _meipass = getattr(sys, "_MEIPASS", None)
    if _meipass:
        STATIC_DIR = Path(_meipass) / "static"
    else:
        STATIC_DIR = EXE_DIR / "_internal" / "static"
else:
    STATIC_DIR = Path(__file__).parent / "static"

app = Flask(__name__, static_folder=None)

DEFAULT_API_BASE = "https://api.deepseek.com/v1"


def _get_today_str() -> str:
    return date.today().isoformat()


def _get_api_key() -> str:
    return os.getenv("DEEPSEEK_API_KEY", "").strip()


# --- Static files ---
@app.route("/")
def index():
    return send_from_directory(str(STATIC_DIR), "index.html")


@app.route("/static/<path:filename>")
def static_files(filename):
    return send_from_directory(str(STATIC_DIR), filename)


# --- Generate ---
@app.route("/api/generate", methods=["POST"])
def generate():
    body = request.get_json(silent=True) or {}

    api_key = _get_api_key()
    api_base = body.get("api_base_url") or os.getenv("API_BASE_URL", DEFAULT_API_BASE)

    if not api_key:
        return jsonify({"error": "请先在设置页配置 API Key"}), 400

    try:
        topic = (body.get("topic") or "").strip()
        if not topic:
            topic = body.get("defaultTopic", "__HOT_TOPICS__")

        count = body.get("count") or body.get("segmentCount", 10)
        words_per_seg = body.get("wordsPerSegment", 50)
        difficulty = body.get("difficulty", "cet6")

        # Vocab integration — words list passed from frontend
        vocab_words = []
        if body.get("vocabIntegration", True):
            vocab_count = body.get("vocabIntegrationCount", 8)
            candidate_words = body.get("vocabWords", [])
            random.shuffle(candidate_words)
            vocab_words = candidate_words[:vocab_count]

        generator = ReadingGenerator(api_key=api_key, api_base_url=api_base)
        segments = generator.generate(
            topic=topic,
            count=count,
            words_per_seg=words_per_seg,
            difficulty=difficulty,
            vocab_words=vocab_words,
        )

        actual_topic = getattr(generator, "last_topic", None)
        if not actual_topic or actual_topic == "__HOT_TOPICS__":
            if topic == "__HOT_TOPICS__":
                if segments:
                    first_en = segments[0]["english"][:80]
                    actual_topic = f"近期热点: {first_en}..."
                else:
                    actual_topic = "近期热点"
            else:
                actual_topic = topic
        elif topic and topic != "__HOT_TOPICS__":
            actual_topic = topic

        today = _get_today_str()

        # Build reading object — client will store in localStorage
        reading = {
            "date": today,
            "topic": actual_topic,
            "difficulty": difficulty,
            "generatedAt": datetime.now().isoformat(),
            "segments": [{**seg, "id": i} for i, seg in enumerate(segments)],
        }

        missing = ReadingGenerator.check_missing_vocab(segments, vocab_words)

        return jsonify(
            {
                "reading": reading,
                "missingVocab": missing,
            }
        )
    except Exception as e:
        return jsonify({"error": f"生成失败: {str(e)}"}), 500


# --- Generate more (append to existing reading) ---
@app.route("/api/generate-more", methods=["POST"])
def generate_more():
    """Generate additional segments and append to an existing reading object."""
    body = request.get_json(silent=True) or {}

    api_key = _get_api_key()
    api_base = body.get("api_base_url") or os.getenv("API_BASE_URL", DEFAULT_API_BASE)

    if not api_key:
        return jsonify({"error": "请先在设置页配置 API Key"}), 400

    try:
        topic = (body.get("topic") or "").strip()
        if not topic:
            topic = body.get("defaultTopic", "__HOT_TOPICS__")

        count = body.get("count") or body.get("segmentCount", 5)
        words_per_seg = body.get("wordsPerSegment", 50)
        difficulty = body.get("difficulty", "cet6")

        vocab_words = []
        if body.get("vocabIntegration", True):
            vocab_count = body.get("vocabIntegrationCount", 8)
            candidate_words = body.get("vocabWords", [])
            random.shuffle(candidate_words)
            vocab_words = candidate_words[:vocab_count]

        generator = ReadingGenerator(api_key=api_key, api_base_url=api_base)
        segments = generator.generate(
            topic=topic,
            count=count,
            words_per_seg=words_per_seg,
            difficulty=difficulty,
            vocab_words=vocab_words,
        )

        # Append to existing reading if provided
        existing = body.get("existingReading") or {}
        existing_segments = existing.get("segments", [])
        start_id = len(existing_segments)
        existing["segments"] = existing_segments + [
            {**seg, "id": start_id + i} for i, seg in enumerate(segments)
        ]
        existing["generatedAt"] = datetime.now().isoformat()

        missing = ReadingGenerator.check_missing_vocab(segments, vocab_words)

        return jsonify(
            {
                "reading": existing,
                "appendedCount": len(segments),
                "missingVocab": missing,
            }
        )
    except Exception as e:
        return jsonify({"error": f"生成失败: {str(e)}"}), 500


# --- Dictionary ---
@app.route("/api/dictionary", methods=["GET"])
def dictionary():
    try:
        word = request.args.get("word", "").strip()
        if not word:
            return jsonify({"error": "Missing word parameter"}), 400

        d = Dictionary()
        result = d.lookup(word)

        if not result.get("local"):
            api_key = _get_api_key()
            if api_key:
                api_base = os.getenv("API_BASE_URL", DEFAULT_API_BASE)
                d2 = Dictionary(llm_api_key=api_key, llm_base_url=api_base)
                llm = d2.translate_llm(word)
                result["llm_translation"] = llm

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Dictionary lookup failed: {str(e)}"}), 500


@app.route("/api/dictionary/translate", methods=["POST"])
def dictionary_translate():
    try:
        body = request.get_json(silent=True) or {}
        word = body.get("word", "").strip()
        if not word:
            return jsonify({"error": "Missing word parameter"}), 400

        api_key = _get_api_key()
        api_base = os.getenv("API_BASE_URL", DEFAULT_API_BASE)
        if not api_key:
            return jsonify({"error": "请先配置 API Key"}), 400

        d = Dictionary(llm_api_key=api_key, llm_base_url=api_base)
        result = d.translate_llm(word)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Translation failed: {str(e)}"}), 500


@app.route("/api/dictionary/llm", methods=["POST"])
def dictionary_llm():
    try:
        body = request.get_json(silent=True) or {}
        word = body.get("word", "").strip()
        if not word:
            return jsonify({"error": "Missing word parameter"}), 400

        api_key = _get_api_key()
        api_base = os.getenv("API_BASE_URL", DEFAULT_API_BASE)
        if not api_key:
            return jsonify({"error": "请先配置 API Key"}), 400

        d = Dictionary(llm_api_key=api_key, llm_base_url=api_base)
        result = d.explain_llm(word)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"LLM explain failed: {str(e)}"}), 500


# --- Health ---
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "apiConfigured": bool(_get_api_key()),
    })


# --- Error handlers ---
@app.errorhandler(400)
def bad_request(e):
    return jsonify({"error": e.description or "Bad request"}), 400


@app.errorhandler(403)
def forbidden(e):
    return jsonify({"error": "Forbidden"}), 403


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500


@app.errorhandler(Exception)
def unhandled_exception(e):
    try:
        traceback.print_exc()
    except Exception:
        pass
    msg = str(e).encode("utf-8", errors="replace").decode("utf-8")
    return jsonify({"error": f"Server error: {msg}"}), 500


# --- Shutdown ---
@app.route("/api/shutdown", methods=["POST"])
def shutdown():
    import os as _os
    _os._exit(0)


if __name__ == "__main__":
    import webbrowser
    webbrowser.open("http://127.0.0.1:5000")
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
