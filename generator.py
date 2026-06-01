"""English reading content generator using LLM API."""

import re
import json
from datetime import date

import requests


# Difficulty levels mapped to CEFR and vocabulary/sentence guidelines
DIFFICULTY_MAP = {
    "highschool": "高中水平 (senior high school English, vocabulary ~3000 words, simple to moderate sentence structures, CEFR A2-B1)",
    "cet4": "四级水平 (CET-4, vocabulary ~4500 words, moderate sentence structures, some complex grammar, CEFR B1)",
    "cet6": "六级水平 (CET-6, vocabulary ~6000 words, varied sentence structures, advanced grammar patterns, CEFR B2)",
    "postgrad": "考研水平 (postgraduate entrance exam, vocabulary ~8000 words, complex academic sentence structures, sophisticated arguments, CEFR B2-C1)",
    "ielts": "雅思水平 (IELTS, vocabulary ~8000 words, academic and formal registers, complex logical structures, CEFR B2-C1)",
}


class ReadingGenerator:
    def __init__(self, api_key: str, api_base_url: str, model: str = "deepseek-chat"):
        self.api_key = api_key
        self.api_base_url = api_base_url.rstrip("/")
        self.model = model
        self.last_topic: str | None = None

    def generate(
        self,
        topic: str,
        count: int,
        words_per_seg: int,
        difficulty: str,
        vocab_words: list[str],
    ) -> list[dict]:
        all_segments = []
        remaining = count
        max_attempts = 3
        temperature = 0.8
        self.last_topic = None

        for attempt in range(max_attempts):
            prompt = self._build_prompt(
                topic=topic,
                count=remaining,
                words_per_seg=words_per_seg,
                difficulty=difficulty,
                vocab_words=vocab_words,
            )
            raw = self._call_api(prompt, temperature)
            response_topic, segments = self._parse_response(raw, words_per_seg)

            if response_topic and not self.last_topic:
                self.last_topic = response_topic

            all_segments.extend(segments)

            if len(all_segments) >= count:
                break

            remaining = count - len(all_segments)
            temperature = 0.9

            if len(segments) == 0:
                temperature = 0.7

        return all_segments[:count]

    def _build_prompt(
        self,
        topic: str,
        count: int,
        words_per_seg: int,
        difficulty: str,
        vocab_words: list[str],
    ) -> str:
        diff_desc = DIFFICULTY_MAP.get(difficulty, DIFFICULTY_MAP["cet6"])

        vocab_list_str = ", ".join(vocab_words) if vocab_words else "none"

        system = (
            "You are an English reading material generator for Chinese learners. "
            "Output ONLY the requested format. No extra text, no introductions, no conclusions. "
            "You MUST write at least the specified word count — do NOT write short segments."
        )

        # Normalize HOT_TOPICS sentinel
        display_topic = topic
        if topic == "__HOT_TOPICS__":
            display_topic = "近期热点 (choose a specific recent trending news or cultural event)"

        today_str = date.today().isoformat()

        user = f"""Today's date: {today_str}

Generate {count} English reading segments.

TOPIC: {display_topic}
- Every segment MUST relate directly to this topic. Do NOT drift off-topic.
- If the topic is about recent/trending/hot topics: use a specific, real-world recent event or cultural phenomenon from your training data that would interest English learners. The date above tells you what "recent" means — choose something genuinely from around this time period, not a generic AI/tech topic unless it's truly the most relevant current event.

DIFFICULTY: {diff_desc}
WORDS PER SEGMENT: EXACTLY between {words_per_seg} (minimum) and {int(words_per_seg * 1.2)} (maximum) English words total across all sentences in the segment. You MUST reach at least {words_per_seg} words — no fewer. Do not exceed {int(words_per_seg * 1.2)}.

VOCABULARY TO USE (REQUIRED):
{vocab_list_str}
- You MUST use every word from this list at least once across the segments.
- Mark vocabulary words with **word** (bold) so the reader can spot them.
- Use them naturally — do NOT force them into unrelated content.

=== FORMAT RULES (follow exactly) ===

First, output the actual topic as a single line:

TOPIC: <the actual topic in a few words, for display>

Then output each segment. A segment contains multiple sentence-pairs separated by ---:

[SEG]
S: <One English sentence, ending with . ? or !>
T: <Natural Chinese translation of the English sentence above>
---
S: <One English sentence, ending with . ? or !>
T: <Natural Chinese translation of the English sentence above>
---
KW: <word1>|<word2>|<word3>
[/SEG]

CRITICAL format rules:
- Each S line is ONE English sentence ending with . ? or !
- Each T line is the Chinese translation of the S line immediately above it
- Separate each S/T pair group with a line containing ONLY "---"
- The segment can have 4-8 sentence-pairs (varies naturally)
- Output KW on the final line, listing 2-4 keywords separated by |
- NO other text, NO introductions, NO conclusions

=== CONTENT RULES ===
1. Each segment is COMPLETELY INDEPENDENT — no story continuity, no cross-references between segments
2. Stay ON-TOPIC: every segment must clearly relate to the topic
3. VOCAB: **bold** every vocabulary word from the provided list
4. Mix formats: facts, opinions, short narratives, dialogues
5. Chinese translation must be natural and idiomatic
6. KW lists 2-4 words the reader might not know (can include vocab words)
7. Vary sentence structures; avoid repeating the same pattern
8. No markdown except **bold** for vocab words
9. CRITICAL: Total English words across ALL S lines in a segment MUST be at least {words_per_seg} and at most {int(words_per_seg * 1.2)}. Count every word carefully. No fewer than {words_per_seg}, no more than {int(words_per_seg * 1.2)}.
10. Exactly {count} segments"""

        return f"{system}\n\n{user}"

    def _call_api(self, prompt: str, temperature: float) -> str:
        url = f"{self.api_base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        parts = prompt.split("\n\n", 1)
        system_msg = parts[0] if len(parts) > 1 else ""
        user_msg = parts[1] if len(parts) > 1 else prompt
        messages = []
        if system_msg:
            messages.append({"role": "system", "content": system_msg})
        messages.append({"role": "user", "content": user_msg})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": 8192,
        }

        session = requests.Session()
        session.trust_env = False
        resp = session.post(url, headers=headers, json=payload, timeout=120)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        data = resp.json()
        session.close()
        return data["choices"][0]["message"]["content"]

    def _parse_response(self, raw: str, target_word_count: int) -> tuple[str | None, list[dict]]:
        actual_topic = None
        topic_match = re.search(r"^TOPIC:\s*(.+?)$", raw, re.MULTILINE)
        if topic_match:
            actual_topic = topic_match.group(1).strip()

        segments = []
        pattern = r"\[SEG\]\s*(.*?)\s*\[/SEG\]"
        matches = re.findall(pattern, raw, re.DOTALL)

        for match in matches:
            # Extract KW line first (remove it from match for pair parsing)
            kw_match = re.search(r"^KW:\s*(.+)", match, re.MULTILINE)
            kw_raw = kw_match.group(1).strip() if kw_match else ""
            keywords = [k.strip() for k in kw_raw.split("|") if k.strip()]

            # Remove KW line, then parse sentence pairs
            pair_text = re.sub(r"^KW:.*$", "", match, flags=re.MULTILINE).strip()
            blocks = re.split(r"\n\s*---\s*\n", pair_text)

            pairs = []
            for block in blocks:
                block = block.strip()
                if not block:
                    continue
                s_match = re.search(r"^S:\s*(.+?)$", block, re.MULTILINE)
                t_match = re.search(r"^T:\s*(.+?)$", block, re.MULTILINE)
                if s_match and t_match:
                    pairs.append({
                        "en": s_match.group(1).strip(),
                        "zh": t_match.group(1).strip(),
                    })

            # Fallback to old format if no sentence pairs found
            if not pairs:
                en_match = re.search(r"EN:\s*(.+?)(?=\n\s*(?:ZH|KW):)", match, re.DOTALL)
                zh_match = re.search(r"ZH:\s*(.+?)(?=\n\s*(?:KW):)", match, re.DOTALL)
                if en_match and zh_match:
                    pairs = [{"en": en_match.group(1).strip(), "zh": zh_match.group(1).strip()}]

            if not pairs:
                continue

            english_combined = " ".join(p["en"] for p in pairs)
            chinese_combined = "".join(p["zh"] for p in pairs)

            word_count = len(english_combined.split())
            min_words = max(20, int(target_word_count * 0.7))
            if word_count < min_words:
                continue

            segments.append({
                "sentences": pairs,
                "english": english_combined,
                "chinese": chinese_combined,
                "keywords": keywords,
            })

        return actual_topic, segments

    @staticmethod
    def scan_vocab_contexts(
        segments: list[dict], vocab_words: list[dict], date_str: str
    ) -> list[dict]:
        contexts = []
        for i, seg in enumerate(segments):
            english_text = seg.get("english", "")
            english_lower = english_text.lower()
            # Also check individual sentences
            for s in seg.get("sentences", []):
                english_lower += " " + s["en"].lower()
            for vw in vocab_words:
                word_lower = vw["word"].lower()
                if word_lower in english_lower:
                    # Find the specific sentence containing this word
                    sentence_text = english_text
                    for s in seg.get("sentences", []):
                        if word_lower in s["en"].lower():
                            sentence_text = s["en"]
                            break
                    contexts.append({
                        "word": vw["word"],
                        "date": date_str,
                        "segmentId": i,
                        "sentence": sentence_text,
                    })
        return contexts

    @staticmethod
    def check_missing_vocab(segments: list[dict], vocab_words: list[str]) -> list[str]:
        all_text = " ".join(s.get("english", "") for s in segments)
        missing = []
        for word in vocab_words:
            if word.lower() not in all_text.lower():
                missing.append(word)
        return missing
