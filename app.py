"""English Daily Reader - Flask Backend."""

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

# --- Paths (support PyInstaller frozen exe) ---
if getattr(sys, "frozen", False):
    # Running as exe: data goes next to exe; static files in _internal/
    EXE_DIR = Path(sys.executable).parent
    DATA_DIR = EXE_DIR / "data"
    # In onedir mode, _MEIPASS is _internal/ dir next to exe.
    # Fall back to EXE_DIR/_internal if _MEIPASS is absent.
    _meipass = getattr(sys, "_MEIPASS", None)
    if _meipass:
        STATIC_DIR = Path(_meipass) / "static"
    else:
        STATIC_DIR = EXE_DIR / "_internal" / "static"
else:
    EXE_DIR = Path(__file__).parent
    DATA_DIR = EXE_DIR / "data"
    STATIC_DIR = EXE_DIR / "static"

app = Flask(__name__, static_folder=None)
# static_folder=None disables Flask's built-in static file handling which
# conflicts with PyInstaller frozen builds. We serve static files via
# explicit send_from_directory routes below.
READINGS_DIR = DATA_DIR / "readings"
VOCAB_FILE = DATA_DIR / "vocabulary.json"
SETTINGS_FILE = DATA_DIR / "settings.json"

DEFAULT_API_BASE = "https://api.deepseek.com/v1"


def _load_json(filepath: Path) -> dict:
    if not filepath.exists():
        return {}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(filepath: Path, data: dict) -> None:
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _get_settings() -> dict:
    return _load_json(SETTINGS_FILE)


def _save_settings(settings: dict) -> None:
    _save_json(SETTINGS_FILE, settings)


def _get_vocabulary() -> dict:
    return _load_json(VOCAB_FILE)


def _save_vocabulary(vocab: dict) -> None:
    _save_json(VOCAB_FILE, vocab)


def _get_today_str() -> str:
    return date.today().isoformat()


def _get_api_key() -> str:
    """Load API key: .env first, then settings.json fallback."""
    env_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if env_key:
        return env_key
    settings = _get_settings()
    return settings.get("api_key", "")


# --- Static files ---
# Explicit routes are used instead of Flask's static_folder/static_url_path
# because those interact poorly with PyInstaller frozen builds.
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
    settings = _get_settings()

    api_key = _get_api_key()
    api_base = settings.get("api_base_url", "") or DEFAULT_API_BASE

    if not api_key:
        return jsonify({"error": "请先在设置页配置 API Key"}), 400

    try:
        topic = (body.get("topic") or "").strip()
        if not topic:
            topic = settings.get("defaultTopic", "__HOT_TOPICS__")

        count = body.get("count") or settings.get("segmentCount", 10)
        words_per_seg = body.get("wordsPerSegment") or settings.get("wordsPerSegment", 50)
        difficulty = body.get("difficulty") or settings.get("difficulty", "cet6")

        # Collect vocabulary words
        vocab_words = []
        vocab_file = _get_vocabulary()
        if settings.get("vocabIntegration", True):
            vocab_count = settings.get("vocabIntegrationCount", 8)
            all_words = vocab_file.get("words", [])
            unmastered = [w for w in all_words if not w.get("mastered", False)]
            unmastered.sort(key=lambda w: w.get("reviewCount", 0))
            random.shuffle(unmastered)
            vocab_words = [w["word"] for w in unmastered[:vocab_count]]

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
            # User provided a topic — prefer their original language (e.g. Chinese)
            actual_topic = topic

        today = _get_today_str()
        reading_file = READINGS_DIR / f"{today}.json"
        existing = _load_json(reading_file)

        if existing and "segments" in existing:
            start_id = len(existing["segments"])
            existing["segments"].extend(
                {**seg, "id": start_id + i} for i, seg in enumerate(segments)
            )
            existing["generatedAt"] = datetime.now().isoformat()
            if actual_topic and actual_topic != "__HOT_TOPICS__":
                existing["topic"] = actual_topic
            # Track each generation batch as a topic entry
            existing.setdefault("topics", [])
            existing["topics"].append({
                "topic": actual_topic or topic,
                "segmentCount": len(segments),
            })
            reading = existing
        else:
            reading = {
                "date": today,
                "topic": actual_topic,
                "difficulty": difficulty,
                "generatedAt": datetime.now().isoformat(),
                "segments": [{**seg, "id": i} for i, seg in enumerate(segments)],
                "topics": [{
                    "topic": actual_topic or topic,
                    "segmentCount": len(segments),
                }],
            }

        _save_json(reading_file, reading)

        # Scan for vocab contexts
        if vocab_words:
            vocab_data = _get_vocabulary()
            contexts = ReadingGenerator.scan_vocab_contexts(
                segments, vocab_data.get("words", []), today
            )
            word_map = {w["word"].lower(): w for w in vocab_data.get("words", [])}
            for ctx in contexts:
                w = word_map.get(ctx["word"].lower())
                if w:
                    w.setdefault("contexts", [])
                    existing_ctxs = {
                        (c["date"], c["segmentId"]) for c in w["contexts"]
                    }
                    if (ctx["date"], ctx["segmentId"]) not in existing_ctxs:
                        w["contexts"].append(
                            {
                                "date": ctx["date"],
                                "segmentId": ctx["segmentId"],
                                "sentence": ctx["sentence"],
                            }
                        )
            _save_vocabulary(vocab_data)

        missing = ReadingGenerator.check_missing_vocab(segments, vocab_words)

        return jsonify(
            {
                "date": today,
                "topic": actual_topic,
                "segments": reading["segments"],
                "saved": True,
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

        # Auto LLM translate when local dictionary is unavailable (e.g. Render cloud)
        if not result.get("local"):
            api_key = _get_api_key()
            if api_key:
                api_base = _get_settings().get("api_base_url", "") or DEFAULT_API_BASE
                d2 = Dictionary(llm_api_key=api_key, llm_base_url=api_base)
                llm = d2.translate_llm(word)
                result["llm_translation"] = llm

        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"Dictionary lookup failed: {str(e)}"}), 500


@app.route("/api/dictionary/translate", methods=["POST"])
def dictionary_translate():
    """Quick Chinese translation via LLM (uses existing API key, no extra config)."""
    try:
        body = request.get_json(silent=True) or {}
        word = body.get("word", "").strip()
        if not word:
            return jsonify({"error": "Missing word parameter"}), 400

        api_key = _get_api_key()
        api_base = _get_settings().get("api_base_url", "") or DEFAULT_API_BASE
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

        settings = _get_settings()
        api_key = _get_api_key()
        api_base = settings.get("api_base_url", "") or DEFAULT_API_BASE

        d = Dictionary(llm_api_key=api_key, llm_base_url=api_base)
        result = d.explain_llm(word)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": f"LLM explain failed: {str(e)}"}), 500


# --- Vocabulary CRUD ---
@app.route("/api/vocabulary", methods=["GET"])
def get_vocabulary():
    vocab = _get_vocabulary()
    words = vocab.get("words", [])
    total = len(words)
    unmastered = sum(1 for w in words if not w.get("mastered", False))
    mastered = total - unmastered
    return jsonify({"words": words, "total": total, "unmastered": unmastered, "mastered": mastered})


@app.route("/api/vocabulary", methods=["POST"])
def add_vocabulary():
    body = request.get_json(silent=True) or {}
    word = body.get("word", "").strip()
    if not word:
        return jsonify({"error": "Missing word"}), 400

    vocab = _get_vocabulary()
    words = vocab.get("words", [])

    # Check duplicate — update if already exists
    for w in words:
        if w["word"].lower() == word.lower():
            if body.get("definition_cn"):
                w["definition_cn"] = body["definition_cn"]
            if body.get("definition_en"):
                w["definition_en"] = body["definition_en"]
            if body.get("phonetic"):
                w["phonetic"] = body["phonetic"]
            if body.get("llm_explanation"):
                w["llm_explanation"] = body["llm_explanation"]
            if body.get("context"):
                w.setdefault("contexts", [])
                existing = {(c.get("date"), c.get("segmentId")) for c in w["contexts"]}
                ctx = body["context"]
                if (ctx.get("date"), ctx.get("segmentId")) not in existing:
                    w["contexts"].append(ctx)
            _save_vocabulary(vocab)
            return jsonify(w), 200

    entry = {
        "word": word,
        "definition_cn": body.get("definition_cn", ""),
        "definition_en": body.get("definition_en", ""),
        "phonetic": body.get("phonetic", ""),
        "llm_explanation": body.get("llm_explanation", ""),
        "addedAt": _get_today_str(),
        "reviewCount": 0,
        "mastered": False,
        "contexts": [],
    }
    if body.get("context"):
        entry["contexts"].append(body["context"])
    words.append(entry)
    vocab["words"] = words
    _save_vocabulary(vocab)
    return jsonify(entry), 201


@app.route("/api/vocabulary/<word>", methods=["DELETE"])
def delete_vocabulary(word):
    vocab = _get_vocabulary()
    words = vocab.get("words", [])
    vocab["words"] = [w for w in words if w["word"].lower() != word.lower()]
    _save_vocabulary(vocab)
    return jsonify({"deleted": True})


@app.route("/api/vocabulary/<word>", methods=["PUT"])
def update_vocabulary(word):
    body = request.get_json(silent=True) or {}
    vocab = _get_vocabulary()
    words = vocab.get("words", [])
    for w in words:
        if w["word"].lower() == word.lower():
            if "mastered" in body:
                w["mastered"] = body["mastered"]
            if "reviewCount" in body:
                w["reviewCount"] = body["reviewCount"]
            if "definition_cn" in body:
                w["definition_cn"] = body["definition_cn"]
            if "definition_en" in body:
                w["definition_en"] = body["definition_en"]
            if "phonetic" in body:
                w["phonetic"] = body["phonetic"]
            if "llm_explanation" in body:
                w["llm_explanation"] = body["llm_explanation"]
            _save_vocabulary(vocab)
            return jsonify(w)
    return jsonify({"error": "Word not found"}), 404


# --- Vocabulary Contexts ---
@app.route("/api/vocabulary/<word>/contexts", methods=["GET"])
def get_word_contexts(word):
    vocab = _get_vocabulary()
    for w in vocab.get("words", []):
        if w["word"].lower() == word.lower():
            return jsonify({"word": w["word"], "contexts": w.get("contexts", [])})
    return jsonify({"error": "Word not found"}), 404


# --- Readings ---
@app.route("/api/readings", methods=["GET"])
def list_readings():
    if not READINGS_DIR.exists():
        return jsonify({"dates": []})
    files = sorted(READINGS_DIR.glob("*.json"), reverse=True)
    dates = [f.stem for f in files]
    return jsonify({"dates": dates})


@app.route("/api/readings/<date_str>", methods=["GET"])
def get_reading(date_str):
    filepath = READINGS_DIR / f"{date_str}.json"
    if not filepath.exists():
        return jsonify({"error": "No reading for this date"}), 404
    return jsonify(_load_json(filepath))


# --- Settings ---
@app.route("/api/settings", methods=["GET"])
def get_settings():
    s = _get_settings()
    # Determine API key source: .env takes priority
    env_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if env_key:
        s["api_key_source"] = "env"
        key = env_key
    else:
        s["api_key_source"] = "settings"
        key = s.get("api_key", "")
    # Mask API key in response
    if key and len(key) > 4:
        s["api_key_masked"] = "sk-..." + key[-4:]
    else:
        s["api_key_masked"] = key
    return jsonify(s)


@app.route("/api/settings", methods=["PUT"])
def update_settings():
    body = request.get_json(silent=True) or {}
    current = _get_settings()
    allowed_keys = [
        "api_key", "api_base_url", "segmentCount", "wordsPerSegment", "difficulty",
        "savedTopics", "defaultTopic", "vocabIntegration", "vocabIntegrationCount",
        "wordClickMode",
    ]
    for key in allowed_keys:
        if key in body:
            current[key] = body[key]
    _save_settings(current)
    return jsonify(current)


# --- Debug: list all routes ---
@app.route("/api/_routes", methods=["GET"])
def list_routes():
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({"endpoint": rule.endpoint, "methods": list(rule.methods), "rule": rule.rule})
    return jsonify({"routes": routes})


# --- Health ---
@app.route("/api/health", methods=["GET"])
def health():
    settings = _get_settings()
    api_key = _get_api_key()
    return jsonify({
        "status": "ok",
        "apiConfigured": bool(api_key),
        "readingsCount": len(list(READINGS_DIR.glob("*.json"))) if READINGS_DIR.exists() else 0,
        "vocabCount": len(_get_vocabulary().get("words", [])),
    })


# Ensure ALL errors return JSON, not HTML.
# Flask resolves HTTPException handlers by iterating error_handler_spec keys:
#   isinstance(e, HTTPException) matches before code-based (404/405/500) lookup.
# So we register per-code handlers for every HTTP status we might encounter,
# plus an Exception catch-all for non-HTTP errors.
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
    """Catch-all for non-HTTP exceptions: ensure nothing ever returns HTML."""
    # Avoid traceback.print_exc() which may fail with non-ASCII in PyInstaller
    try:
        traceback.print_exc()
    except Exception:
        pass
    msg = str(e).encode("utf-8", errors="replace").decode("utf-8")
    return jsonify({"error": f"Server error: {msg}"}), 500


# --- Shutdown ---
@app.route("/api/shutdown", methods=["POST"])
def shutdown():
    """Shut down the application server."""
    import os as _os
    _os._exit(0)


if __name__ == "__main__":
    READINGS_DIR.mkdir(parents=True, exist_ok=True)
    print("=== EnglishReader v2.0 starting ===", flush=True)
    import webbrowser
    webbrowser.open("http://127.0.0.1:5000")
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
