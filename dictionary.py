"""Dictionary lookup module - free API with LLM fallback."""

import json
import requests


class Dictionary:
    def __init__(self, llm_api_key: str | None = None, llm_base_url: str | None = None):
        self.cache: dict[str, dict] = {}
        self.llm_api_key = llm_api_key
        self.llm_base_url = (llm_base_url or "").rstrip("/") if llm_base_url else ""

    def lookup(self, word: str) -> dict:
        """
        Look up a word. Strategy:
        1. Check in-memory cache
        2. Try free dictionary API
        3. Fall back to LLM
        """
        word_lower = word.lower().strip()
        if word_lower in self.cache:
            return self.cache[word_lower]

        result = self._try_free_api(word_lower)
        if not result:
            result = self._try_llm(word_lower)

        self.cache[word_lower] = result
        return result

    def _try_free_api(self, word: str) -> dict | None:
        """Try the free dictionaryapi.dev service."""
        try:
            url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{word}"
            session = requests.Session()
            session.trust_env = False
            resp = session.get(url, timeout=10)
            session.close()
            if resp.status_code != 200:
                return None
            data = resp.json()
            if not isinstance(data, list) or len(data) == 0:
                return None
            return self._normalize_free_api(data[0])
        except Exception:
            return None

    def _normalize_free_api(self, entry: dict) -> dict:
        """Convert dictionaryapi.dev response to our standard format."""
        word = entry.get("word", "")
        phonetic = ""
        phonetics = entry.get("phonetics", [])
        for p in phonetics:
            if p.get("text"):
                phonetic = p["text"]
                break
        if not phonetic and "phonetic" in entry:
            phonetic = entry["phonetic"]

        meanings = []
        for m in entry.get("meanings", []):
            pos = m.get("partOfSpeech", "")
            for d in m.get("definitions", []):
                meanings.append(
                    {
                        "pos": pos,
                        "def_en": d.get("definition", ""),
                        "def_cn": "",  # free API doesn't provide Chinese
                    }
                )

        return {
            "word": word,
            "phonetic": phonetic,
            "meanings": meanings,
            "source": "free_api",
        }

    def _try_llm(self, word: str) -> dict:
        """Fall back to LLM for word definition with Chinese translation."""
        if not self.llm_api_key:
            return {
                "word": word,
                "phonetic": "",
                "meanings": [],
                "source": "none",
                "error": "No API key configured for LLM fallback",
            }

        try:
            url = f"{self.llm_base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self.llm_api_key}",
                "Content-Type": "application/json",
            }
            prompt = (
                f'Explain the English word "{word}". '
                f"Return ONLY a JSON object (no markdown, no backticks) with these fields: "
                f'phonetic (IPA string), meanings (array of {{pos, def_cn, def_en}}). '
                f'Example: {{"phonetic": "/haɪ/", "meanings": [{{"pos": "adj.", "def_cn": "高的", "def_en": "of great vertical extent"}}]}}'
            )
            payload = {
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 512,
            }
            session = requests.Session()
            session.trust_env = False
            resp = session.post(url, headers=headers, json=payload, timeout=30)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            session.close()

            # Try to extract JSON from the response
            content_clean = content.strip()
            if content_clean.startswith("```"):
                content_clean = content_clean.split("\n", 1)[1]
                if content_clean.endswith("```"):
                    content_clean = content_clean[:-3]
            data = json.loads(content_clean)

            return {
                "word": word,
                "phonetic": data.get("phonetic", ""),
                "meanings": data.get("meanings", []),
                "source": "llm",
            }
        except Exception:
            return {
                "word": word,
                "phonetic": "",
                "meanings": [],
                "source": "error",
                "error": "Failed to look up word",
            }
