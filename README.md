# English Daily Reader

A local English reading tool for Chinese ESL learners. Generate personalized English reading segments with AI, look up words by double-clicking, and build your vocabulary systematically.

## Features

- **AI-generated reading content** -- Choose any topic you're interested in, or let AI pick trending topics
- **Chinese translations** -- Every segment comes with natural Chinese translation
- **Double-click dictionary** -- Click any word to see its definition, pronunciation, and part of speech
- **Vocabulary book** -- Save unfamiliar words, track mastery, review in context
- **Context tracking** -- See every occurrence of a vocabulary word across all your readings
- **Smart integration** -- AI incorporates your vocabulary words into new content, marked in **bold**
- **Per-day archive** -- All readings saved by date for easy review
- **Full local control** -- Your API key, your data. Nothing leaves your machine.

## Quick Start

### 1. Install

```bash
cd english-reader
pip install -r requirements.txt
python app.py
```

### 2. Open in Browser

Go to **http://localhost:5000** -- Settings tab -- enter your API Key -- click Save. That's it.

### 3. Start Reading

Go to Reading tab -- enter a topic (or leave empty for trending topics) -- click "Generate"

## Usage

- **Generate reading** -- Enter a topic, adjust sliders for word count and segment count, click "Generate"
- **Read & learn** -- Vocabulary words from your book are shown in **bold**
- **Look up words** -- Double-click any English word to see its definition, click "Add to vocabulary"
- **Review vocabulary** -- Switch to Vocabulary tab to see saved words, filter, and browse context history
- **Track context** -- Click a word in Vocabulary to see every sentence where it appeared across readings

## Project Structure

```
english-reader/
├── app.py                # Flask backend
├── generator.py          # AI content generation module
├── dictionary.py         # Word lookup (free API + LLM fallback)
├── requirements.txt      # Python dependencies
├── .gitignore
├── README.md
├── static/
│   ├── index.html        # Frontend UI
│   ├── style.css         # Styles
│   └── app.js            # Frontend logic
└── data/
    ├── readings/         # Daily reading archives (JSON)
    ├── vocabulary.json   # Your vocabulary book
    └── settings.json     # User preferences & API key (local)
```

## API Providers

Works with any OpenAI-compatible API:

| Provider | Base URL |
|----------|----------|
| DeepSeek | `https://api.deepseek.com/v1` |
| OpenAI | `https://api.openai.com/v1` |
| Other compatible | Your provider's URL |

## License

MIT
