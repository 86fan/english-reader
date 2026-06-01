"""Fetch real trending news headlines from free RSS feeds for English Reader.

Uses xml.etree.ElementTree (stdlib) only — no extra dependencies.
"""

import random
import xml.etree.ElementTree as ET

import requests

# Free, no-auth RSS feeds — all English-language
RSS_FEEDS = [
    "http://feeds.bbci.co.uk/news/rss.xml",
    "https://feeds.npr.org/1001/rss.xml",
    "https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en",
]

REQUEST_TIMEOUT = 8  # seconds per feed
USER_AGENT = "EnglishReader/1.0"
MIN_HEADLINE_LEN = 10  # skip stub / placeholder titles


def fetch_trending_headlines() -> list[str]:
    """Fetch headlines from all configured RSS feeds.

    Returns:
        List of headline strings (may be empty if all feeds fail).
    """
    all_headlines: list[str] = []

    session = requests.Session()
    session.trust_env = False

    for url in RSS_FEEDS:
        try:
            resp = session.get(
                url,
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT,
            )
            resp.raise_for_status()

            root = ET.fromstring(resp.content)

            # RSS 2.0: items under <channel>
            for item in root.iter("item"):
                title_el = item.find("title")
                if title_el is not None and title_el.text:
                    text = title_el.text.strip()
                    if len(text) >= MIN_HEADLINE_LEN:
                        all_headlines.append(text)

            # Atom namespace fallback
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            for entry in root.iterfind(".//atom:entry", ns):
                title_el = entry.find("atom:title", ns)
                if title_el is not None and title_el.text:
                    text = title_el.text.strip()
                    if len(text) >= MIN_HEADLINE_LEN:
                        all_headlines.append(text)

        except Exception:
            # One feed failing should not block others
            continue
        finally:
            session.close()

    return all_headlines


def fetch_trending_topic() -> str | None:
    """Fetch a single trending topic headline.

    Returns:
        A headline string, or None if all feeds failed.
    """
    headlines = fetch_trending_headlines()
    if headlines:
        return random.choice(headlines)
    return None
