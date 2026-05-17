"""English reading content generator using LLM API."""

import re
import json
import requests


class ReadingGenerator:
    def __init__(self, api_key: str, api_base_url: str, model: str = "deepseek-chat"):
        self.api_key = api_key
        self.api_base_url = api_base_url.rstrip("/")
        self.model = model

    def generate(
        self,
        topic: str,
        count: int,
        words_per_seg: int,
        difficulty: str,
        vocab_words: list[str],
    ) -> list[dict]:
        """
        Generate English reading segments.

        Returns a list of dicts: {english, chinese, keywords}
        Implements retry and supplement logic per the four-layer control strategy.
        """
        all_segments = []
        remaining = count
        max_attempts = 3
        temperature = 0.8

        for attempt in range(max_attempts):
            prompt = self._build_prompt(
                topic=topic,
                count=remaining,
                words_per_seg=words_per_seg,
                difficulty=difficulty,
                vocab_words=vocab_words,
            )
            raw = self._call_api(prompt, temperature)
            segments = self._parse_response(raw, words_per_seg)

            all_segments.extend(segments)

            if len(all_segments) >= count:
                break

            remaining = count - len(all_segments)
            temperature = 0.9  # supplement generation: higher temp for variety

            if len(segments) == 0:
                temperature = 0.7  # retry: lower temp for stability

        return all_segments[:count]

    def _build_prompt(
        self,
        topic: str,
        count: int,
        words_per_seg: int,
        difficulty: str,
        vocab_words: list[str],
    ) -> str:
        """Construct the system + user prompt for LLM."""
        difficulty_map = {
            "beginner": "beginner (simple vocabulary, short sentences, CEFR A2-B1)",
            "intermediate": "intermediate (moderate vocabulary, mixed sentence structures, CEFR B1-B2)",
            "advanced": "advanced (sophisticated vocabulary, complex sentences, CEFR C1+)",
        }
        diff_desc = difficulty_map.get(difficulty, difficulty_map["intermediate"])

        vocab_list_str = ", ".join(vocab_words) if vocab_words else "none"

        system = (
            "You are an English reading material generator for Chinese ESL learners. "
            "Output ONLY the requested format. No extra text, no introductions, no conclusions."
        )

        user = f"""Generate {count} English reading segments.

TOPIC: {topic}
- Every segment MUST relate directly to this topic. Do NOT drift off-topic.
- If the topic is "HOT TOPICS", choose a recent trending news or cultural event from recent months and use it as the actual topic. State the specific event in the first segment.

DIFFICULTY: {diff_desc}
WORDS PER SEGMENT: {words_per_seg} words (strict, within +/-15%)

VOCABULARY TO USE (REQUIRED):
{vocab_list_str}
- You MUST use every word from this list at least once across the segments.
- Mark vocabulary words with **word** (bold) so the reader can spot them.
- Use them naturally  do NOT force them into unrelated content.

=== FORMAT RULES (follow exactly) ===

Output each segment using this exact format:

[SEG]
EN: <English text, about {words_per_seg} words, strictly about {topic}>
ZH: <Natural Chinese translation, not word-for-word>
KW: <word1>|<word2>|<word3>
[/SEG]

=== CONTENT RULES ===
1. Each segment is COMPLETELY INDEPENDENT  no story continuity, no cross-references between segments. Each stands alone.
2. Stay ON-TOPIC: every segment must clearly relate to "{topic}"
3. VOCAB: **bold** every vocabulary word from the provided list
4. Mix formats: facts, opinions, short narratives, dialogues
5. Chinese translation must be natural and idiomatic
6. KW lists 2-4 words a {difficulty} learner might not know (can include vocab words), separated by |
7. Vary sentence structures; avoid repeating the same pattern
8. No markdown except **bold** for vocab words
9. No introductions, no conclusions, no extra text
10. Exactly {count} segments"""

        return f"{system}\n\n{user}"

    def _call_api(self, prompt: str, temperature: float) -> str:
        """Call the LLM API (OpenAI-compatible chat completions)."""
        url = f"{self.api_base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "max_tokens": 4096,
        }

        # Use a Session with trust_env=False to avoid importing netrc,
        # which causes zlib errors in PyInstaller-frozen builds.
        session = requests.Session()
        session.trust_env = False
        resp = session.post(url, headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        data = resp.json()
        session.close()
        return data["choices"][0]["message"]["content"]

    def _parse_response(self, raw: str, target_word_count: int) -> list[dict]:
        """Parse LLM output into structured segments with validation."""
        segments = []
        pattern = r"\[SEG\]\s*(.*?)\s*\[/SEG\]"
        matches = re.findall(pattern, raw, re.DOTALL)

        for match in matches:
            en_match = re.search(r"EN:\s*(.+?)(?=\n\s*(?:ZH|KW):)", match, re.DOTALL)
            zh_match = re.search(r"ZH:\s*(.+?)(?=\n\s*(?:KW):)", match, re.DOTALL)
            kw_match = re.search(r"KW:\s*(.+)", match)

            if not en_match or not zh_match:
                continue

            english = en_match.group(1).strip()
            chinese = zh_match.group(1).strip()
            kw_raw = kw_match.group(1).strip() if kw_match else ""
            keywords = [k.strip() for k in kw_raw.split("|") if k.strip()]

            # Word count validation: discard if off by >20%
            word_count = len(english.split())
            if target_word_count > 0:
                deviation = abs(word_count - target_word_count) / target_word_count
                if deviation > 0.2:
                    continue

            # Clean ** markers from word count but keep in display
            segments.append(
                {"english": english, "chinese": chinese, "keywords": keywords}
            )

        return segments

    @staticmethod
    def scan_vocab_contexts(
        segments: list[dict], vocab_words: list[dict], date_str: str
    ) -> list[dict]:
        """
        Scan generated segments for vocabulary words and return context records.
        Each record: {word, date, segmentId, sentence}
        """
        contexts = []
        for i, seg in enumerate(segments):
            english_lower = seg["english"].lower()
            for vw in vocab_words:
                word_lower = vw["word"].lower()
                if word_lower in english_lower:
                    contexts.append(
                        {
                            "word": vw["word"],
                            "date": date_str,
                            "segmentId": i,
                            "sentence": seg["english"],
                        }
                    )
        return contexts

    @staticmethod
    def check_missing_vocab(segments: list[dict], vocab_words: list[str]) -> list[str]:
        """Check which required vocab words didn't appear in the generated segments."""
        all_text = " ".join(s["english"].lower() for s in segments)
        missing = []
        for word in vocab_words:
            if word.lower() not in all_text:
                missing.append(word)
        return missing
