"""Dictionary lookup: local ECDICT SQLite + Baidu/LLM translate + LLM explain."""

import hashlib
import json
import random
import sys
from pathlib import Path
from threading import Lock

import requests

# sqlite3 is imported lazily in _lookup_local() because sqlite3.dll may not be
# resolvable in PyInstaller-frozen builds unless explicitly bundled.
_sqlite3 = None


def _get_data_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent / "data"
    return Path(__file__).parent / "data"


DB_PATH = _get_data_dir() / "ecdict.db"
DB_LOCK = Lock()


class Dictionary:
    def __init__(
        self,
        llm_api_key: str | None = None,
        llm_base_url: str | None = None,
    ):
        self.llm_api_key = llm_api_key
        self.llm_base_url = (llm_base_url or "").rstrip("/") if llm_base_url else ""
        self._cache: dict[str, dict] = {}

    # ---- Public API ----

    def lookup(self, word: str) -> dict:
        """Return local ECDICT lookup immediately (no network call)."""
        word_clean = word.lower().strip()
        if word_clean in self._cache:
            return self._cache[word_clean]

        local_result = self._lookup_local(word_clean)
        result = {
            "word": word,
            "local": local_result,
        }
        self._cache[word_clean] = result
        return result

    def translate_llm(self, word: str) -> dict:
        """Quick Chinese translation via LLM (network)."""
        if not self.llm_api_key:
            return {"error": "请先配置 API Key"}
        return self._translate_llm(word)

    def translate_baidu(self, word: str, app_id: str, secret_key: str) -> dict:
        """Quick Chinese translation via Baidu Translate API (free tier)."""
        if not app_id or not secret_key:
            return {"error": "请先配置百度翻译 API 密钥"}
        return self._translate_baidu(word, app_id, secret_key)

    def explain_llm(self, word: str) -> dict:
        """Generate a detailed Chinese explanation via LLM."""
        if not self.llm_api_key:
            return {"error": "请先配置 API Key"}
        return self._explain_llm(word)

    # ---- Local ECDICT SQLite ----

    def _lookup_local(self, word: str) -> dict | None:
        if not DB_PATH.exists():
            return None

        global _sqlite3
        if _sqlite3 is None:
            try:
                import sqlite3 as _sqlite3
            except ImportError:
                return None

        try:
            with DB_LOCK:
                conn = _sqlite3.connect(str(DB_PATH))
                conn.row_factory = _sqlite3.Row
                cur = conn.execute(
                    "SELECT word, phonetic, translation, definition, pos, "
                    "collins, oxford, tag, bnc, frq, exchange "
                    "FROM stardict WHERE word = ? OR sw = ?",
                    (word, word),
                )
                row = cur.fetchone()
                conn.close()

            if not row:
                return None

            return {
                "word": row["word"] or word,
                "phonetic": row["phonetic"] or "",
                "translation_cn": row["translation"] or "",
                "definition_en": row["definition"] or "",
                "pos": row["pos"] or "",
                "collins": row["collins"] or 0,
                "oxford": bool(row["oxford"]),
                "tag": row["tag"] or "",
                "bnc": row["bnc"] or 0,
                "frq": row["frq"] or 0,
                "exchange": row["exchange"] or "",
            }
        except Exception:
            return None

    # ---- LLM Quick Translation ----

    def _translate_llm(self, word: str) -> dict:
        try:
            url = f"{self.llm_base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.llm_api_key}",
                "Content-Type": "application/json",
            }
            prompt = (
                f"Translate the English word '{word}' into Chinese. "
                f"Return ONLY a JSON object with a single key 'translation_cn'. "
                f'Example: {{"translation_cn": "苹果"}}'
            )
            payload = {
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 128,
            }
            session = requests.Session()
            session.trust_env = False
            resp = session.post(url, headers=headers, json=payload, timeout=15)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            content = resp.json()["choices"][0]["message"]["content"]
            session.close()

            content = content.strip()
            if content.startswith("```"):
                idx = content.find("\n")
                content = content[idx + 1:] if idx != -1 else content[3:]
                if content.endswith("```"):
                    content = content[:-3]
            return json.loads(content)
        except json.JSONDecodeError:
            return {"error": "翻译返回格式异常"}
        except Exception as e:
            return {"error": f"翻译失败: {str(e)}"}

    # ---- Baidu Translate API (free tier) ----

    def _translate_baidu(self, word: str, app_id: str, secret_key: str) -> dict:
        try:
            salt = str(random.randint(32768, 65536))
            sign_str = app_id + word + salt + secret_key
            sign = hashlib.md5(sign_str.encode("utf-8")).hexdigest()

            url = "https://fanyi-api.baidu.com/api/trans/vip/translate"
            params = {
                "q": word,
                "from": "en",
                "to": "zh",
                "appid": app_id,
                "salt": salt,
                "sign": sign,
            }
            session = requests.Session()
            session.trust_env = False
            resp = session.get(url, params=params, timeout=10)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            data = resp.json()
            session.close()

            if "error_code" in data:
                error_msg = data.get("error_msg", "未知错误")
                return {"error": f"百度翻译错误: {error_msg}"}

            translations = data.get("trans_result", [])
            if translations:
                return {"translation_cn": translations[0]["dst"]}
            return {"error": "百度翻译无结果"}
        except Exception as e:
            return {"error": f"百度翻译失败: {str(e)}"}

    # ---- LLM Detailed Explanation ----

    def _explain_llm(self, word: str) -> dict:
        try:
            url = f"{self.llm_base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.llm_api_key}",
                "Content-Type": "application/json",
            }
            prompt = (
                f"用中文详细解释英语单词 '{word}'，包含：\n"
                f"1. 中文释义（简洁）\n"
                f"2. 词根词缀拆解（如有）\n"
                f"3. 2-3个例句（英文 + 中文翻译）\n"
                f"4. 近义词辨析（如有）\n"
                f"5. 使用场景 / 正式程度\n\n"
                f"返回 JSON 格式（不要 markdown 代码块标记）：\n"
                f'{{"explanation_cn": "", "etymology": "", '
                f'"examples": [{{"en": "", "zh": ""}}], '
                f'"synonyms": "", "usage": ""}}'
            )
            payload = {
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 1024,
            }
            session = requests.Session()
            session.trust_env = False
            resp = session.post(url, headers=headers, json=payload, timeout=60)
            resp.raise_for_status()
            resp.encoding = "utf-8"
            content = resp.json()["choices"][0]["message"]["content"]
            session.close()

            # Extract JSON from response
            content = content.strip()
            if content.startswith("```"):
                idx = content.find("\n")
                content = content[idx + 1:] if idx != -1 else content[3:]
                if content.endswith("```"):
                    content = content[:-3]
            return json.loads(content)
        except json.JSONDecodeError:
            return {"error": "LLM 返回格式异常，请重试"}
        except Exception as e:
            return {"error": f"LLM 解释失败: {str(e)}"}
