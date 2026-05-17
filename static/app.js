/* === English Daily Reader - Frontend Logic === */

// ===================== STATE =====================
let currentTab = 'reading';
let currentFilter = 'all';
let vocabData = { words: [], total: 0, unmastered: 0, mastered: 0 };
let settingsData = {};
let expandedWord = null;
let currentReadingDate = '';

// ===================== INIT =====================
document.addEventListener('DOMContentLoaded', () => {
  const today = new Date().toISOString().split('T')[0];
  currentReadingDate = today;
  document.getElementById('reading-date').value = today;

  initTabs();
  initTopicInput();
  initSliders();
  initSettingsSliders();
  initGenerate();
  initLoadMore();
  initDatePicker();
  initDictPopover();
  initVocabulary();
  initSettings();
  loadSettings();
  loadVocab();

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
      if (tabId === 'vocabulary') loadVocab();
      if (tabId === 'settings') loadSettings();
    });
  });
}

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

  // Hot topics default
  const hotItem = document.createElement('div');
  hotItem.className = 'topic-dropdown-item';
  hotItem.textContent = '近期热点 (默认)';
  hotItem.addEventListener('mousedown', () => {
    document.getElementById('topic-input').value = '';
    dropdown.classList.add('hidden');
  });
  dropdown.appendChild(hotItem);

  // Saved topics
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

// ===================== DATE PICKER =====================
function initDatePicker() {
  document.getElementById('reading-date').addEventListener('change', (e) => {
    currentReadingDate = e.target.value;
    loadReading(e.target.value);
  });
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
    document.getElementById('reading-date').value = data.date;

    // Save topic to history
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

    showToast('生成完成!');
    loadVocab(); // Refresh vocab in case contexts were updated
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

    const index = document.createElement('div');
    index.className = 'segment-index';
    index.textContent = `第 ${idx + 1} 段 · ${seg.english.split(/\s+/).length} 词`;

    const enDiv = document.createElement('div');
    enDiv.className = 'segment-en';
    enDiv.innerHTML = tokenizeEnglish(seg.english);

    const zhDiv = document.createElement('div');
    zhDiv.className = 'segment-zh';
    zhDiv.textContent = seg.chinese;

    const kwDiv = document.createElement('div');
    kwDiv.className = 'segment-kw';
    if (seg.keywords && seg.keywords.length > 0) {
      kwDiv.innerHTML = '关键词: ' + seg.keywords.map(k =>
        `<span class="kw-tag">${escapeHtml(k)}</span>`
      ).join(' ');
    }

    card.appendChild(index);
    card.appendChild(enDiv);
    card.appendChild(zhDiv);
    card.appendChild(kwDiv);
    container.appendChild(card);
  });
}

function tokenizeEnglish(text) {
  // Split on whitespace, preserve spaces, wrap each word in <span>
  const parts = text.split(/(\s+)/);
  let result = '';
  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      result += part;
      continue;
    }
    // Separate trailing punctuation from word
    const m = part.match(/^(\*\*)?([a-zA-Z0-9'-]+)([^a-zA-Z0-9'-]*)(\*\*)?$/);
    if (m) {
      const boldOpen = m[1] || '';
      const word = m[2];
      const punct = m[3] || '';
      const boldClose = m[4] || '';
      const hasBold = !!(boldOpen && boldClose);

      let cls = 'word';
      if (hasBold) cls += ' vocab-word';

      result += `<span class="${cls}" data-word="${escapeHtml(word.toLowerCase())}">${boldOpen}${escapeHtml(word)}${boldClose}</span>${escapeHtml(punct)}`;
    } else {
      result += escapeHtml(part);
    }
  }
  return result;
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

  try {
    const resp = await fetch(`/api/readings/${dateStr}`);
    if (!resp.ok) {
      container.innerHTML = '<p style="text-align:center;color:#999;">该日期暂无阅读内容</p>';
      loadMore.classList.add('hidden');
      return;
    }
    const data = await resp.json();
    renderSegments(data.segments);

    // Show load more only for today
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) {
      loadMore.classList.remove('hidden');
    } else {
      loadMore.classList.add('hidden');
    }
  } catch (err) {
    container.innerHTML = '<p style="text-align:center;color:#c0392b;">加载失败</p>';
  }
}

// ===================== LOAD MORE =====================
function initLoadMore() {
  document.getElementById('load-more-btn').addEventListener('click', async () => {
    const btn = document.getElementById('load-more-btn');
    btn.disabled = true;
    btn.textContent = '生成中...';

    const topic = document.getElementById('topic-input').value.trim();
    const wordsPerSegment = parseInt(document.getElementById('words-input').value);
    const count = 5; // Load more in smaller batches

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
    } catch (err) {
      showToast('追加失败: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '继续生成更多...';
    }
  });
}

// ===================== DICTIONARY POPOVER =====================
let popoverVisible = false;
let currentPopoverWord = '';

function initDictPopover() {
  // Double-click on words
  document.getElementById('segments-container').addEventListener('dblclick', async (e) => {
    const wordEl = e.target.closest('.word');
    if (!wordEl) return;

    const word = wordEl.dataset.word;
    if (!word) return;

    currentPopoverWord = word;
    await showPopover(word, e.clientX, e.clientY);
  });

  // Close popover
  document.addEventListener('click', (e) => {
    const popover = document.getElementById('dict-popover');
    if (popoverVisible && !popover.contains(e.target) && !e.target.closest('.word')) {
      hidePopover();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hidePopover();
  });

  // Add to vocab button
  document.getElementById('dict-add-vocab').addEventListener('click', async () => {
    if (!currentPopoverWord) return;
    const popover = document.getElementById('dict-popover');
    const phonetic = popover.querySelector('.dict-phonetic')?.textContent || '';
    const meanings = [];
    popover.querySelectorAll('.dict-meaning').forEach(m => {
      meanings.push(m.textContent);
    });

    try {
      const resp = await fetch('/api/vocabulary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: currentPopoverWord,
          phonetic: phonetic,
          definition_cn: meanings.join('; '),
          definition_en: '',
        }),
      });
      if (resp.status === 409) {
        showToast('已在生词本中');
      } else if (resp.ok) {
        showToast('已加入生词本!');
        document.getElementById('dict-add-vocab').textContent = ' 已加入生词本';
        document.getElementById('dict-add-vocab').disabled = true;
        loadVocab();
      }
    } catch (err) {
      showToast('添加失败');
    }
  });

  // Auto-hide after 5 seconds
  let popoverTimer;
  document.getElementById('dict-popover').addEventListener('mouseenter', () => {
    clearTimeout(popoverTimer);
  });
  document.getElementById('dict-popover').addEventListener('mouseleave', () => {
    popoverTimer = setTimeout(hidePopover, 2000);
  });
}

async function showPopover(word, x, y) {
  const popover = document.getElementById('dict-popover');
  popover.classList.remove('hidden');
  popover.querySelector('.dict-word').textContent = '查询中...';
  popover.querySelector('.dict-phonetic').textContent = '';
  popover.querySelector('.dict-meanings').innerHTML = '';
  document.getElementById('dict-add-vocab').textContent = '+ 加入生词本';
  document.getElementById('dict-add-vocab').disabled = false;

  // Position near the click
  popover.style.left = Math.min(x, window.innerWidth - 340) + 'px';
  popover.style.top = (y + 15) + 'px';
  popoverVisible = true;

  // Check if already in vocab
  const existing = vocabData.words.find(w => w.word.toLowerCase() === word.toLowerCase());

  try {
    const resp = await fetch(`/api/dictionary?word=${encodeURIComponent(word)}`);
    const data = await resp.json();

    popover.querySelector('.dict-word').textContent = data.word || word;
    popover.querySelector('.dict-phonetic').textContent = data.phonetic || '';

    const meaningsDiv = popover.querySelector('.dict-meanings');
    meaningsDiv.innerHTML = '';

    if (data.meanings && data.meanings.length > 0) {
      data.meanings.forEach(m => {
        const div = document.createElement('div');
        div.className = 'dict-meaning';
        let text = '';
        if (m.pos) text += `<span class="dict-pos">${escapeHtml(m.pos)}</span>`;
        if (m.def_cn) text += escapeHtml(m.def_cn);
        if (m.def_en) text += (text ? ' ' : '') + escapeHtml(m.def_en);
        div.innerHTML = text || '-';
        meaningsDiv.appendChild(div);
      });
    } else if (data.error) {
      meaningsDiv.innerHTML = '<span style="color:#999;">未找到释义</span>';
    }

    if (existing) {
      document.getElementById('dict-add-vocab').textContent = ' 已在生词本中';
      document.getElementById('dict-add-vocab').disabled = true;
      // Add "查看语境 →" link
      let ctxLink = document.getElementById('dict-view-context');
      if (!ctxLink) {
        ctxLink = document.createElement('a');
        ctxLink.id = 'dict-view-context';
        ctxLink.className = 'dict-context-link';
        ctxLink.textContent = '查看语境 →';
        ctxLink.addEventListener('click', (e) => {
          e.preventDefault();
          hidePopover();
          // Switch to vocabulary tab and expand the word
          document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
          document.querySelector('.tab[data-tab="vocabulary"]').classList.add('active');
          document.getElementById('tab-vocabulary').classList.add('active');
          currentTab = 'vocabulary';
          loadVocab().then(() => {
            // Find and expand the word's context
            setTimeout(() => {
              const wordRow = document.querySelector(`.vocab-list .vocab-row .v-word`);
              if (wordRow) {
                const row = wordRow.closest('.vocab-row');
                if (row) row.click();
              }
            }, 300);
          });
        });
        document.getElementById('dict-add-vocab').insertAdjacentElement('afterend', ctxLink);
      }
      ctxLink.style.display = '';
    } else {
      const ctxLink = document.getElementById('dict-view-context');
      if (ctxLink) ctxLink.style.display = 'none';
    }
  } catch (err) {
    popover.querySelector('.dict-word').textContent = word;
    popover.querySelector('.dict-meanings').innerHTML = '<span style="color:#c0392b;">查询失败</span>';
  }
}

function hidePopover() {
  document.getElementById('dict-popover').classList.add('hidden');
  popoverVisible = false;
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

  // Export buttons
  document.getElementById('vocab-export-csv')?.addEventListener('click', exportCSV);
  document.getElementById('vocab-export-anki')?.addEventListener('click', exportAnki);

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

  // Filter
  if (currentFilter === 'unmastered') {
    words = words.filter(w => !w.mastered);
  } else if (currentFilter === 'mastered') {
    words = words.filter(w => w.mastered);
  }

  // Search
  if (searchTerm) {
    words = words.filter(w =>
      w.word.toLowerCase().includes(searchTerm) ||
      (w.definition_cn || '').includes(searchTerm) ||
      (w.definition_en || '').toLowerCase().includes(searchTerm)
    );
  }

  // Sort by date descending
  words.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));

  // Update stats
  document.getElementById('vocab-total').textContent = `共 ${vocabData.total} 词`;
  document.getElementById('vocab-unmastered').textContent = `未掌握 ${vocabData.unmastered} 词`;

  // Render
  container.innerHTML = '';
  if (words.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">暂无生词</p>';
    return;
  }

  words.forEach(w => {
    const row = document.createElement('div');
    row.className = 'vocab-row' + (w.mastered ? ' mastered' : '');
    row.innerHTML = `
      <span class="v-word">${escapeHtml(w.word)}</span>
      <span class="v-phonetic">${escapeHtml(w.phonetic || '')}</span>
      <span class="v-def">${escapeHtml(w.definition_cn || w.definition_en || '')}</span>
      <span class="v-date">${escapeHtml(w.addedAt || '')}</span>
      <span class="v-actions">
        <button class="v-action-btn check" data-action="toggle" data-word="${escapeHtml(w.word)}">
          ${w.mastered ? '恢复' : '掌握'}
        </button>
        <button class="v-action-btn del" data-action="delete" data-word="${escapeHtml(w.word)}">删</button>
      </span>
    `;

    row.addEventListener('click', (e) => {
      // Don't toggle context on button clicks
      if (e.target.closest('.v-action-btn')) return;
      toggleWordContext(w.word, row);
    });

    container.appendChild(row);

    // Context panel
    if (expandedWord === w.word.toLowerCase()) {
      const ctxDiv = document.createElement('div');
      ctxDiv.className = 'vocab-contexts';
      ctxDiv.id = `ctx-${w.word.toLowerCase()}`;
      renderContexts(ctxDiv, w);
      container.appendChild(ctxDiv);
    }
  });

  // Action buttons
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

async function toggleWordContext(word, rowEl) {
  const wordLower = word.toLowerCase();

  if (expandedWord === wordLower) {
    // Collapse
    expandedWord = null;
    const ctxEl = document.getElementById(`ctx-${wordLower}`);
    if (ctxEl) ctxEl.remove();
    return;
  }

  // Collapse previous
  if (expandedWord) {
    const prevCtx = document.getElementById(`ctx-${expandedWord}`);
    if (prevCtx) prevCtx.remove();
  }

  expandedWord = wordLower;
  const ctxDiv = document.createElement('div');
  ctxDiv.className = 'vocab-contexts';
  ctxDiv.id = `ctx-${wordLower}`;
  rowEl.insertAdjacentElement('afterend', ctxDiv);

  // Fetch contexts
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
      // Navigate to reading tab and load that date
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab[data-tab="reading"]').classList.add('active');
      document.getElementById('tab-reading').classList.add('active');
      currentTab = 'reading';
      currentReadingDate = ctx.date;
      document.getElementById('reading-date').value = ctx.date;
      loadReading(ctx.date);
    });

    container.appendChild(item);
  });
}

function exportCSV() {
  const lines = ['单词,音标,中文释义,英文释义,添加日期,已掌握'];
  vocabData.words.forEach(w => {
    lines.push([
      w.word,
      w.phonetic || '',
      w.definition_cn || '',
      w.definition_en || '',
      w.addedAt || '',
      w.mastered ? '是' : '否',
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
    // API key from .env — show as read-only
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

  const diffRadio = document.querySelector(`input[name="difficulty"][value="${settingsData.difficulty || 'intermediate'}"]`);
  if (diffRadio) diffRadio.checked = true;

  document.getElementById('setting-default-topic').value =
    (settingsData.defaultTopic === '__HOT_TOPICS__') ? '' : (settingsData.defaultTopic || '');

  document.getElementById('setting-vocab-integration').checked =
    settingsData.vocabIntegration !== false;

  document.getElementById('setting-vocab-count-slider').value = settingsData.vocabIntegrationCount || 8;
  document.getElementById('setting-vocab-count-input').value = settingsData.vocabIntegrationCount || 8;
  document.getElementById('setting-vocab-count-val').textContent = settingsData.vocabIntegrationCount || 8;

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
    // Save silently
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
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || 'intermediate';
  const apiKeyInput = document.getElementById('setting-api-key').value.trim();

  const newSettings = {
    api_base_url: document.getElementById('setting-api-url').value.trim(),
    wordsPerSegment: parseInt(document.getElementById('setting-words-input').value),
    segmentCount: parseInt(document.getElementById('setting-count-input').value),
    difficulty: difficulty,
    defaultTopic: defaultTopic || '__HOT_TOPICS__',
    vocabIntegration: document.getElementById('setting-vocab-integration').checked,
    vocabIntegrationCount: parseInt(document.getElementById('setting-vocab-count-input').value),
    savedTopics: settingsData.savedTopics || [],
  };

  // Only send API key if user entered a new one (and key is not from .env)
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

    status.textContent = '设置已保存!';
    status.className = 'status success';
    showToast('设置已保存!');
  } catch (err) {
    status.textContent = '保存失败: ' + err.message;
    status.className = 'status error';
  }
}
