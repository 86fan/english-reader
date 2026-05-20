/* === English Daily Reader - Frontend Logic === */

// ===================== STATE =====================
let currentTab = 'reading';
let currentFilter = 'all';
let vocabData = { words: [], total: 0, unmastered: 0, mastered: 0 };
let settingsData = {};
let expandedWord = null;
let currentReadingDate = '';
let currentReadingTopic = '';
let currentWordContext = null; // {date, segmentId, sentence} — set when clicking word in segment

let currentDictWord = '';    // word currently shown in left panel

// Panel state
let leftPanelOpen = false;
let rightPanelOpen = true;

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  currentReadingDate = today;

  initTabs();
  initPanels();
  initTopicInput();
  initSliders();
  initSettingsSliders();
  initGenerate();
  initLoadMore();
  initDictPanel();
  initVocabulary();
  initSettings();
  initBackToToday();
  loadSettings();
  loadVocab();
  loadHistoryPanel();

  // Exit button
  document.getElementById('exit-btn').addEventListener('click', async () => {
    try { await fetch('/api/shutdown', { method: 'POST' }); } catch (e) {}
    window.close();
  });

  // Load today's reading by default
  loadReading(today);
});

// ===================== TABS =====================
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.getElementById(`tab-${tabId}`).classList.add('active');
      currentTab = tabId;
      // Reset right panel title based on tab
      const titleEl = document.getElementById('right-panel-title');
      if (tabId === 'reading') {
        if (titleEl) titleEl.textContent = '历史阅读';
        loadHistoryPanel();
      } else if (tabId === 'vocabulary') {
        if (titleEl) titleEl.textContent = '出处片段';
        loadVocab();
        // Show placeholder in right panel
        const histContent = document.getElementById('history-panel-content');
        if (histContent) histContent.innerHTML = '<p class="history-empty">点击左侧单词<br>查看出处片段</p>';
      }
      if (tabId === 'settings') loadSettings();
    });
  });
}

// ===================== PANEL TOGGLES =====================
function initPanels() {
  const layout = document.getElementById('main-layout');
  const leftPanel = document.getElementById('left-panel');
  const rightPanel = document.getElementById('right-panel');
  const leftBtn = document.getElementById('toggle-left-panel');
  const rightBtn = document.getElementById('toggle-right-panel');
  const overlay = document.getElementById('overlay');

  // Close buttons
  document.getElementById('close-left-panel').addEventListener('click', () => {
    toggleLeftPanel(false);
  });
  document.getElementById('close-right-panel').addEventListener('click', () => {
    toggleRightPanel(false);
  });

  // Header toggle buttons
  leftBtn.addEventListener('click', () => toggleLeftPanel(!leftPanelOpen));
  rightBtn.addEventListener('click', () => toggleRightPanel(!rightPanelOpen));

  // Overlay click closes panels
  overlay.addEventListener('click', () => {
    if (leftPanelOpen) toggleLeftPanel(false);
    if (rightPanelOpen) toggleRightPanel(false);
  });

  // Apply initial state
  toggleLeftPanel(false);
  toggleRightPanel(true);
}

function toggleLeftPanel(open) {
  leftPanelOpen = open;
  const leftPanel = document.getElementById('left-panel');
  const btn = document.getElementById('toggle-left-panel');

  if (open) {
    leftPanel.classList.remove('collapsed');
    btn.classList.add('active');
    if (window.innerWidth <= 768 && rightPanelOpen) {
      toggleRightPanel(false);
    }
  } else {
    leftPanel.classList.add('collapsed');
    btn.classList.remove('active');
  }

  updateOverlay();
  updateLayoutClass();
}

function toggleRightPanel(open) {
  rightPanelOpen = open;
  const rightPanel = document.getElementById('right-panel');
  const btn = document.getElementById('toggle-right-panel');

  if (open) {
    rightPanel.classList.remove('collapsed');
    btn.classList.add('active');
    if (window.innerWidth <= 768 && leftPanelOpen) {
      toggleLeftPanel(false);
    }
  } else {
    rightPanel.classList.add('collapsed');
    btn.classList.remove('active');
  }

  updateOverlay();
  updateLayoutClass();
}

function updateOverlay() {
  const overlay = document.getElementById('overlay');
  if (leftPanelOpen || rightPanelOpen) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function updateLayoutClass() {
  const layout = document.getElementById('main-layout');
  layout.classList.remove('left-collapsed', 'both-collapsed', 'right-collapsed', 'left-visible', 'right-visible');

  if (window.innerWidth <= 768) return; // mobile uses single column + overlay

  if (!leftPanelOpen && !rightPanelOpen) {
    layout.classList.add('both-collapsed');
  } else if (!leftPanelOpen) {
    layout.classList.add('left-collapsed');
  } else if (!rightPanelOpen) {
    layout.classList.add('right-collapsed');
  }
}

window.addEventListener('resize', () => {
  // Close all panels when resizing to mobile to avoid stale state
  if (window.innerWidth <= 768 && (leftPanelOpen || rightPanelOpen)) {
    // keep panels open, they just render differently
  }
  updateLayoutClass();
});

// ===================== TOAST =====================
function showToast(msg, duration = 2000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), duration);
}

// ===================== TOPIC INPUT =====================
function initTopicInput() {
  const input = document.getElementById('topic-input');
  const dropdown = document.getElementById('topic-dropdown');
  const historyBtn = document.getElementById('topic-history-btn');

  input.addEventListener('focus', () => showTopicDropdown());
  historyBtn.addEventListener('click', () => {
    if (dropdown.classList.contains('hidden')) {
      showTopicDropdown();
    } else {
      dropdown.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topic-input-wrap')) {
      dropdown.classList.add('hidden');
    }
  });
}

function showTopicDropdown() {
  const dropdown = document.getElementById('topic-dropdown');
  dropdown.innerHTML = '';

  const hotItem = document.createElement('div');
  hotItem.className = 'topic-dropdown-item';
  hotItem.textContent = '近期热点 (默认)';
  hotItem.addEventListener('mousedown', () => {
    document.getElementById('topic-input').value = '';
    dropdown.classList.add('hidden');
  });
  dropdown.appendChild(hotItem);

  const topics = settingsData.savedTopics || [];
  topics.forEach(t => {
    const item = document.createElement('div');
    item.className = 'topic-dropdown-item';
    item.textContent = t;
    item.addEventListener('mousedown', () => {
      document.getElementById('topic-input').value = t;
      dropdown.classList.add('hidden');
    });
    dropdown.appendChild(item);
  });

  if (topics.length > 0 || true) {
    dropdown.classList.remove('hidden');
  }
}

// ===================== SLIDERS =====================
function bindSlider(sliderId, inputId, valId) {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  const valSpan = document.getElementById(valId);

  function syncFromSlider() {
    const v = parseInt(slider.value);
    input.value = v;
    if (valSpan) valSpan.textContent = v;
  }

  function syncFromInput() {
    let v = parseInt(input.value);
    if (isNaN(v)) return;
    v = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), v));
    input.value = v;
    slider.value = v;
    if (valSpan) valSpan.textContent = v;
  }

  slider.addEventListener('input', syncFromSlider);
  input.addEventListener('change', syncFromInput);
  input.addEventListener('blur', syncFromInput);
}

function initSliders() {
  bindSlider('words-slider', 'words-input', 'words-val');
  bindSlider('count-slider', 'count-input', 'count-val');
}

function initSettingsSliders() {
  bindSlider('setting-words-slider', 'setting-words-input', 'setting-words-val');
  bindSlider('setting-count-slider', 'setting-count-input', 'setting-count-val');
  bindSlider('setting-vocab-count-slider', 'setting-vocab-count-input', 'setting-vocab-count-val');
}

// ===================== GENERATE =====================
function initGenerate() {
  document.getElementById('generate-btn').addEventListener('click', generate);
}

async function generate() {
  const btn = document.getElementById('generate-btn');
  const status = document.getElementById('generate-status');

  const topic = document.getElementById('topic-input').value.trim();
  const wordsPerSegment = parseInt(document.getElementById('words-input').value);
  const count = parseInt(document.getElementById('count-input').value);

  btn.disabled = true;
  btn.textContent = '生成中...';
  status.textContent = '';
  status.className = 'status';

  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: topic || null,
        wordsPerSegment,
        count,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || '生成失败');
    }

    currentReadingDate = data.date;
    currentReadingTopic = data.topic || topic || '近期热点';

    if (data.topic && data.topic !== '__HOT_TOPICS__') {
      addToSavedTopics(data.topic);
    }

    renderSegments(data.segments);
    document.getElementById('load-more-wrap').classList.remove('hidden');
    status.textContent = `已生成 ${data.segments.length} 段 | `;
    status.className = 'status success';

    if (data.missingVocab && data.missingVocab.length > 0) {
      status.textContent += ` 未融入生词: ${data.missingVocab.join(', ')}`;
    }

    // Auto-scroll to segments so user can see results and load-more button
    document.getElementById('segments-container').scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast('生成完成!');
    loadVocab();
    loadHistoryPanel();
  } catch (err) {
    status.textContent = `错误: ${err.message}`;
    status.className = 'status error';
  } finally {
    btn.disabled = false;
    btn.textContent = '生成英语片段';
  }
}

// ===================== RENDER SEGMENTS =====================
function renderSegments(segments) {
  const container = document.getElementById('segments-container');
  container.innerHTML = '';

  if (!segments || segments.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#999;">暂无内容，点击上方按钮生成</p>';
    return;
  }

  segments.forEach((seg, idx) => {
    const card = document.createElement('div');
    card.className = 'segment-card';
    card.dataset.segmentId = seg.id !== undefined ? seg.id : idx;

    const index = document.createElement('div');
    index.className = 'segment-index';
    const wordCount = seg.english ? seg.english.split(/\s+/).length : 0;
    index.textContent = `第 ${idx + 1} 段 · ${wordCount} 词`;

    // Check for sentence-pair format
    if (seg.sentences && seg.sentences.length > 0) {
      const enDiv = document.createElement('div');
      enDiv.className = 'segment-en';

      seg.sentences.forEach((pair) => {
        const sLine = document.createElement('div');
        sLine.className = 'sentence-line';

        const enText = document.createElement('span');
        enText.className = 'sentence-en-text';
        enText.innerHTML = tokenizeEnglish(pair.en);

        const zhText = document.createElement('span');
        zhText.className = 'sentence-zh-text';
        zhText.textContent = pair.zh;

        sLine.appendChild(enText);
        sLine.appendChild(zhText);
        enDiv.appendChild(sLine);
      });

      card.appendChild(index);
      card.appendChild(enDiv);
    } else {
      // Backward compat: old format without sentence pairs
      const enDiv = document.createElement('div');
      enDiv.className = 'segment-en-full';
      enDiv.innerHTML = tokenizeEnglish(seg.english);

      const zhDiv = document.createElement('div');
      zhDiv.className = 'segment-zh';
      zhDiv.textContent = seg.chinese;

      card.appendChild(index);
      card.appendChild(enDiv);
      card.appendChild(zhDiv);
    }

    // Keywords
    if (seg.keywords && seg.keywords.length > 0) {
      const kwDiv = document.createElement('div');
      kwDiv.className = 'segment-kw';
      kwDiv.innerHTML = '关键词: ' + seg.keywords.map(k =>
        `<span class="kw-tag">${escapeHtml(k)}</span>`
      ).join(' ');
      card.appendChild(kwDiv);
    }

    container.appendChild(card);
  });
}

function tokenizeEnglish(text) {
  // Phase 1: Replace **...** markers with <strong> tags
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Phase 2: Wrap non-tag words in <span class="word">
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  function walkAndWrap(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const fragment = document.createDocumentFragment();
      const text = node.textContent;
      const parts = text.split(/(\s+)/);

      for (const part of parts) {
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
          continue;
        }
        const m = part.match(/^([^a-zA-Z0-9'-]*)([a-zA-Z0-9'-]+)([^a-zA-Z0-9'-]*)$/);
        if (m) {
          const lead = m[1];
          const word = m[2];
          const trail = m[3];

          if (lead) fragment.appendChild(document.createTextNode(lead));
          const span = document.createElement('span');
          span.className = 'word';
          span.dataset.word = word.toLowerCase();
          span.textContent = word;
          fragment.appendChild(span);
          if (trail) fragment.appendChild(document.createTextNode(trail));
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      }
      node.parentNode.replaceChild(fragment, node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'strong') {
        const children = Array.from(node.childNodes);
        for (const child of children) {
          walkAndWrap(child);
        }
        node.querySelectorAll('.word').forEach(span => {
          span.classList.add('vocab-word');
        });
      } else {
        const children = Array.from(node.childNodes);
        for (const child of children) {
          walkAndWrap(child);
        }
      }
    }
  }

  walkAndWrap(tmp);
  return tmp.innerHTML;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===================== LOAD READING =====================
async function loadReading(dateStr) {
  const container = document.getElementById('segments-container');
  const loadMore = document.getElementById('load-more-wrap');
  const backBar = document.getElementById('back-to-today-bar');
  const backLabel = document.getElementById('back-to-today-label');

  try {
    const resp = await fetch(`/api/readings/${dateStr}`);
    if (!resp.ok) {
      container.innerHTML = '<p style="text-align:center;color:#999;">该日期暂无阅读内容</p>';
      loadMore.classList.add('hidden');
      backBar.classList.add('hidden');
      return;
    }
    const data = await resp.json();
    currentReadingTopic = data.topic || '';
    renderSegments(data.segments);

    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) {
      loadMore.classList.remove('hidden');
      backBar.classList.add('hidden');
    } else {
      loadMore.classList.add('hidden');
      backBar.classList.remove('hidden');
      backLabel.textContent = `正在查看 ${dateStr} 的历史阅读`;
    }
  } catch (err) {
    container.innerHTML = '<p style="text-align:center;color:#c0392b;">加载失败</p>';
    backBar.classList.add('hidden');
  }
}

function initBackToToday() {
  document.getElementById('back-to-today-btn').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    currentReadingDate = today;
    loadReading(today);
    // Update history panel highlight
    const content = document.getElementById('history-panel-content');
    if (content) {
      content.querySelectorAll('.history-item').forEach(el => el.classList.remove('current'));
      const todayItem = content.querySelector(`.history-item[data-date="${today}"]`);
      if (todayItem) todayItem.classList.add('current');
    }
    document.getElementById('back-to-today-bar').classList.add('hidden');
  });
}

// ===================== LOAD MORE =====================
function initLoadMore() {
  document.getElementById('load-more-btn').addEventListener('click', async () => {
    const btn = document.getElementById('load-more-btn');
    btn.disabled = true;
    btn.textContent = '生成中...';

    const topic = currentReadingTopic || document.getElementById('topic-input').value.trim();
    const wordsPerSegment = parseInt(document.getElementById('words-input').value);
    const count = 5;

    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic || null, wordsPerSegment, count }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '生成失败');
      renderSegments(data.segments);
      showToast('已追加!');
      loadVocab();
      loadHistoryPanel();

      // Auto-scroll to show new content
      document.getElementById('load-more-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      showToast('追加失败: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '继续生成更多...';
    }
  });
}

// ===================== DICTIONARY PANEL (Left Panel) =====================

let _dictPanelReady = false;

function initDictPanel() {
  const container = document.getElementById('segments-container');

  if (!_dictPanelReady) {
    // One-time setup: handle word clicks, mode checked dynamically
    const wordHandler = async (e) => {
      const clickMode = settingsData.wordClickMode || 'double';
      if (e.type === 'dblclick' && clickMode !== 'double') return;
      if (e.type === 'click' && clickMode !== 'single') return;

      const wordEl = e.target.closest('.word');
      if (!wordEl) return;

      const word = wordEl.dataset.word;
      if (!word) return;

      // Capture context: which sentence/segment this word appears in
      const card = wordEl.closest('.segment-card');
      const segmentId = card ? parseInt(card.dataset.segmentId) : 0;
      // Get the specific sentence text from the enclosing sentence-line or full paragraph
      const sLine = wordEl.closest('.sentence-line');
      let sentence = '';
      if (sLine) {
        sentence = sLine.querySelector('.sentence-en-text').textContent;
      } else {
        sentence = card ? (card.querySelector('.segment-en') || card.querySelector('.segment-en-full')).textContent : '';
      }

      currentWordContext = {
        date: currentReadingDate,
        segmentId: segmentId,
        sentence: sentence,
      };

      await showWordInPanel(word);
      toggleLeftPanel(true);
    };

    container.addEventListener('click', wordHandler);
    container.addEventListener('dblclick', wordHandler);

    // Panel action buttons (one-time bind)
    document.getElementById('left-panel').addEventListener('click', async (e) => {
      if (e.target.id === 'panel-add-vocab-btn') {
        await addWordToVocabFromPanel();
      }
      if (e.target.id === 'llm-explain-btn') {
        await loadLlmExplain(currentDictWord);
      }
      if (e.target.id === 'llm-translate-btn') {
        await loadLlmTranslate(currentDictWord);
      }
    });

    _dictPanelReady = true;
  }
}

async function showWordInPanel(word) {
  currentDictWord = word;
  const content = document.getElementById('word-panel-content');
  content.innerHTML = `
    <div class="word-panel-word">${escapeHtml(word)}</div>
    <div class="word-panel-phonetic"></div>
    <div id="def-local-section" class="def-section hidden">
      <div class="def-section-label">词典释义</div>
      <div id="def-local-content"></div>
    </div>
    <div id="def-translate-section" class="def-section hidden">
      <div class="def-section-label">网络翻译</div>
      <div id="def-translate-content">
        <button id="llm-translate-btn" class="llm-translate-btn">获取网络翻译</button>
      </div>
    </div>
    <div class="llm-explain-section">
      <button id="llm-explain-btn" class="llm-explain-btn">AI 详细解释</button>
      <div id="llm-explain-result" class="llm-explain-result hidden"></div>
    </div>
    <button id="panel-add-vocab-btn" class="panel-add-vocab-btn">+ 加入生词本</button>
  `;

  // Check if already in vocab — if so, show saved explanation
  const existing = vocabData.words.find(w => w.word.toLowerCase() === word.toLowerCase());
  const addBtn = document.getElementById('panel-add-vocab-btn');

  if (existing) {
    addBtn.textContent = '已在生词本中 ✓';
    addBtn.style.background = '#666';
    // Pre-fill saved explanation if available
    if (existing.llm_explanation) {
      const explainResult = document.getElementById('llm-explain-result');
      explainResult.classList.remove('hidden');
      explainResult.innerHTML = `<div class="def-section-label" style="margin-top:0;">已保存的 AI 解释</div>${renderLlmExplanation(existing.llm_explanation)}`;
    }
  }

  // Fetch local dictionary (instant)
  try {
    const resp = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}`);
    const data = await resp.json();

    // Phonetic
    const phoneticEl = content.querySelector('.word-panel-phonetic');
    const localPhonetic = data.local?.phonetic || '';
    phoneticEl.textContent = localPhonetic || '';

    // Local dictionary
    const localSection = document.getElementById('def-local-section');
    const localContent = document.getElementById('def-local-content');
    if (data.local) {
      localSection.classList.remove('hidden');
      let html = '';
      if (data.local.pos) {
        html += `<div class="def-local-pos">${escapeHtml(data.local.pos)}</div>`;
      }
      if (data.local.translation_cn) {
        html += `<div class="def-local-translation">${escapeHtml(data.local.translation_cn)}</div>`;
      } else if (data.local.definition_en) {
        html += `<div class="def-local-translation">${escapeHtml(data.local.definition_en)}</div>`;
      }
      const tags = [];
      if (data.local.collins) tags.push(`<span class="tag-badge tag-colls">柯林斯 ${data.local.collins}星</span>`);
      if (data.local.oxford) tags.push('<span class="tag-badge tag-oxford">牛津核心</span>');
      if (data.local.tag) {
        data.local.tag.split('|').forEach(t => {
          if (t.trim()) tags.push(`<span class="tag-badge tag-exam">${escapeHtml(t.trim())}</span>`);
        });
      }
      if (tags.length) html += `<div class="def-local-tags">${tags.join('')}</div>`;
      localContent.innerHTML = html || '<div class="def-no-result">暂无详细释义</div>';
    } else {
      localSection.classList.remove('hidden');
      localContent.innerHTML = '<div class="def-no-result">本地词库未收录</div>';
    }

    // LLM translate section
    const translateSection = document.getElementById('def-translate-section');
    translateSection.classList.remove('hidden');

    // If word is already in vocab with definition_cn, show it
    if (existing && existing.definition_cn) {
      const translateContent = document.getElementById('def-translate-content');
      translateContent.innerHTML = `<div class="def-google-translation">${escapeHtml(existing.definition_cn)}</div>`;
    }
  } catch (err) {
    content.querySelector('.word-panel-phonetic').textContent = '查询失败';
  }
}

function renderLlmExplanation(data) {
  let html = '';
  if (typeof data === 'string') {
    return `<div class="llm-explain-text">${escapeHtml(data)}</div>`;
  }
  if (data.explanation_cn) {
    html += `<strong>释义：</strong>${escapeHtml(data.explanation_cn)}<br><br>`;
  }
  if (data.etymology) {
    html += `<strong>词根词缀：</strong>${escapeHtml(data.etymology)}<br><br>`;
  }
  if (data.examples && data.examples.length > 0) {
    html += '<strong>例句：</strong><br>';
    data.examples.forEach(ex => {
      html += `<div class="llm-example">${escapeHtml(ex.en)}<br>${escapeHtml(ex.zh)}</div>`;
    });
    html += '<br>';
  }
  if (data.synonyms) {
    html += `<strong>近义词辨析：</strong>${escapeHtml(data.synonyms)}<br><br>`;
  }
  if (data.usage) {
    html += `<strong>使用场景：</strong>${escapeHtml(data.usage)}`;
  }
  return html || '<p style="color:#999;">无结果</p>';
}

async function loadLlmTranslate(word) {
  const translateContent = document.getElementById('def-translate-content');
  const btn = document.getElementById('llm-translate-btn');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = '翻译中...';

  try {
    const resp = await fetch('/api/dictionary/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });
    const data = await resp.json();

    if (data.error) {
      translateContent.innerHTML = `<div class="def-no-result">${escapeHtml(data.error)}</div>`;
    } else if (data.translation_cn) {
      translateContent.innerHTML = `<div class="def-google-translation">${escapeHtml(data.translation_cn)}</div>`;
    } else {
      translateContent.innerHTML = '<div class="def-no-result">翻译不可用</div>';
    }
  } catch (err) {
    translateContent.innerHTML = '<div class="def-no-result">翻译请求失败</div>';
  }
}

async function addWordToVocabFromPanel() {
  if (!currentDictWord) return;
  const content = document.getElementById('word-panel-content');
  const phonetic = content.querySelector('.word-panel-phonetic')?.textContent || '';

  // Collect local definition
  let defCn = '';
  const localTranslation = content.querySelector('.def-local-translation');
  if (localTranslation) defCn = localTranslation.textContent;

  // Collect LLM translate result
  const translateContent = document.getElementById('def-translate-content');
  const translateText = translateContent?.querySelector('.def-google-translation')?.textContent || '';
  if (translateText) defCn = translateText;

  // Collect LLM explanation if available
  let llmExplanation = '';
  const explainResult = document.getElementById('llm-explain-result');
  if (explainResult && !explainResult.classList.contains('hidden')) {
    llmExplanation = explainResult.innerText;
  }

  // Build context from current word context
  const ctx = currentWordContext ? {
    date: currentWordContext.date,
    segmentId: currentWordContext.segmentId,
    sentence: currentWordContext.sentence,
  } : null;

  try {
    const body = {
      word: currentDictWord,
      phonetic: phonetic,
      definition_cn: defCn || '',
      definition_en: '',
    };
    if (llmExplanation) body.llm_explanation = llmExplanation;
    if (ctx) body.context = ctx;

    const resp = await fetch('/api/vocabulary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      showToast('已加入生词本!');
      const addBtn = document.getElementById('panel-add-vocab-btn');
      if (addBtn) { addBtn.textContent = '已在生词本中 ✓'; addBtn.style.background = '#666'; }
      loadVocab();
    } else if (resp.status === 409) {
      showToast('已在生词本中');
    }
  } catch (err) {
    showToast('添加失败');
  }
}

async function loadLlmExplain(word) {
  const resultDiv = document.getElementById('llm-explain-result');
  const btn = document.getElementById('llm-explain-btn');

  btn.disabled = true;
  btn.textContent = '生成中...';
  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = '<p style="color:#999;">加载中...</p>';

  try {
    const resp = await fetch('/api/dictionary/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });
    const data = await resp.json();

    if (data.error) {
      resultDiv.innerHTML = `<p style="color:#c0392b;">${escapeHtml(data.error)}</p>`;
    } else {
      resultDiv.innerHTML = '<div class="def-section-label">AI 详细解释</div>' + renderLlmExplanation(data);
    }
  } catch (err) {
    resultDiv.innerHTML = '<p style="color:#c0392b;">请求失败</p>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'AI 详细解释';
  }
}

// ===================== HISTORY PANEL (Right Panel) =====================
async function loadHistoryPanel() {
  const content = document.getElementById('history-panel-content');
  const titleEl = document.getElementById('right-panel-title');
  if (titleEl) titleEl.textContent = '历史阅读';
  try {
    const resp = await fetch('/api/readings');
    const data = await resp.json();
    const dates = data.dates || [];

    if (dates.length === 0) {
      content.innerHTML = '<p class="history-empty">暂无历史记录</p>';
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    content.innerHTML = '';

    dates.forEach(dateStr => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.dataset.date = dateStr;
      if (dateStr === currentReadingDate) item.classList.add('current');

      const dateDiv = document.createElement('div');
      dateDiv.className = 'history-item-date';
      dateDiv.textContent = dateStr;
      if (dateStr === today) {
        const badge = document.createElement('span');
        badge.className = 'history-item-badge';
        badge.textContent = '今天';
        dateDiv.appendChild(badge);
      }

      const topicDiv = document.createElement('div');
      topicDiv.className = 'history-item-topic';
      topicDiv.textContent = '加载中...';

      const segCountDiv = document.createElement('div');
      segCountDiv.className = 'history-item-topic';
      segCountDiv.style.fontSize = '0.7rem';
      segCountDiv.style.color = '#999';
      segCountDiv.textContent = '';

      item.appendChild(dateDiv);
      item.appendChild(topicDiv);
      item.appendChild(segCountDiv);

      item.addEventListener('click', () => {
        currentReadingDate = dateStr;
        loadReading(dateStr);
        content.querySelectorAll('.history-item').forEach(el => el.classList.remove('current'));
        item.classList.add('current');
        // Switch right panel title to history mode
        const titleEl = document.getElementById('right-panel-title');
        if (titleEl) titleEl.textContent = '历史阅读';
        if (currentTab !== 'reading') {
          document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          document.querySelector('.tab[data-tab="reading"]').classList.add('active');
          document.getElementById('tab-reading').classList.add('active');
          currentTab = 'reading';
        }
      });

      content.appendChild(item);

      // Load topic and segment count asynchronously
      fetch(`/api/readings/${dateStr}`).then(r => r.json()).then(d => {
        let displayTopic = d.topic || '(无主题)';
        if (displayTopic === '__HOT_TOPICS__') displayTopic = '近期热点';
        topicDiv.textContent = displayTopic;
        // Show topics breakdown if available
        if (d.topics && d.topics.length > 0) {
          const topics = d.topics;
          const total = topics.reduce((s, t) => s + (t.segmentCount || 0), 0);
          if (topics.length === 1) {
            segCountDiv.textContent = `${total} 段`;
          } else {
            segCountDiv.textContent = topics.map(t => `${t.topic}: ${t.segmentCount}段`).join(' | ');
          }
        } else if (d.segments) {
          segCountDiv.textContent = `${d.segments.length} 段`;
        }
      }).catch(() => {
        topicDiv.textContent = '(加载失败)';
      });
    });
  } catch (err) {
    content.innerHTML = '<p style="color:#c0392b;text-align:center;">加载失败</p>';
  }
}

// ===================== VOCABULARY =====================
async function loadVocab() {
  try {
    const resp = await fetch('/api/vocabulary');
    vocabData = await resp.json();
    renderVocab();
  } catch (err) {
    console.error('Failed to load vocabulary', err);
  }
}

function initVocabulary() {
  document.getElementById('vocab-search').addEventListener('input', renderVocab);

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderVocab();
    });
  });

  // Add export buttons
  const exportDiv = document.createElement('div');
  exportDiv.className = 'vocab-export';
  exportDiv.innerHTML = `
    <button id="vocab-export-csv" class="btn-small" style="background:#666;">导出 CSV</button>
    <button id="vocab-export-anki" class="btn-small" style="background:#666;">导出 Anki 格式</button>
  `;
  document.getElementById('tab-vocabulary').appendChild(exportDiv);

  document.getElementById('vocab-export-csv').addEventListener('click', exportCSV);
  document.getElementById('vocab-export-anki').addEventListener('click', exportAnki);
}

function renderVocab() {
  const container = document.getElementById('vocab-list');
  const searchTerm = (document.getElementById('vocab-search').value || '').toLowerCase();

  let words = [...vocabData.words];

  if (currentFilter === 'unmastered') {
    words = words.filter(w => !w.mastered);
  } else if (currentFilter === 'mastered') {
    words = words.filter(w => w.mastered);
  }

  if (searchTerm) {
    words = words.filter(w =>
      w.word.toLowerCase().includes(searchTerm) ||
      (w.definition_cn || '').includes(searchTerm) ||
      (w.definition_en || '').toLowerCase().includes(searchTerm)
    );
  }

  words.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));

  document.getElementById('vocab-total').textContent = `共 ${vocabData.total} 词`;
  document.getElementById('vocab-unmastered').textContent = `未掌握 ${vocabData.unmastered} 词`;

  container.innerHTML = '';
  if (words.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无生词</p>';
    return;
  }

  words.forEach(w => {
    const row = document.createElement('div');
    row.className = 'vocab-row' + (w.mastered ? ' mastered' : '');
    // Show brief explanation indicator
    const hasExplain = w.llm_explanation ? ' 有AI解释' : '';
    row.innerHTML = `
      <span class="v-word">${escapeHtml(w.word)}</span>
      <span class="v-phonetic">${escapeHtml(w.phonetic || '')}</span>
      <span class="v-def">${escapeHtml(w.definition_cn || w.definition_en || '')}${hasExplain}</span>
      <span class="v-date">${escapeHtml(w.addedAt || '')}</span>
      <span class="v-actions">
        <button class="v-action-btn check" data-action="toggle" data-word="${escapeHtml(w.word)}">
          ${w.mastered ? '恢复' : '掌握'}
        </button>
        <button class="v-action-btn del" data-action="delete" data-word="${escapeHtml(w.word)}">删</button>
      </span>
    `;

    // Click on vocab word → left: definition, right: source segments
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.v-action-btn')) return;
      currentWordContext = null;
      await showWordInPanelFromVocab(w);
      toggleLeftPanel(true);
      // Load source segments into right panel
      await loadVocabSourcesIntoRightPanel(w);
      // Switch right panel title
      const titleEl = document.getElementById('right-panel-title');
      if (titleEl) titleEl.textContent = '出处片段';
      toggleRightPanel(true);
    });

    container.appendChild(row);

    if (expandedWord === w.word.toLowerCase()) {
      const ctxDiv = document.createElement('div');
      ctxDiv.className = 'vocab-contexts';
      ctxDiv.id = `ctx-${w.word.toLowerCase()}`;
      renderContexts(ctxDiv, w);
      container.appendChild(ctxDiv);
    }
  });

  container.querySelectorAll('.v-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const word = btn.dataset.word;
      if (action === 'toggle') {
        const w = vocabData.words.find(v => v.word === word);
        await fetch(`/api/vocabulary/${encodeURIComponent(word)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mastered: !(w?.mastered) }),
        });
        loadVocab();
      } else if (action === 'delete') {
        await fetch(`/api/vocabulary/${encodeURIComponent(word)}`, { method: 'DELETE' });
        loadVocab();
      }
    });
  });
}

async function showWordInPanelFromVocab(vocabEntry) {
  currentDictWord = vocabEntry.word;
  const word = vocabEntry.word;
  const content = document.getElementById('word-panel-content');

  const hasExplain = vocabEntry.llm_explanation ? true : false;
  const explainHtml = hasExplain
    ? `<div class="def-section-label" style="margin-top:0;">已保存的 AI 解释</div>${renderLlmExplanation(vocabEntry.llm_explanation)}`
    : '';

  content.innerHTML = `
    <div class="word-panel-word">${escapeHtml(word)}</div>
    <div class="word-panel-phonetic">${escapeHtml(vocabEntry.phonetic || '')}</div>
    <div id="def-local-section" class="def-section hidden">
      <div class="def-section-label">词典释义</div>
      <div id="def-local-content"></div>
    </div>
    <div id="def-translate-section" class="def-section hidden">
      <div class="def-section-label">释义</div>
      <div id="def-translate-content">
        ${vocabEntry.definition_cn ? `<div class="def-google-translation">${escapeHtml(vocabEntry.definition_cn)}</div>` : '<button id="llm-translate-btn" class="llm-translate-btn">获取网络翻译</button>'}
      </div>
    </div>
    <div class="llm-explain-section">
      ${hasExplain ? `<div id="llm-explain-result" class="llm-explain-result">${explainHtml}</div>` : '<button id="llm-explain-btn" class="llm-explain-btn">AI 详细解释</button><div id="llm-explain-result" class="llm-explain-result hidden"></div>'}
    </div>
    <button id="panel-add-vocab-btn" class="panel-add-vocab-btn" disabled style="background:#666;">已在生词本中 ✓</button>
  `;

  // Fetch local dictionary
  try {
    const resp = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}`);
    const data = await resp.json();

    const localSection = document.getElementById('def-local-section');
    const localContent = document.getElementById('def-local-content');
    if (data.local) {
      localSection.classList.remove('hidden');
      let html = '';
      if (data.local.pos) html += `<div class="def-local-pos">${escapeHtml(data.local.pos)}</div>`;
      if (data.local.translation_cn) html += `<div class="def-local-translation">${escapeHtml(data.local.translation_cn)}</div>`;
      else if (data.local.definition_en) html += `<div class="def-local-translation">${escapeHtml(data.local.definition_en)}</div>`;
      const tags = [];
      if (data.local.collins) tags.push(`<span class="tag-badge tag-colls">柯林斯 ${data.local.collins}星</span>`);
      if (data.local.oxford) tags.push('<span class="tag-badge tag-oxford">牛津核心</span>');
      if (data.local.tag) {
        data.local.tag.split('|').forEach(t => {
          if (t.trim()) tags.push(`<span class="tag-badge tag-exam">${escapeHtml(t.trim())}</span>`);
        });
      }
      if (tags.length) html += `<div class="def-local-tags">${tags.join('')}</div>`;
      localContent.innerHTML = html || '<div class="def-no-result">暂无详细释义</div>';
    } else {
      localSection.classList.remove('hidden');
      localContent.innerHTML = '<div class="def-no-result">本地词库未收录</div>';
    }

    const translateSection = document.getElementById('def-translate-section');
    translateSection.classList.remove('hidden');
  } catch (err) {
    // local lookup failed, keep going
  }
}

async function loadVocabSourcesIntoRightPanel(vocabEntry) {
  const content = document.getElementById('history-panel-content');
  const titleEl = document.getElementById('right-panel-title');
  if (titleEl) titleEl.textContent = '出处片段';

  const contexts = vocabEntry.contexts || [];
  if (contexts.length === 0) {
    content.innerHTML = '<p class="history-empty">该单词暂无出处记录<br><small>在阅读中点击单词并加入生词本即可记录出处</small></p>';
    return;
  }

  content.innerHTML = '';
  // Show most recent first
  const sorted = [...contexts].reverse();

  sorted.forEach(ctx => {
    const item = document.createElement('div');
    item.className = 'vocab-source-item';

    const dateDiv = document.createElement('div');
    dateDiv.className = 'vocab-source-date';
    dateDiv.textContent = `${ctx.date} · 第${ctx.segmentId + 1}段`;

    const enDiv = document.createElement('div');
    enDiv.className = 'vocab-source-en';
    enDiv.textContent = ctx.sentence.replace(/\*\*/g, '');

    item.appendChild(dateDiv);
    item.appendChild(enDiv);

    // Click to navigate to that reading
    item.addEventListener('click', () => {
      currentReadingDate = ctx.date;
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab[data-tab="reading"]').classList.add('active');
      document.getElementById('tab-reading').classList.add('active');
      currentTab = 'reading';
      loadReading(ctx.date);
      // Switch right panel back to history
      if (titleEl) titleEl.textContent = '历史阅读';
      loadHistoryPanel();
    });

    content.appendChild(item);
  });
}

async function toggleWordContext(word, rowEl) {
  const wordLower = word.toLowerCase();

  if (expandedWord === wordLower) {
    expandedWord = null;
    const ctxEl = document.getElementById(`ctx-${wordLower}`);
    if (ctxEl) ctxEl.remove();
    return;
  }

  if (expandedWord) {
    const prevCtx = document.getElementById(`ctx-${expandedWord}`);
    if (prevCtx) prevCtx.remove();
  }

  expandedWord = wordLower;
  const ctxDiv = document.createElement('div');
  ctxDiv.className = 'vocab-contexts';
  ctxDiv.id = `ctx-${wordLower}`;
  rowEl.insertAdjacentElement('afterend', ctxDiv);

  try {
    const resp = await fetch(`/api/vocabulary/${encodeURIComponent(word)}/contexts`);
    const data = await resp.json();
    renderContexts(ctxDiv, { word, contexts: data.contexts || [] });
  } catch (err) {
    ctxDiv.innerHTML = '<p style="color:#999;">加载失败</p>';
  }
}

function renderContexts(container, vocabEntry) {
  const contexts = vocabEntry.contexts || [];
  if (contexts.length === 0) {
    container.innerHTML = '<p style="font-size:0.85rem;color:#999;">暂无语境记录</p>';
    return;
  }

  const header = document.createElement('h4');
  header.textContent = `出现 ${contexts.length} 次:`;
  container.appendChild(header);

  contexts.forEach(ctx => {
    const item = document.createElement('div');
    item.className = 'context-item';
    item.innerHTML = `<span class="context-date">${escapeHtml(ctx.date)} 第${ctx.segmentId + 1}段</span> ${escapeHtml(ctx.sentence.replace(/\*\*/g, ''))}`;

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab[data-tab="reading"]').classList.add('active');
      document.getElementById('tab-reading').classList.add('active');
      currentTab = 'reading';
      currentReadingDate = ctx.date;
      loadReading(ctx.date);
      loadHistoryPanel();
    });

    container.appendChild(item);
  });
}

function exportCSV() {
  const lines = ['单词,音标,中文释义,英文释义,添加日期,已掌握'];
  vocabData.words.forEach(w => {
    lines.push([
      w.word, w.phonetic || '', w.definition_cn || '',
      w.definition_en || '', w.addedAt || '', w.mastered ? '是' : '否',
    ].map(v => `"${v}"`).join(','));
  });
  downloadFile('vocabulary.csv', '﻿' + lines.join('\n'), 'text/csv');
}

function exportAnki() {
  const lines = [];
  vocabData.words.forEach(w => {
    const front = w.word + (w.phonetic ? ` ${w.phonetic}` : '');
    const back = (w.definition_cn || '') + (w.definition_en ? `<br>${w.definition_en}` : '');
    lines.push(`${front}\t${back}`);
  });
  downloadFile('vocabulary_anki.txt', '﻿' + lines.join('\n'), 'text/plain');
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===================== SETTINGS =====================
async function loadSettings() {
  try {
    const resp = await fetch('/api/settings');
    settingsData = await resp.json();
    populateSettingsForm();
  } catch (err) {
    console.error('Failed to load settings', err);
  }
}

function populateSettingsForm() {
  const keyInput = document.getElementById('setting-api-key');
  if (settingsData.api_key_source === 'env') {
    keyInput.value = '';
    keyInput.placeholder = settingsData.api_key_masked || 'sk-... (来自 .env)';
    keyInput.disabled = true;
    keyInput.title = 'API Key 由 .env 文件中的 DEEPSEEK_API_KEY 管理';
  } else if (settingsData.api_key) {
    keyInput.value = settingsData.api_key;
    keyInput.placeholder = settingsData.api_key_masked || 'sk-...';
    keyInput.disabled = false;
    keyInput.title = '';
  } else {
    keyInput.value = '';
    keyInput.placeholder = 'sk-...';
    keyInput.disabled = false;
    keyInput.title = '';
  }

  document.getElementById('setting-api-url').value = settingsData.api_base_url || '';

  document.getElementById('setting-words-slider').value = settingsData.wordsPerSegment || 50;
  document.getElementById('setting-words-input').value = settingsData.wordsPerSegment || 50;
  document.getElementById('setting-words-val').textContent = settingsData.wordsPerSegment || 50;

  document.getElementById('setting-count-slider').value = settingsData.segmentCount || 10;
  document.getElementById('setting-count-input').value = settingsData.segmentCount || 10;
  document.getElementById('setting-count-val').textContent = settingsData.segmentCount || 10;

  const diffRadio = document.querySelector(`input[name="difficulty"][value="${settingsData.difficulty || 'cet6'}"]`);
  if (diffRadio) diffRadio.checked = true;

  document.getElementById('setting-default-topic').value =
    (settingsData.defaultTopic === '__HOT_TOPICS__') ? '' : (settingsData.defaultTopic || '');

  document.getElementById('setting-vocab-integration').checked =
    settingsData.vocabIntegration !== false;

  document.getElementById('setting-vocab-count-slider').value = settingsData.vocabIntegrationCount || 8;
  document.getElementById('setting-vocab-count-input').value = settingsData.vocabIntegrationCount || 8;
  document.getElementById('setting-vocab-count-val').textContent = settingsData.vocabIntegrationCount || 8;

  // Click mode
  const clickMode = settingsData.wordClickMode || 'double';
  const clickRadio = document.querySelector(`input[name="clickMode"][value="${clickMode}"]`);
  if (clickRadio) clickRadio.checked = true;

  renderSavedTopics();
  updateApiKeyStatus();
}

function updateApiKeyStatus() {
  const statusEl = document.getElementById('api-key-status');
  const keyInput = document.getElementById('setting-api-key');
  if (settingsData.api_key_source === 'env') {
    statusEl.textContent = 'API Key 由 .env 文件管理 (只读)';
    statusEl.style.color = '#4a7c59';
  } else if (settingsData.api_key) {
    statusEl.textContent = 'API Key 已配置 (保存在本地)';
    statusEl.style.color = '#4a7c59';
    if (!keyInput.value) {
      keyInput.placeholder = settingsData.api_key_masked || 'sk-... (已保存)';
    }
  } else if (keyInput.value.trim()) {
    statusEl.textContent = '点击保存后生效';
    statusEl.style.color = '#e67e22';
  } else {
    statusEl.textContent = '请输入 API Key 后保存';
    statusEl.style.color = '#e67e22';
  }
}

function renderSavedTopics() {
  const container = document.getElementById('saved-topics-chips');
  container.innerHTML = '';
  (settingsData.savedTopics || []).forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'topic-chip';
    chip.innerHTML = `${escapeHtml(t)} <span class="remove-chip" data-topic="${escapeHtml(t)}">x</span>`;
    chip.querySelector('.remove-chip').addEventListener('click', () => {
      settingsData.savedTopics = (settingsData.savedTopics || []).filter(s => s !== t);
      renderSavedTopics();
    });
    container.appendChild(chip);
  });
}

async function addToSavedTopics(topic) {
  if (!topic || topic === '__HOT_TOPICS__') return;
  if (!settingsData.savedTopics) settingsData.savedTopics = [];
  if (!settingsData.savedTopics.includes(topic)) {
    settingsData.savedTopics.unshift(topic);
    if (settingsData.savedTopics.length > 20) settingsData.savedTopics.pop();
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedTopics: settingsData.savedTopics }),
    });
  }
}

function initSettings() {
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('setting-api-key').addEventListener('input', updateApiKeyStatus);
}

async function saveSettings() {
  const status = document.getElementById('settings-status');

  const defaultTopic = document.getElementById('setting-default-topic').value.trim();
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'cet6';
  const apiKeyInput = document.getElementById('setting-api-key').value.trim();
  const clickMode = document.querySelector('input[name="clickMode"]:checked')?.value || 'double';

  const newSettings = {
    api_base_url: document.getElementById('setting-api-url').value.trim(),
    wordsPerSegment: parseInt(document.getElementById('setting-words-input').value),
    segmentCount: parseInt(document.getElementById('setting-count-input').value),
    difficulty: difficulty,
    defaultTopic: defaultTopic || '__HOT_TOPICS__',
    vocabIntegration: document.getElementById('setting-vocab-integration').checked,
    vocabIntegrationCount: parseInt(document.getElementById('setting-vocab-count-input').value),
    savedTopics: settingsData.savedTopics || [],
    wordClickMode: clickMode,
  };

  if (settingsData.api_key_source !== 'env' && apiKeyInput && apiKeyInput !== settingsData.api_key) {
    newSettings.api_key = apiKeyInput;
  }

  try {
    const resp = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSettings),
    });
    if (!resp.ok) throw new Error('保存失败');
    settingsData = await resp.json();

    // Sync sliders on reading tab
    document.getElementById('words-slider').value = settingsData.wordsPerSegment;
    document.getElementById('words-input').value = settingsData.wordsPerSegment;
    document.getElementById('words-val').textContent = settingsData.wordsPerSegment;
    document.getElementById('count-slider').value = settingsData.segmentCount;
    document.getElementById('count-input').value = settingsData.segmentCount;
    document.getElementById('count-val').textContent = settingsData.segmentCount;

    initDictPanel();
    status.textContent = '设置已保存!';
    status.className = 'status success';
    showToast('设置已保存!');
  } catch (err) {
    status.textContent = '保存失败: ' + err.message;
    status.className = 'status error';
  }
}
