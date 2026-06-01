/* === English Daily Reader - Frontend Logic === */

// ===================== LOCAL STORAGE HELPERS =====================
function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    showToast('存储空间不足，请清理浏览器数据');
  }
}

// ===================== STATE =====================
let currentTab = 'reading';
let currentFilter = 'all';
let vocabData = { words: [], total: 0, unmastered: 0, mastered: 0 };
let settingsData = {};
let expandedWord = null;
let currentReadingDate = '';
let currentReadingTopic = '';
let currentWordContext = null;

let currentDictWord = '';
let activeSentenceEl = null;

// Panel state
let leftPanelOpen = false;
let rightPanelOpen = true;

// ===================== DEFAULT SETTINGS =====================
const DEFAULT_SETTINGS = {
  api_key: '',
  api_base_url: '',
  segmentCount: 10,
  wordsPerSegment: 50,
  difficulty: 'cet6',
  defaultTopic: '__HOT_TOPICS__',
  savedTopics: [],
  vocabIntegration: true,
  vocabIntegrationCount: 8,
  wordClickMode: 'double',
};
const DEFAULT_VOCABULARY = { words: [] };

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  currentReadingDate = today;

  // Load data from localStorage first
  settingsData = readLS('er_settings', { ...DEFAULT_SETTINGS });
  vocabData = readLS('er_vocabulary', { words: [] });
  // Calculate stats
  vocabData.total = vocabData.words.length;
  vocabData.unmastered = vocabData.words.filter(w => !w.mastered).length;
  vocabData.mastered = vocabData.total - vocabData.unmastered;

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

  populateSettingsForm();
  syncReadingTabSliders();
  loadVocabUI();
  loadHistoryPanel();
  loadReading(today);

  // Exit button
  document.getElementById('exit-btn').addEventListener('click', async () => {
    try { await fetch('/api/shutdown', { method: 'POST' }); } catch (e) {}
    window.close();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+Enter / Cmd+Enter: Generate
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (currentTab === 'reading') generate();
    }
    // Escape: Close panels
    if (e.key === 'Escape') {
      if (leftPanelOpen) toggleLeftPanel(false);
      if (rightPanelOpen) toggleRightPanel(false);
    }
  });

  // Dark mode toggle
  const themeBtn = document.getElementById('theme-toggle-btn');
  const savedTheme = readLS('er_theme', 'light');
  applyTheme(savedTheme);

  themeBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    writeLS('er_theme', next);
  });

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      themeBtn.innerHTML = '&#x2600;&#xFE0F;';
      themeBtn.title = '切换日间模式';
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeBtn.innerHTML = '&#x1F319;';
      themeBtn.title = '切换夜间模式';
    }
  }
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
      const titleEl = document.getElementById('right-panel-title');
      if (tabId === 'reading') {
        if (titleEl) titleEl.textContent = '历史阅读';
        loadHistoryPanel();
      } else if (tabId === 'vocabulary') {
        if (titleEl) titleEl.textContent = '出处片段';
        loadVocabUI();
        const histContent = document.getElementById('history-panel-content');
        if (histContent) histContent.innerHTML = '<p class="history-empty">点击左侧单词<br>查看出处片段</p>';
      }
      if (tabId === 'settings') {
        // Refresh settings display
      }
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

  document.getElementById('close-left-panel').addEventListener('click', () => {
    toggleLeftPanel(false);
  });
  document.getElementById('close-right-panel').addEventListener('click', () => {
    toggleRightPanel(false);
  });

  leftBtn.addEventListener('click', () => toggleLeftPanel(!leftPanelOpen));
  rightBtn.addEventListener('click', () => toggleRightPanel(!rightPanelOpen));

  overlay.addEventListener('click', () => {
    if (leftPanelOpen) toggleLeftPanel(false);
    if (rightPanelOpen) toggleRightPanel(false);
  });

  toggleLeftPanel(false);
  toggleRightPanel(true);

  initPanelDrag('left-panel');
  initPanelDrag('right-panel');

  if (window.innerWidth > 768) {
    initDesktopPanelDrag('left-panel');
    initDesktopPanelDrag('right-panel');
    initDesktopPanelResize('left-panel');
    initDesktopPanelResize('right-panel');
    _desktopPanelsInited = true;
  }
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
    lockBodyScroll(true);
  } else {
    leftPanel.classList.add('collapsed');
    leftPanel.classList.remove('expanded');
    btn.classList.remove('active');
    lockBodyScroll(false);
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
    lockBodyScroll(true);
  } else {
    rightPanel.classList.add('collapsed');
    rightPanel.classList.remove('expanded');
    btn.classList.remove('active');
    lockBodyScroll(false);
  }

  updateOverlay();
  updateLayoutClass();
}

// ---- Body scroll lock (mobile panels) ----
let _scrollTop = 0;

function lockBodyScroll(lock) {
  if (window.innerWidth > 768) return;
  if (lock) {
    _scrollTop = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${_scrollTop}px`;
  } else {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.top = '';
    window.scrollTo(0, _scrollTop);
  }
}

// ---- Panel drag gesture (mobile) ----
function initPanelDrag(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const handle = panel.querySelector('.panel-drag-handle');
  if (!handle) return;

  let startY = 0;
  let startHeight = 0;
  let dragging = false;

  handle.addEventListener('touchstart', (e) => {
    if (window.innerWidth > 768) return;
    startY = e.touches[0].clientY;
    startHeight = panel.getBoundingClientRect().height;
    panel.style.transition = 'none';
    dragging = true;
  }, { passive: true });

  panel.addEventListener('touchmove', (e) => {
    if (!dragging || window.innerWidth > 768) return;
    const dy = startY - e.touches[0].clientY;
    const newHeight = Math.min(window.innerHeight * 0.95, Math.max(100, startHeight + dy));
    panel.style.height = newHeight + 'px';
  }, { passive: true });

  panel.addEventListener('touchend', (e) => {
    if (!dragging || window.innerWidth > 768) return;
    dragging = false;
    panel.style.transition = '';
    const endY = e.changedTouches[0].clientY;
    const totalDy = startY - endY;

    if (totalDy < -80 || panel.getBoundingClientRect().height < window.innerHeight * 0.3) {
      if (panelId === 'left-panel') toggleLeftPanel(false);
      else toggleRightPanel(false);
      return;
    }

    if (totalDy > 80) {
      panel.classList.add('expanded');
    } else {
      panel.classList.remove('expanded');
    }
    panel.style.height = '';
  });
}

// ---- Desktop panel drag (mouse) ----
function initDesktopPanelDrag(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const header = panel.querySelector('.panel-header');
  if (!header) return;

  let startX = 0, startY = 0, startLeft = 0, startTop = 0;
  let dragging = false;

  function getClientXY(e) {
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function beginDrag(e) {
    if (window.innerWidth <= 768) return;
    if (e.target.closest('.panel-close')) return;
    dragging = true;
    const pt = getClientXY(e);
    startX = pt.x;
    startY = pt.y;
    startLeft = panel.offsetLeft;
    startTop = panel.offsetTop;
    panel.style.transition = 'none';
    panel.style.cursor = 'grabbing';
    if (e.cancelable) e.preventDefault();
  }

  header.addEventListener('mousedown', beginDrag);
  header.addEventListener('touchstart', beginDrag, { passive: false });

  function doDrag(e) {
    if (!dragging) return;
    const pt = getClientXY(e);
    const dx = pt.x - startX;
    const dy = pt.y - startY;
    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    const maxX = window.innerWidth - panel.offsetWidth - 8;
    const maxY = window.innerHeight - 60;
    newLeft = Math.max(0, Math.min(newLeft, maxX));
    newTop = Math.max(0, Math.min(newTop, maxY));

    panel.style.left = newLeft + 'px';
    panel.style.top = newTop + 'px';
  }

  document.addEventListener('mousemove', doDrag);
  document.addEventListener('touchmove', doDrag, { passive: false });

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    panel.style.cursor = '';
  }

  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
}

// ---- Desktop panel resize (mouse + touch) ----
function initDesktopPanelResize(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  ['e', 's', 'se'].forEach(dir => {
    if (!panel.querySelector(`.panel-resize-handle.${dir}`)) {
      const handle = document.createElement('div');
      handle.className = `panel-resize-handle ${dir}`;
      panel.appendChild(handle);
    }
  });

  let resizing = false;
  let currentDir = '';
  let startX = 0, startY = 0, startW = 0, startH = 0;

  function getClientXY(e) {
    if (e.touches) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e.changedTouches) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function beginResize(e) {
    if (window.innerWidth <= 768) return;
    const handle = e.target.closest('.panel-resize-handle');
    if (!handle) return;
    resizing = true;
    currentDir = [...handle.classList].find(c => ['e', 's', 'se'].includes(c)) || '';
    const pt = getClientXY(e);
    startX = pt.x;
    startY = pt.y;
    startW = panel.offsetWidth;
    startH = panel.offsetHeight;
    panel.style.transition = 'none';
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  }

  panel.addEventListener('mousedown', beginResize);
  panel.addEventListener('touchstart', beginResize, { passive: false });

  function doResize(e) {
    if (!resizing) return;
    const pt = getClientXY(e);
    const dx = pt.x - startX;
    const dy = pt.y - startY;

    if (currentDir.includes('e')) {
      panel.style.width = Math.max(260, startW + dx) + 'px';
    }
    if (currentDir.includes('s')) {
      panel.style.height = Math.max(180, startH + dy) + 'px';
    }
  }

  document.addEventListener('mousemove', doResize);
  document.addEventListener('touchmove', doResize, { passive: false });

  function endResize() {
    resizing = false;
    currentDir = '';
  }

  document.addEventListener('mouseup', endResize);
  document.addEventListener('touchend', endResize);
}

function clampPanelsToViewport() {
  if (window.innerWidth <= 768) return;
  ['left-panel', 'right-panel'].forEach(id => {
    const panel = document.getElementById(id);
    if (!panel || panel.classList.contains('collapsed')) return;
    const rect = panel.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 8;
    const maxY = window.innerHeight - 60;
    if (rect.left > maxX) panel.style.left = maxX + 'px';
    if (rect.left < 0) panel.style.left = '0px';
    if (rect.top > maxY) panel.style.top = maxY + 'px';
    if (rect.top < 0) panel.style.top = '0px';
  });
}

function updateOverlay() {
  const overlay = document.getElementById('overlay');
  const isMobile = window.innerWidth <= 768;
  if (isMobile && (leftPanelOpen || rightPanelOpen)) {
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function updateLayoutClass() {
  const layout = document.getElementById('main-layout');
  layout.classList.remove('left-collapsed', 'both-collapsed', 'right-collapsed', 'left-visible', 'right-visible');
  if (window.innerWidth <= 768) return;
}

let _desktopPanelsInited = false;

window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    document.getElementById('overlay').classList.add('hidden');
    lockBodyScroll(false);
    if (!_desktopPanelsInited) {
      initDesktopPanelDrag('left-panel');
      initDesktopPanelDrag('right-panel');
      initDesktopPanelResize('left-panel');
      initDesktopPanelResize('right-panel');
      _desktopPanelsInited = true;
    }
  }
  updateLayoutClass();
  clampPanelsToViewport();
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

function _buildGenerateBody() {
  const topic = document.getElementById('topic-input').value.trim();
  const wordsPerSegment = parseInt(document.getElementById('words-input').value);
  const count = parseInt(document.getElementById('count-input').value);

  const unmastered = vocabData.words
    .filter(w => !w.mastered)
    .sort((a, b) => (a.reviewCount || 0) - (b.reviewCount || 0))
    .map(w => w.word);

  return {
    topic: topic || null,
    wordsPerSegment,
    count,
    difficulty: settingsData.difficulty || 'cet6',
    defaultTopic: settingsData.defaultTopic || '__HOT_TOPICS__',
    api_key: settingsData.api_key || '',
    api_base_url: settingsData.api_base_url || '',
    vocabIntegration: settingsData.vocabIntegration !== false,
    vocabIntegrationCount: settingsData.vocabIntegrationCount || 8,
    vocabWords: unmastered,
  };
}

async function generate() {
  const btn = document.getElementById('generate-btn');
  const status = document.getElementById('generate-status');

  btn.disabled = true;
  btn.textContent = '生成中...';
  status.textContent = '';
  status.className = 'status';

  try {
    const resp = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_buildGenerateBody()),
    });

    const data = await resp.json();

    if (!resp.ok) {
      throw new Error(data.error || '生成失败');
    }

    const reading = data.reading;
    currentReadingDate = reading.date;
    currentReadingTopic = reading.topic || '近期热点';

    if (reading.topic && reading.topic !== '__HOT_TOPICS__') {
      addToSavedTopics(reading.topic);
    }

    // Save to localStorage
    const allReadings = readLS('er_readings', {});
    if (allReadings[reading.date] && allReadings[reading.date].segments) {
      // Merge with existing
      const existing = allReadings[reading.date];
      const startId = existing.segments.length;
      reading.segments.forEach((seg, i) => { seg.id = startId + i; });
      existing.segments = existing.segments.concat(reading.segments);
      existing.generatedAt = reading.generatedAt;
      existing.topic = reading.topic;
      existing.topics = existing.topics || [];
      existing.topics.push({ topic: reading.topic, segmentCount: reading.segments.length });
    } else {
      reading.topics = [{ topic: reading.topic, segmentCount: reading.segments.length }];
      allReadings[reading.date] = reading;
    }
    writeLS('er_readings', allReadings);

    const merged = allReadings[reading.date];
    renderSegments(merged.segments);
    document.getElementById('load-more-wrap').classList.remove('hidden');

    // Estimate reading time (180 wpm for ESL learners)
    const totalWords = merged.segments.reduce((sum, seg) => {
      return sum + (seg.english ? seg.english.split(/\s+/).length : 0);
    }, 0);
    const estMinutes = Math.max(1, Math.ceil(totalWords / 180));

    status.textContent = `已生成 ${reading.segments.length} 段 · 预计阅读 ${estMinutes} 分钟 | `;
    status.className = 'status success';

    if (data.missingVocab && data.missingVocab.length > 0) {
      status.textContent += ` 未融入生词: ${data.missingVocab.join(', ')}`;
    }

    document.getElementById('segments-container').scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast('生成完成!');
    loadVocabUI();
    loadHistoryPanel();
  } catch (err) {
    status.textContent = `错误: ${err.message}`;
    status.className = 'status error';
  } finally {
    btn.disabled = false;
    btn.textContent = '生成英语片段';
  }
}

// ===================== TTS (Text-to-Speech) =====================
function speakSentence(text) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

// ===================== RENDER SEGMENTS =====================
function renderSegments(segments) {
  clearActiveSentence();
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

        const speakBtn = document.createElement('button');
        speakBtn.className = 'speak-btn';
        speakBtn.innerHTML = '&#x1F50A;';
        speakBtn.title = '朗读句子';
        speakBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          speakSentence(pair.en.replace(/\*\*/g, ''));
        });

        sLine.appendChild(enText);
        sLine.appendChild(speakBtn);
        sLine.appendChild(zhText);
        enDiv.appendChild(sLine);
      });

      card.appendChild(index);
      card.appendChild(enDiv);
    } else {
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
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

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

  const allReadings = readLS('er_readings', {});
  const data = allReadings[dateStr];

  if (!data || !data.segments) {
    container.innerHTML = '<p style="text-align:center;color:#999;">该日期暂无阅读内容</p>';
    loadMore.classList.add('hidden');
    backBar.classList.add('hidden');
    return;
  }

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
}

function initBackToToday() {
  document.getElementById('back-to-today-btn').addEventListener('click', () => {
    const today = new Date().toISOString().split('T')[0];
    currentReadingDate = today;
    loadReading(today);
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
    const count = parseInt(document.getElementById('count-input').value) || (settingsData.segmentCount || 5);

    // Get existing reading to append to
    const allReadings = readLS('er_readings', {});
    const existingReading = allReadings[currentReadingDate] || {};

    const body = {
      topic: topic || null,
      wordsPerSegment,
      count,
      difficulty: settingsData.difficulty || 'cet6',
      defaultTopic: settingsData.defaultTopic || '__HOT_TOPICS__',
      api_key: settingsData.api_key || '',
      api_base_url: settingsData.api_base_url || '',
      vocabIntegration: settingsData.vocabIntegration !== false,
      vocabIntegrationCount: settingsData.vocabIntegrationCount || 8,
      vocabWords: vocabData.words.filter(w => !w.mastered).map(w => w.word),
      existingReading: existingReading,
    };

    try {
      const resp = await fetch('/api/generate-more', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || '生成失败');

      // Save merged reading to localStorage
      const updatedReading = data.reading;
      allReadings[currentReadingDate] = updatedReading;
      writeLS('er_readings', allReadings);

      renderSegments(updatedReading.segments);
      showToast(`已追加 ${data.appendedCount} 段!`);
      loadVocabUI();
      loadHistoryPanel();

      document.getElementById('load-more-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
      showToast('追加失败: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '继续生成更多...';
    }
  });
}

// ===================== ACTIVE SENTENCE PINNING =====================
function setActiveSentence(sLine) {
  if (activeSentenceEl === sLine) return;
  if (activeSentenceEl) activeSentenceEl.classList.remove('sentence-active');
  activeSentenceEl = sLine;
  sLine.classList.add('sentence-active');
}

function clearActiveSentence() {
  if (activeSentenceEl) {
    activeSentenceEl.classList.remove('sentence-active');
    activeSentenceEl = null;
  }
}

// ===================== DICTIONARY PANEL (Left Panel) =====================
let _dictPanelReady = false;

function initDictPanel() {
  const container = document.getElementById('segments-container');

  if (!_dictPanelReady) {
    const wordHandler = async (e) => {
      const clickMode = settingsData.wordClickMode || 'double';
      if (e.type === 'dblclick' && clickMode !== 'double') return;
      if (e.type === 'click' && clickMode !== 'single') return;

      const wordEl = e.target.closest('.word');
      if (!wordEl) return;

      const word = wordEl.dataset.word;
      if (!word) return;

      const card = wordEl.closest('.segment-card');
      const segmentId = card ? parseInt(card.dataset.segmentId) : 0;
      const sLine = wordEl.closest('.sentence-line');
      let sentence = '';
      if (sLine) {
        sentence = sLine.querySelector('.sentence-en-text').textContent;
      } else {
        sentence = card ? (card.querySelector('.segment-en') || card.querySelector('.segment-en-full')).textContent : '';
      }

      // Pin the active sentence so translation stays visible
      if (sLine) setActiveSentence(sLine);

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

  const existing = vocabData.words.find(w => w.word.toLowerCase() === word.toLowerCase());
  const addBtn = document.getElementById('panel-add-vocab-btn');

  if (existing) {
    addBtn.textContent = '已在生词本中 ✓';
    addBtn.style.background = '#666';
    if (existing.llm_explanation) {
      const explainResult = document.getElementById('llm-explain-result');
      explainResult.classList.remove('hidden');
      explainResult.innerHTML = `<div class="def-section-label" style="margin-top:0;">已保存的 AI 解释</div>${renderLlmExplanation(existing.llm_explanation)}`;
    }
  }

  try {
    const resp = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}`);
    const data = await resp.json();

    const phoneticEl = content.querySelector('.word-panel-phonetic');
    const localPhonetic = data.local?.phonetic || '';
    phoneticEl.textContent = localPhonetic || '';

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

    const translateSection = document.getElementById('def-translate-section');
    translateSection.classList.remove('hidden');

    if (existing && existing.definition_cn) {
      const translateContent = document.getElementById('def-translate-content');
      translateContent.innerHTML = `<div class="def-google-translation">${escapeHtml(existing.definition_cn)}</div>`;
    } else if (data.llm_translation && data.llm_translation.translation_cn) {
      const translateContent = document.getElementById('def-translate-content');
      translateContent.innerHTML = `<div class="def-google-translation">${escapeHtml(data.llm_translation.translation_cn)}</div>`;
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
      body: JSON.stringify({ word, api_key: settingsData.api_key || '', api_base_url: settingsData.api_base_url || '' }),
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

  let defCn = '';
  const localTranslation = content.querySelector('.def-local-translation');
  if (localTranslation) defCn = localTranslation.textContent;

  const translateContent = document.getElementById('def-translate-content');
  const translateText = translateContent?.querySelector('.def-google-translation')?.textContent || '';
  if (translateText) defCn = translateText;

  let llmExplanation = '';
  const explainResult = document.getElementById('llm-explain-result');
  if (explainResult && !explainResult.classList.contains('hidden')) {
    llmExplanation = explainResult.innerText;
  }

  const ctx = currentWordContext ? {
    date: currentWordContext.date,
    segmentId: currentWordContext.segmentId,
    sentence: currentWordContext.sentence,
  } : null;

  // Check duplicate
  const existingIdx = vocabData.words.findIndex(w => w.word.toLowerCase() === currentDictWord.toLowerCase());

  if (existingIdx >= 0) {
    // Update existing
    const w = vocabData.words[existingIdx];
    if (defCn) w.definition_cn = defCn;
    if (phonetic) w.phonetic = phonetic;
    if (llmExplanation) w.llm_explanation = llmExplanation;
    if (ctx) {
      w.contexts = w.contexts || [];
      const exists = w.contexts.some(c => c.date === ctx.date && c.segmentId === ctx.segmentId);
      if (!exists) w.contexts.push(ctx);
    }
  } else {
    const entry = {
      word: currentDictWord,
      definition_cn: defCn || '',
      definition_en: '',
      phonetic: phonetic,
      llm_explanation: llmExplanation || '',
      addedAt: new Date().toISOString().split('T')[0],
      reviewCount: 0,
      mastered: false,
      contexts: [],
    };
    if (ctx) entry.contexts.push(ctx);
    vocabData.words.push(entry);
  }

  vocabData.total = vocabData.words.length;
  vocabData.unmastered = vocabData.words.filter(w => !w.mastered).length;
  vocabData.mastered = vocabData.total - vocabData.unmastered;
  writeLS('er_vocabulary', { words: vocabData.words });

  showToast('已加入生词本!');
  const addBtn = document.getElementById('panel-add-vocab-btn');
  if (addBtn) { addBtn.textContent = '已在生词本中 ✓'; addBtn.style.background = '#666'; }
  loadVocabUI();
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
      body: JSON.stringify({ word, api_key: settingsData.api_key || '', api_base_url: settingsData.api_base_url || '' }),
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
function loadHistoryPanel() {
  const content = document.getElementById('history-panel-content');
  const titleEl = document.getElementById('right-panel-title');
  if (titleEl) titleEl.textContent = '历史阅读';

  const allReadings = readLS('er_readings', {});
  const dates = Object.keys(allReadings).sort().reverse();

  if (dates.length === 0) {
    content.innerHTML = '<p class="history-empty">暂无历史记录</p>';
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  content.innerHTML = '';

  dates.forEach(dateStr => {
    const reading = allReadings[dateStr];
    if (!reading) return;

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
    let displayTopic = reading.topic || '(无主题)';
    if (displayTopic === '__HOT_TOPICS__') displayTopic = '近期热点';
    topicDiv.textContent = displayTopic;

    const segCountDiv = document.createElement('div');
    segCountDiv.className = 'history-item-topic';
    segCountDiv.style.fontSize = '0.7rem';
    segCountDiv.style.color = '#999';
    if (reading.topics && reading.topics.length > 0) {
      const topics = reading.topics;
      const total = topics.reduce((s, t) => s + (t.segmentCount || 0), 0) || (reading.segments ? reading.segments.length : 0);
      if (topics.length === 1) {
        segCountDiv.textContent = `${total} 段`;
      } else {
        segCountDiv.textContent = topics.map(t => `${t.topic}: ${t.segmentCount}段`).join(' | ');
      }
    } else if (reading.segments) {
      segCountDiv.textContent = `${reading.segments.length} 段`;
    }

    item.appendChild(dateDiv);
    item.appendChild(topicDiv);
    item.appendChild(segCountDiv);

    item.addEventListener('click', () => {
      currentReadingDate = dateStr;
      loadReading(dateStr);
      content.querySelectorAll('.history-item').forEach(el => el.classList.remove('current'));
      item.classList.add('current');
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
  });
}

// ===================== VOCABULARY =====================
function loadVocabUI() {
  vocabData.total = vocabData.words.length;
  vocabData.unmastered = vocabData.words.filter(w => !w.mastered).length;
  vocabData.mastered = vocabData.total - vocabData.unmastered;
  renderVocab();
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

  const csvBtn = document.getElementById('vocab-export-csv');
  if (csvBtn) csvBtn.addEventListener('click', exportCSV);
  const ankiBtn = document.getElementById('vocab-export-anki');
  if (ankiBtn) ankiBtn.addEventListener('click', exportAnki);
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

    row.addEventListener('click', async (e) => {
      if (e.target.closest('.v-action-btn')) return;
      currentWordContext = null;
      await showWordInPanelFromVocab(w);
      toggleLeftPanel(true);
      await loadVocabSourcesIntoRightPanel(w);
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
        if (w) {
          w.mastered = !w.mastered;
          vocabData.total = vocabData.words.length;
          vocabData.unmastered = vocabData.words.filter(x => !x.mastered).length;
          vocabData.mastered = vocabData.total - vocabData.unmastered;
          writeLS('er_vocabulary', { words: vocabData.words });
          renderVocab();
        }
      } else if (action === 'delete') {
        vocabData.words = vocabData.words.filter(v => v.word !== word);
        vocabData.total = vocabData.words.length;
        vocabData.unmastered = vocabData.words.filter(x => !x.mastered).length;
        vocabData.mastered = vocabData.total - vocabData.unmastered;
        writeLS('er_vocabulary', { words: vocabData.words });
        renderVocab();
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

    item.addEventListener('click', () => {
      currentReadingDate = ctx.date;
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab[data-tab="reading"]').classList.add('active');
      document.getElementById('tab-reading').classList.add('active');
      currentTab = 'reading';
      loadReading(ctx.date);
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

  const w = vocabData.words.find(v => v.word.toLowerCase() === wordLower);
  if (w) {
    renderContexts(ctxDiv, w);
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
function syncReadingTabSliders() {
  const wps = settingsData.wordsPerSegment || 50;
  const sc = settingsData.segmentCount || 10;
  document.getElementById('words-slider').value = wps;
  document.getElementById('words-input').value = wps;
  document.getElementById('words-val').textContent = wps;
  document.getElementById('count-slider').value = sc;
  document.getElementById('count-input').value = sc;
  document.getElementById('count-val').textContent = sc;
}

function populateSettingsForm() {
  const keyInput = document.getElementById('setting-api-key');
  keyInput.value = settingsData.api_key || '';
  keyInput.disabled = false;

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

  const clickMode = settingsData.wordClickMode || 'double';
  const clickRadio = document.querySelector(`input[name="clickMode"][value="${clickMode}"]`);
  if (clickRadio) clickRadio.checked = true;

  renderSavedTopics();
  updateApiKeyStatus();

  syncReadingTabSliders();
}

function updateApiKeyStatus() {
  const statusEl = document.getElementById('api-key-status');
  const keyInput = document.getElementById('setting-api-key');
  if (settingsData.api_key) {
    statusEl.textContent = 'API Key 已配置 (保存在浏览器)';
    statusEl.style.color = '#4a7c59';
    if (!keyInput.value) {
      keyInput.placeholder = settingsData.api_key_masked || 'sk-... (已保存)';
    }
  } else if (keyInput.value.trim()) {
    statusEl.textContent = '点击保存后生效';
    statusEl.style.color = '#e67e22';
  } else {
    statusEl.textContent = '请输入 API Key 后保存 (或设置 DEEPSEEK_API_KEY 环境变量)';
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

function addToSavedTopics(topic) {
  if (!topic || topic === '__HOT_TOPICS__') return;
  if (!settingsData.savedTopics) settingsData.savedTopics = [];
  if (!settingsData.savedTopics.includes(topic)) {
    settingsData.savedTopics.unshift(topic);
    if (settingsData.savedTopics.length > 20) settingsData.savedTopics.pop();
    writeLS('er_settings', settingsData);
  }
}

function initSettings() {
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('setting-api-key').addEventListener('input', updateApiKeyStatus);
}

function saveSettings() {
  const status = document.getElementById('settings-status');

  const defaultTopic = document.getElementById('setting-default-topic').value.trim();
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'cet6';
  const apiKeyInput = document.getElementById('setting-api-key').value.trim();
  const clickMode = document.querySelector('input[name="clickMode"]:checked')?.value || 'double';

  settingsData.api_base_url = document.getElementById('setting-api-url').value.trim();
  settingsData.wordsPerSegment = parseInt(document.getElementById('setting-words-input').value);
  settingsData.segmentCount = parseInt(document.getElementById('setting-count-input').value);
  settingsData.difficulty = difficulty;
  settingsData.defaultTopic = defaultTopic || '__HOT_TOPICS__';
  settingsData.vocabIntegration = document.getElementById('setting-vocab-integration').checked;
  settingsData.vocabIntegrationCount = parseInt(document.getElementById('setting-vocab-count-input').value);
  settingsData.wordClickMode = clickMode;

  if (apiKeyInput) {
    settingsData.api_key = apiKeyInput;
  }

  // Save to localStorage
  writeLS('er_settings', settingsData);

  // Sync reading tab sliders
  syncReadingTabSliders();
  initDictPanel();

  status.textContent = '设置已保存!';
  status.className = 'status success';
  showToast('设置已保存!');
}
