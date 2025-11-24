const desktopGrid = document.getElementById('desktop-grid');
const dock = document.getElementById('dock');
const windowLayer = document.getElementById('window-layer');
const nowBody = document.getElementById('now-body');
const nowChip = document.getElementById('now-chip');
const systemChip = document.getElementById('system-chip');
const systemStateChip = document.getElementById('system-state-chip');
const memoryMeter = document.getElementById('memory-meter');
const cpuMeter = document.getElementById('cpu-meter');
const clockChip = document.getElementById('clock-chip');
const quickActionsContainer = document.getElementById('quick-actions');

const apps = [
  {
    id: 'notebook',
    name: 'ノート & タスク',
    icon: '🧠',
    accent: '#fcd34d',
    tagline: 'メモとアクションをひとまとめ',
    context: 'ドラフト 3 件',
  },
  {
    id: 'nowplaying',
    name: 'オーディオシーン',
    icon: '🎧',
    accent: '#a78bfa',
    tagline: '集中用プレイリストとタイマー',
    context: 'Lo-Fi 26分',
  },
  {
    id: 'skywatch',
    name: 'Sky Watch',
    icon: '🌤️',
    accent: '#34d399',
    tagline: '空模様と気圧ダッシュボード',
    context: '神奈川 18℃',
  },
  {
    id: 'briefing',
    name: 'デイリーブリーフ',
    icon: '📰',
    accent: '#f97316',
    tagline: '予定と最新メモを凝縮表示',
    context: '更新 5分前',
  },
  {
    id: 'spaces',
    name: 'Spaces',
    icon: '🗂️',
    accent: '#22d3ee',
    tagline: 'シーン別のデスクトップ切替',
    context: '3 シーン準備済',
  },
  {
    id: 'command',
    name: 'コマンドパレット',
    icon: '⌨️',
    accent: '#38bdf8',
    tagline: 'よく使う操作をすぐ起動',
    context: 'ショートカット学習中',
  },
];

const quickActions = [
  { id: 'record', label: 'クイック録音', detail: '30秒メモ', icon: '🎙️', active: false },
  { id: 'focus', label: 'フォーカス 25:00', detail: '集中モード', icon: '⏱️', active: true },
  { id: 'share', label: 'ステータス共有', detail: 'チームに公開', icon: '📡', active: false },
];

const scenes = [
  {
    name: 'Focus',
    cue: '静かな照明 + Lo-Fi',
    tasks: ['ドラフトのレビュー', '構造のメモ化', 'Ambient Playlist'],
  },
  {
    name: 'Planning',
    cue: 'ボードとメモを横並び',
    tasks: ['週次のマイルストーン更新', '今日の優先度決定'],
  },
  {
    name: 'Ambient',
    cue: '通知を静かに保つ',
    tasks: ['フローを維持', '呼吸 4-7-8'],
  },
];

const state = {
  sceneIndex: 0,
  openWindows: new Map(),
  zIndex: 10,
};

const accentGradient = (accent) =>
  `linear-gradient(135deg, ${accent} 0%, rgba(110, 231, 255, 0.35) 100%)`;

const createAppCard = (app) => {
  const card = document.createElement('article');
  card.className = 'app-card';
  card.dataset.app = app.id;
  card.addEventListener('click', () => openApp(app.id));

  const icon = document.createElement('div');
  icon.className = 'app-icon';
  icon.style.background = accentGradient(app.accent);
  icon.textContent = app.icon;

  const meta = document.createElement('div');
  meta.className = 'app-meta';

  const name = document.createElement('div');
  name.className = 'app-name';
  name.textContent = app.name;

  const pill = document.createElement('span');
  pill.className = 'pill';
  pill.textContent = app.context;

  meta.append(name, pill);

  const tagline = document.createElement('div');
  tagline.className = 'app-tagline';
  tagline.textContent = app.tagline;

  card.append(icon, meta, tagline);
  return card;
};

const renderDesktop = () => {
  desktopGrid.innerHTML = '';
  apps.forEach((app) => desktopGrid.appendChild(createAppCard(app)));
};

const renderDock = () => {
  dock.innerHTML = '';
  const dockItems = ['spaces', 'notebook', 'skywatch', 'command', 'nowplaying'];
  dockItems.forEach((id) => {
    const app = apps.find((a) => a.id === id);
    if (!app) return;
    const btn = document.createElement('button');
    btn.title = app.name;
    btn.textContent = app.icon;
    btn.style.background = 'rgba(255,255,255,0.05)';
    btn.addEventListener('click', () => openApp(app.id));
    dock.appendChild(btn);
  });
};

const openApp = (id) => {
  const app = apps.find((a) => a.id === id);
  if (!app) return;

  const existing = state.openWindows.get(id);
  if (existing) {
    state.zIndex += 1;
    existing.style.zIndex = state.zIndex.toString();
    existing.classList.remove('pop');
    existing.offsetHeight;
    existing.classList.add('pop');
    return;
  }

  const win = document.createElement('section');
  win.className = 'window';
  win.style.zIndex = state.zIndex.toString();
  win.dataset.app = id;
  win.classList.add('pop');

  const header = document.createElement('div');
  header.className = 'window-header';

  const title = document.createElement('div');
  title.className = 'window-title';

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = app.accent;

  const label = document.createElement('span');
  label.textContent = app.name;

  title.append(dot, label);

  const close = document.createElement('button');
  close.className = 'ghost';
  close.textContent = '閉じる';
  close.addEventListener('click', () => closeWindow(id));

  header.append(title, close);

  const body = document.createElement('div');
  body.className = 'window-body';
  renderWindowContent(app, body);

  win.append(header, body);
  windowLayer.prepend(win);
  state.openWindows.set(id, win);
  state.zIndex += 1;
};

const closeWindow = (id) => {
  const win = state.openWindows.get(id);
  if (!win) return;
  win.remove();
  state.openWindows.delete(id);
};

const renderWindowContent = (app, body) => {
  switch (app.id) {
    case 'notebook':
      return renderNotebook(body);
    case 'nowplaying':
      return renderNowPlaying(body);
    case 'skywatch':
      return renderSkyWatch(body);
    case 'briefing':
      return renderBriefing(body);
    case 'spaces':
      return renderSpaces(body);
    case 'command':
    default:
      return renderCommandPalette(body);
  }
};

const renderNotebook = (body) => {
  body.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = '今日のアイデア';

  const list = document.createElement('div');
  list.className = 'list';
  ['会議メモを図解にする', '集中用のシーン作り', 'プロトタイプの動線確認'].forEach((item) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.textContent = `• ${item}`;
    list.appendChild(row);
  });

  const note = document.createElement('p');
  note.className = 'mono';
  note.textContent = '⌘+N で新しいメモを追加 (モック)';

  body.append(title, list, note);
};

const renderNowPlaying = (body) => {
  body.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = 'ムード別プレイリスト';

  const list = document.createElement('div');
  list.className = 'list';
  [
    { name: 'Midnight Focus', detail: 'Lo-Fi • 26:00' },
    { name: 'Gentle Pulse', detail: 'Ambient • 42:00' },
    { name: 'Rain Window', detail: 'White noise • 50:00' },
  ].forEach((track) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `<strong>${track.name}</strong><div class="mono">${track.detail}</div>`;
    list.appendChild(row);
  });

  const hint = document.createElement('p');
  hint.className = 'mono';
  hint.textContent = '次のトラックを予約しておきました。';

  body.append(title, list, hint);
};

const renderSkyWatch = (body) => {
  body.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = 'Sky Watch / 関東';

  const summary = document.createElement('div');
  summary.className = 'pill accent';
  summary.textContent = '18℃ ・薄曇り ・ 体感16℃';

  const list = document.createElement('div');
  list.className = 'list';
  [
    '気圧 1013hPa / 安定',
    '北東の風 2m/s',
    '午後は晴れ間 16:00-18:00',
  ].forEach((item) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.textContent = item;
    list.appendChild(row);
  });

  body.append(title, summary, list);
};

const renderBriefing = (body) => {
  body.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = 'デイリーブリーフ';

  const list = document.createElement('div');
  list.className = 'list';
  ['10:00 Standup', '13:00 デザイン検討', '17:00 Sync'].forEach((slot) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `<strong>${slot}</strong><div class="mono">メモを添付できます (モック)</div>`;
    list.appendChild(row);
  });

  body.append(title, list);
};

const renderSpaces = (body) => {
  body.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = 'Spaces';

  const list = document.createElement('div');
  list.className = 'list';
  scenes.forEach((scene) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `<strong>${scene.name}</strong><div class="mono">${scene.cue}</div>`;
    list.appendChild(row);
  });

  const hint = document.createElement('p');
  hint.className = 'mono';
  hint.textContent = 'クリックでシーンを切り替えるモックです。';

  body.append(title, list, hint);
};

const renderCommandPalette = (body) => {
  body.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = 'コマンドパレット';

  const list = document.createElement('div');
  list.className = 'list';
  [
    'スクリーンショットを撮る (モック)',
    '部屋を暗くする',
    '集中モード 50分',
    'シーンを呼び出す',
  ].forEach((cmd) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.textContent = cmd;
    list.appendChild(row);
  });

  body.append(title, list);
};

const renderQuickActions = () => {
  quickActionsContainer.innerHTML = '';
  quickActions.forEach((action) => {
    const row = document.createElement('div');
    row.className = 'quick-action';
    row.dataset.action = action.id;
    row.addEventListener('click', () => toggleAction(action.id));

    const label = document.createElement('div');
    label.className = 'quick-label';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = action.active ? '#34d399' : '#a78bfa';
    const text = document.createElement('div');
    text.innerHTML = `<strong>${action.icon} ${action.label}</strong><div class="mono">${action.detail}</div>`;
    label.append(dot, text);

    const status = document.createElement('span');
    status.className = 'chip tiny';
    status.textContent = action.active ? 'ON' : 'OFF';

    row.append(label, status);
    quickActionsContainer.appendChild(row);
  });
};

const toggleAction = (id) => {
  const action = quickActions.find((a) => a.id === id);
  if (!action) return;
  action.active = !action.active;
  renderQuickActions();
};

const updateClock = () => {
  const nowIso = window.desktopBridge?.getNowIso() ?? new Date().toISOString();
  const now = new Date(nowIso);
  const formatted = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  clockChip.textContent = formatted;
};

const hydrateSystemInfo = () => {
  const info = window.desktopBridge?.getSystemInfo?.();
  if (!info) {
    systemChip.textContent = 'mock system';
    return;
  }
  systemChip.textContent = `${info.user} · ${info.platform} ${info.release}`;
};

const shuffleScene = () => {
  state.sceneIndex = (state.sceneIndex + 1) % scenes.length;
  renderNowCard();
};

const renderNowCard = () => {
  const scene = scenes[state.sceneIndex];
  nowChip.textContent = scene.name;
  nowBody.innerHTML = '';

  const pill = document.createElement('span');
  pill.className = 'pill accent';
  pill.textContent = scene.cue;

  const list = document.createElement('div');
  list.className = 'list';
  scene.tasks.forEach((task) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.textContent = task;
    list.appendChild(row);
  });

  nowBody.append(pill, list);
};

const updateMeters = () => {
  const mem = 35 + Math.random() * 35;
  const cpu = 18 + Math.random() * 40;
  memoryMeter.style.width = `${mem.toFixed(0)}%`;
  cpuMeter.style.width = `${cpu.toFixed(0)}%`;
  systemStateChip.textContent = mem > 60 || cpu > 50 ? '調整中' : '安定';
};

const bindControls = () => {
  document.getElementById('shuffle-scene').addEventListener('click', shuffleScene);
  document.getElementById('toggle-widgets').addEventListener('click', () => {
    openApp('briefing');
    openApp('skywatch');
  });
};

const boot = () => {
  renderDesktop();
  renderDock();
  renderQuickActions();
  renderNowCard();
  hydrateSystemInfo();
  updateClock();
  updateMeters();
  bindControls();
  setInterval(updateClock, 30000);
  setInterval(updateMeters, 3500);
};

boot();
