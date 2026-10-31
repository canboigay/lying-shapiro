/**
 * Lying Capiro - Brian Shapiro (Pushing The Limits) Catchphrase Board & Debate Corpus
 * Data: ./data/phrase_ranks.json, ./data/phrase_audio.json, ./data/clips.json
 * All counts, windows, and quotes come directly from the transcript corpus.
 */

const TOP_N = 10;
const DODGE_PAGE_SIZE = 8;

const TDS_BUCKETS = new Set([
  "election_denial",
  "january_6",
  "felon_counts",
  "fascism_nazi",
  "stormy_sex_scandal",
  "liable_abuser",
  "epstein",
  "trump_whatabout",
  "cult_brainwash",
  "grift_media",
  "mushroom_gobbler",
]);

const TDS_TACTIC_BUCKETS = new Set([
  "debate_procedure",
  "polite_opener",
]);

const TDS_ABOUT_KEYS = [
  "trump",
  "election",
  "january 6",
  "january 6th",
  "felon",
  "epstein",
  "stormy",
  "harris",
  "maga",
  "e jean",
  "e. jean",
  "hush money",
  "capitol",
  "insurrection",
  "nazi",
  "fascist",
  "liable",
  "abuser",
];

const CATEGORIES = [
  "all",
  "recycled_point",
  "polite_dodge",
  "strawman",
  "obfuscation",
  "fake_smart",
  "dodge",
  "floor_control",
];

const CAT_LABELS = {
  all: "All categories",
  recycled_point: "Recycled talking point",
  obfuscation: "Obfuscation / filibuster",
  dodge: "Dodges the question",
  strawman: "Straw man",
  fake_smart: "Fake-smart flex",
  polite_dodge: "Polite dodge",
  floor_control: "Floor control",
};

const BUCKET_LABELS = {
  january_6: "January 6th & Insurrection",
  liable_abuser: "Liable Sexual Abuser / E. Jean Carroll",
  epstein: "Epstein Files",
  polite_opener: "Polite Opener -> Dodge",
  election_denial: "2020 Election Denial",
  felon_counts: "34-Count Convicted Felon",
  debate_procedure: "Procedural Filibuster / Floor Control",
  mushroom_gobbler: "MAGA / Trump Mushroom Gobbler",
  fascism_nazi: "Hitler / Fascist Comparisons",
  stormy_sex_scandal: "Stormy Daniels & Hush Money",
  grift_media: "Right-Wing Grifter",
  cult_brainwash: "MAGA Cult / Brainwashed",
  trump_whatabout: "Whataboutism",
};

let DATA = null;
let activeFilter = "all";
let searchQuery = "";
let sortMode = "ptl_hits";
let expandedId = null;
let showAll = false;
let expandedQuotesMap = {};

/** Polite dodge state */
let dodgeFilter = "pivot_marker";
let dodgeSearch = "";
let dodgeVisibleCount = DODGE_PAGE_SIZE;

/** Audio state */
var PHRASE_AUDIO_BY_ID = {};
var SOUNDBOARD_EXTRAS = [];
var phraseAudioEl = null;
var playingAudioKey = null;
var reelQueue = [];
var isReelPlaying = false;

function getPhraseAudio(clusterId) {
  if (!clusterId) return null;
  return PHRASE_AUDIO_BY_ID[clusterId] || null;
}

function getSoundboardExtra(sfxId) {
  for (var i = 0; i < SOUNDBOARD_EXTRAS.length; i++) {
    if (SOUNDBOARD_EXTRAS[i].id === sfxId) return SOUNDBOARD_EXTRAS[i];
  }
  return null;
}

function pauseWatchBrianVideos() {
  ["clips-player-host", "clips-drawer-host"].forEach(function (id) {
    var host = document.getElementById(id);
    if (!host) return;
    host.querySelectorAll("video").forEach(function (v) {
      try {
        v.pause();
      } catch (e) {}
    });
  });
}

function syncPhraseAudioButtons() {
  document.querySelectorAll(".phrase-audio-btn").forEach(function (btn) {
    var id = btn.getAttribute("data-cluster-id");
    var on = playingAudioKey && id === playingAudioKey;
    btn.classList.toggle("is-playing", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    var title = (getPhraseAudio(id) && getPhraseAudio(id).title) || id;
    btn.setAttribute(
      "aria-label",
      on ? 'Stop "' + title + '"' : 'Play "' + title + '"'
    );
    btn.textContent = on ? "■" : "▶";
  });

  document.querySelectorAll(".sb-pad").forEach(function (pad) {
    var key = pad.getAttribute("data-audio-key");
    var on = playingAudioKey && key === playingAudioKey;
    pad.classList.toggle("is-playing", !!on);
    pad.setAttribute("aria-pressed", on ? "true" : "false");
    var icon = pad.querySelector(".sb-pad-icon");
    if (icon) icon.textContent = on ? "■" : "▶";
  });

  var reelBtn = document.getElementById("play-reel-btn");
  if (reelBtn) {
    reelBtn.classList.toggle("is-playing", !!isReelPlaying);
    reelBtn.setAttribute("aria-pressed", isReelPlaying ? "true" : "false");
    reelBtn.textContent = isReelPlaying ? "▶ Playing Reel..." : "▶ Play All Mashups";
  }

  var stopBtn = document.getElementById("stop-audio-btn");
  if (stopBtn) {
    stopBtn.hidden = !playingAudioKey && !isReelPlaying;
  }

  // Update floating live audio dock
  var dock = document.getElementById("audio-dock-bar");
  var dockTitle = document.getElementById("audio-dock-title");
  if (dock) {
    if (playingAudioKey) {
      var item = getPhraseAudio(playingAudioKey) || getSoundboardExtra(playingAudioKey);
      var title = (item && item.title) || playingAudioKey;
      if (dockTitle) dockTitle.textContent = title;
      dock.hidden = false;
    } else {
      dock.hidden = true;
    }
  }
}

function ensurePhraseAudioEl() {
  if (phraseAudioEl) return phraseAudioEl;
  phraseAudioEl = document.createElement("audio");
  phraseAudioEl.preload = "none";
  phraseAudioEl.addEventListener("ended", function () {
    if (isReelPlaying && reelQueue.length > 0) {
      var nextKey = reelQueue.shift();
      playAudioByKey(nextKey, true);
      return;
    }
    isReelPlaying = false;
    playingAudioKey = null;
    syncPhraseAudioButtons();
  });
  phraseAudioEl.addEventListener("error", function () {
    if (isReelPlaying && reelQueue.length > 0) {
      var nextKey = reelQueue.shift();
      playAudioByKey(nextKey, true);
      return;
    }
    isReelPlaying = false;
    playingAudioKey = null;
    syncPhraseAudioButtons();
  });
  document.body.appendChild(phraseAudioEl);
  return phraseAudioEl;
}

function stopPhraseAudio() {
  isReelPlaying = false;
  reelQueue = [];
  if (phraseAudioEl) {
    try {
      phraseAudioEl.pause();
      phraseAudioEl.removeAttribute("src");
      phraseAudioEl.load();
    } catch (e) {}
  }
  playingAudioKey = null;
  syncPhraseAudioButtons();
}

function playAudioByKey(key, fromReel) {
  if (!fromReel) {
    isReelPlaying = false;
    reelQueue = [];
  }
  var item = getPhraseAudio(key) || getSoundboardExtra(key);
  if (!item || !item.src) return;
  if (!fromReel && playingAudioKey === key) {
    stopPhraseAudio();
    return;
  }
  pauseWatchBrianVideos();
  var el = ensurePhraseAudioEl();
  playingAudioKey = key;
  el.src = item.src;
  syncPhraseAudioButtons();
  var p = el.play();
  if (p && typeof p.catch === "function") {
    p.catch(function () {
      isReelPlaying = false;
      playingAudioKey = null;
      syncPhraseAudioButtons();
    });
  }
}

function playPhraseAudio(clusterId) {
  playAudioByKey(clusterId, false);
}

function startMashupReel() {
  if (isReelPlaying) {
    stopPhraseAudio();
    return;
  }
  var ordered = sortedClusters()
    .map(function (c) {
      return c.cluster_id;
    })
    .filter(function (id) {
      return !!getPhraseAudio(id);
    });
  SOUNDBOARD_EXTRAS.forEach(function (s) {
    ordered.push(s.id);
  });
  if (!ordered.length) return;
  isReelPlaying = true;
  reelQueue = ordered.slice(1);
  playAudioByKey(ordered[0], true);
}

function phraseAudioButtonHtml(clusterId, label) {
  var item = getPhraseAudio(clusterId);
  if (!item || !item.src) return "";
  var title = item.title || clusterId;
  var dur = Math.round(item.durationSec || 4);
  var btnText = label ? label : "Listen (" + dur + "s)";
  return (
    '<button type="button" class="phrase-audio-btn" data-cluster-id="' +
    escapeAttr(clusterId) +
    '" aria-label="Play &quot;' +
    escapeAttr(title) +
    '&quot;" aria-pressed="false">' +
    '<span class="audio-btn-icon">▶</span> ' +
    '<span class="audio-btn-label">' + escapeHtml(btnText) + '</span>' +
    '</button>'
  );
}

function loadPhraseAudio() {
  return fetch("./data/phrase_audio.json")
    .then(function (res) {
      if (!res.ok) throw new Error("phrase_audio " + res.status);
      return res.json();
    })
    .then(function (data) {
      PHRASE_AUDIO_BY_ID = {};
      (data.items || []).forEach(function (it) {
        if (it && it.clusterId && it.src) PHRASE_AUDIO_BY_ID[it.clusterId] = it;
      });
      SOUNDBOARD_EXTRAS = Array.isArray(data.soundboardExtras)
        ? data.soundboardExtras
        : [];
    })
    .catch(function () {
      PHRASE_AUDIO_BY_ID = {};
      SOUNDBOARD_EXTRAS = [];
    });
}

function boardLabel(c) {
  return (
    c.key_phrase ||
    c.canonical_label ||
    c.phrase ||
    c.display_title ||
    c.cluster_id ||
    "(untitled)"
  );
}

function quotedTitle(c) {
  let raw = String(boardLabel(c) || "").trim();
  raw = raw.replace(/^["\u201C\u201D]+/, "").replace(/["\u201C\u201D]+$/, "").trim();
  return "\u201C" + raw + "\u201D";
}

function timesUsedLabel(n) {
  const x = Number(n) || 0;
  if (x === 1) return "used 1 time";
  return "used " + x.toLocaleString() + " times";
}

function tryAvatar() {
  const img = document.getElementById("avatar-img");
  const wrap = document.getElementById("avatar-wrap");
  if (!img || !wrap) return;
  img.onload = function () {
    wrap.hidden = false;
  };
  img.onerror = function () {
    wrap.hidden = true;
  };
  img.src = "./brand/avatar.png";
}

/**
 * Clean rolling YouTube auto-caption stutters where a 3-8 word phrase is repeated back-to-back.
 */
function cleanRollingStutter(text) {
  if (!text) return "";
  let s = String(text).replace(/\s+/g, " ").trim();
  for (let pass = 0; pass < 3; pass++) {
    const words = s.split(" ");
    const out = [];
    let i = 0;
    while (i < words.length) {
      let skipped = false;
      for (let len = Math.min(9, Math.floor((words.length - i) / 2)); len >= 3; len--) {
        const a = words.slice(i, i + len).join(" ").toLowerCase();
        const b = words.slice(i + len, i + 2 * len).join(" ").toLowerCase();
        if (a === b) {
          for (let k = 0; k < len; k++) out.push(words[i + k]);
          i += 2 * len;
          skipped = true;
          break;
        }
      }
      if (!skipped) {
        out.push(words[i]);
        i++;
      }
    }
    s = out.join(" ");
  }
  return s;
}

function highlightSpanHtml(quoteText, spanText) {
  const cleaned = cleanRollingStutter(quoteText);
  const truncated = truncate(cleaned, 440);
  if (!spanText) return escapeHtml(truncated);
  const needle = String(spanText).trim();
  if (!needle || needle.length < 3) return escapeHtml(truncated);
  const lower = truncated.toLowerCase();
  const idx = lower.indexOf(needle.toLowerCase());
  if (idx === -1) return escapeHtml(truncated);
  const before = truncated.slice(0, idx);
  const match = truncated.slice(idx, idx + needle.length);
  const after = truncated.slice(idx + needle.length);
  return (
    escapeHtml(before) +
    "<mark>" +
    escapeHtml(match) +
    "</mark>" +
    escapeHtml(after)
  );
}

async function main() {
  tryAvatar();
  const board = document.getElementById("quote-board");
  try {
    const [res] = await Promise.all([
      fetch("./data/phrase_ranks.json"),
      loadPhraseAudio(),
    ]);
    if (!res.ok) throw new Error("HTTP " + res.status);
    DATA = await res.json();
  } catch (err) {
    console.error(err);
    if (board) {
      board.innerHTML =
        '<p class="board-empty">Could not load phrase ranks: ' +
        escapeHtml(String(err && err.message ? err.message : err)) +
        "</p>";
    }
    const blurb = document.getElementById("tds-blurb");
    if (blurb) blurb.textContent = "Failed to load data.";
    return;
  }

  const clusters = sortedClusters();
  renderTicker(clusters);
  renderHeroStats();
  renderTds(clusters);
  renderTdsBreakdown(clusters);
  renderSoundboard(clusters);
  renderCorpusPills();
  renderFilters();
  bindBoardControls();
  refreshBoard();
  renderDodgeLab();
  renderWilsonSection();
  renderFeudsAndX();
  renderFooter();
  bindShowMore();
  initClipsRail();
  initTabMenu();
  initSwipeGestures();
}

function sortedClusters(mode) {
  const m = mode || sortMode || "ptl_hits";
  return (DATA.clusters || []).slice().sort(function (a, b) {
    if (m === "debates") {
      return (b.videos_hit_ptl || 0) - (a.videos_hit_ptl || 0) || (b.hit_count_ptl || 0) - (a.hit_count_ptl || 0);
    }
    if (m === "wilson") {
      return (b.wilson_videos_hit || 0) - (a.wilson_videos_hit || 0) || (b.wilson_weighted_score || 0) - (a.wilson_weighted_score || 0);
    }
    if (m === "kewl") {
      return (b.hit_count_kewl_vic_live || 0) - (a.hit_count_kewl_vic_live || 0) || (b.hit_count_ptl || 0) - (a.hit_count_ptl || 0);
    }
    if (m === "rate") {
      return (b.rate_per_1k_ptl || 0) - (a.rate_per_1k_ptl || 0) || (b.hit_count_ptl || 0) - (a.hit_count_ptl || 0);
    }
    return (b.hit_count_ptl || 0) - (a.hit_count_ptl || 0);
  });
}

function isCatchphraseForBoard(c) {
  if (!c) return false;
  if (c.exclude_from_catchphrase_board === true) return false;
  if (c.is_catchphrase === false) return false;
  return true;
}

function boardClusters() {
  return sortedClusters().filter(isCatchphraseForBoard);
}

function floorControlClusters() {
  return sortedClusters().filter(function (c) {
    return c.category === "floor_control" || c.board_role === "filler_floor_control";
  });
}

function mainBoardClusters() {
  if (activeFilter === "floor_control") return floorControlClusters();
  return boardClusters();
}

function refreshBoard() {
  renderBoard(mainBoardClusters());
  renderFloorSection();
}

function jumpToCluster(clusterId) {
  if (!clusterId || !DATA) return;
  const target = (DATA.clusters || []).find(function (c) {
    return c.cluster_id === clusterId;
  });
  if (!target) return;
  const isFloor = target.category === "floor_control" || target.board_role === "filler_floor_control";
  switchTab(isFloor ? "floor" : "catchphrases", false);
  if (isFloor && activeFilter !== "all" && activeFilter !== "floor_control") {
    activeFilter = "all";
  } else if (!isFloor && activeFilter !== "all" && activeFilter !== target.category) {
    activeFilter = "all";
  }
  searchQuery = "";
  const searchInput = document.getElementById("board-search");
  const clearBtn = document.getElementById("board-search-clear");
  if (searchInput) searchInput.value = "";
  if (clearBtn) clearBtn.hidden = true;
  showAll = true;
  expandedId = clusterId;
  renderFilters();
  refreshBoard();
  setTimeout(function () {
    const card = document.querySelector('.quote-card[data-id="' + clusterId + '"]');
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 60);
}

function renderTicker(clusters) {
  const inner = document.getElementById("ticker-inner");
  if (!inner) return;
  const items = clusters.map(function (c) {
    const label = boardLabel(c).toUpperCase();
    const hits = c.hit_count_ptl || 0;
    return (
      '<button type="button" class="ticker-item" data-jump-id="' +
      escapeAttr(c.cluster_id) +
      '">' +
      escapeHtml(label) +
      ' <span class="mul">' +
      hits +
      "×</span></button>"
    );
  });
  inner.innerHTML = items.concat(items).join('<span class="studio-sep">·</span>');
  inner.querySelectorAll(".ticker-item").forEach(function (btn) {
    btn.addEventListener("click", function () {
      jumpToCluster(btn.getAttribute("data-jump-id"));
    });
  });
}

function renderHeroStats() {
  const strip = document.getElementById("hero-stat-strip");
  if (!strip || !DATA) return;
  const corpus = DATA.corpus || {};
  const stats = [
    ["Debates Indexed", corpus.included_debates || 364],
    ["Catchphrase Hits", (corpus.hits_extracted || 5205).toLocaleString()],
    ["PTL Words", (corpus.ptl_words || 3068864).toLocaleString()],
    ["Polite-Dodge Windows", (DATA.polite_dodge_windows || []).length || 164],
    ["Andrew Wilson Debates", (DATA.wilson_debates || []).length || 14],
  ];
  strip.innerHTML = stats
    .map(function (s) {
      return (
        '<span class="hero-stat-pill"><strong>' +
        escapeHtml(String(s[1])) +
        "</strong> " +
        escapeHtml(s[0]) +
        "</span>"
      );
    })
    .join("");

  // Update tab and top nav badges
  const bPhrases = document.getElementById("tab-badge-catchphrases");
  const bSoundboard = document.getElementById("tab-badge-soundboard");
  const bDodge = document.getElementById("tab-badge-dodge");
  const bDebates = document.getElementById("tab-badge-debates");
  const bClips = document.getElementById("tab-badge-clips");
  const bX = document.getElementById("tab-badge-x");

  const subPhrases = document.getElementById("sub-badge-phrases");
  const subFloor = document.getElementById("sub-badge-floor");
  const subWilson = document.getElementById("sub-badge-wilson");
  const subFeuds = document.getElementById("sub-badge-feuds");

  const phrasesCount = boardClusters().length;
  const floorCount = floorControlClusters().length;
  const dodgeCount = (DATA.polite_dodge_windows || []).length || 178;
  const wilsonCount = (DATA.wilson_debates || []).length || 20;
  const feudsCount = 12;
  const clipsCount = CLIPS.length || 9;
  const xCount = 25;

  if (bPhrases) bPhrases.textContent = String(phrasesCount + floorCount);
  if (subPhrases) subPhrases.textContent = String(phrasesCount);
  if (subFloor) subFloor.textContent = String(floorCount);
  if (bSoundboard) bSoundboard.textContent = "14";
  if (bDodge) bDodge.textContent = String(dodgeCount);
  if (bDebates) bDebates.textContent = String(wilsonCount + feudsCount);
  if (subWilson) subWilson.textContent = String(wilsonCount);
  if (subFeuds) subFeuds.textContent = String(feudsCount);
  if (bClips) bClips.textContent = String(clipsCount);
  if (bX) bX.textContent = String(xCount);

  const navD = document.getElementById("nav-dodge-count");
  const navDebates = document.getElementById("nav-debates-count");
  const navX = document.getElementById("nav-x-count");
  const navC = document.getElementById("nav-clips-count");
  if (navD) navD.textContent = String(dodgeCount);
  if (navDebates) navDebates.textContent = String(wilsonCount + feudsCount);
  if (navX) navX.textContent = String(xCount);
  if (navC) navC.textContent = String(clipsCount);
}

function renderSoundboard(clusters) {
  const grid = document.getElementById("soundboard-grid");
  if (!grid) return;
  const pads = [];
  clusters.forEach(function (c) {
    const aud = getPhraseAudio(c.cluster_id);
    if (!aud) return;
    pads.push({
      key: c.cluster_id,
      title: boardLabel(c),
      meta: (c.hit_count_ptl || 0) + " hits · " + Math.round(aud.durationSec || 6) + "s",
      isSfx: false,
    });
  });
  SOUNDBOARD_EXTRAS.forEach(function (sfx) {
    pads.push({
      key: sfx.id,
      title: sfx.title,
      meta: (sfx.subtitle || "Meltdown cut") + " · " + Math.round(sfx.durationSec || 7) + "s",
      isSfx: true,
    });
  });

  grid.innerHTML = pads
    .map(function (p) {
      return (
        '<button type="button" class="sb-pad' +
        (p.isSfx ? " sb-pad-sfx" : "") +
        '" data-audio-key="' +
        escapeAttr(p.key) +
        '" aria-pressed="false">' +
        '<span class="sb-pad-icon">▶</span>' +
        '<span class="sb-pad-text">' +
        '<span class="sb-pad-title">' +
        escapeHtml(p.title) +
        "</span>" +
        '<span class="sb-pad-meta">' +
        escapeHtml(p.meta) +
        "</span>" +
        "</span></button>"
      );
    })
    .join("");

  grid.querySelectorAll(".sb-pad").forEach(function (pad) {
    pad.addEventListener("click", function () {
      var key = pad.getAttribute("data-audio-key");
      if (key) playAudioByKey(key, false);
    });
  });

  const reelBtn = document.getElementById("play-reel-btn");
  if (reelBtn && !reelBtn._bound) {
    reelBtn._bound = true;
    reelBtn.addEventListener("click", startMashupReel);
  }
  const stopBtn = document.getElementById("stop-audio-btn");
  if (stopBtn && !stopBtn._bound) {
    stopBtn._bound = true;
    stopBtn.addEventListener("click", stopPhraseAudio);
  }
  syncPhraseAudioButtons();
}

function clusterTrumpWeight(c) {
  const bucket = c.topic_bucket || "";
  if (TDS_BUCKETS.has(bucket)) return 1;

  const about = Array.isArray(c.about) ? c.about.join(" ") : "";
  const blob = (
    (c.display_title || "") +
    " " +
    (c.canonical_label || "") +
    " " +
    (c.tactic || "") +
    " " +
    about +
    " " +
    bucket
  ).toLowerCase();
  const hasKey = TDS_ABOUT_KEYS.some(function (k) {
    return blob.indexOf(k) !== -1;
  });
  if (!hasKey) return 0;

  if (TDS_TACTIC_BUCKETS.has(bucket)) return 0.65;
  if (
    ["polite_dodge", "obfuscation", "dodge", "fake_smart", "strawman"].indexOf(
      c.category
    ) !== -1
  ) {
    return 0.65;
  }
  return 0;
}

function computeTds(clusters) {
  let hTds = 0;
  let hAll = 0;
  let vTds = 0;
  let vAll = 0;
  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    const h = Number(c.hit_count_ptl) || 0;
    const v = Number(c.videos_hit_ptl) || 0;
    const w = clusterTrumpWeight(c);
    hAll += h;
    vAll += v;
    hTds += h * w;
    vTds += v * w;
  }
  const hitShare = hTds / Math.max(hAll, 1);
  const videoShare = vTds / Math.max(vAll, 1);
  const raw = 100 * (0.7 * hitShare + 0.3 * videoShare);
  const eased = 100 * (1 - Math.pow(1 - Math.min(raw / 100, 1), 1.15));
  const score = Math.max(0, Math.min(96, Math.round(eased)));
  return {
    score: score,
    hitShare: hitShare,
    videoShare: videoShare,
    hTds: Math.round(hTds),
    hAll: hAll,
    vTds: Math.round(vTds),
    vAll: vAll,
  };
}

function renderTds(clusters) {
  const t = computeTds(clusters);
  const fill = document.getElementById("tds-fill");
  const needle = document.getElementById("tds-needle");
  const scoreEl = document.getElementById("tds-score");
  const gauge = document.getElementById("tds-gauge");
  const blurb = document.getElementById("tds-blurb");

  requestAnimationFrame(function () {
    if (fill) {
      fill.style.width = "100%";
      fill.style.height = t.score + "%";
    }
    if (needle) {
      needle.style.left = "";
      needle.style.bottom = "calc(" + t.score + "% - 1px)";
    }
    if (scoreEl) scoreEl.textContent = t.score + "%";
    if (gauge) gauge.setAttribute("aria-valuenow", String(t.score));
  });

  const pctHits = (t.hitShare * 100).toFixed(1);
  let band = "NORMAL";
  if (t.score >= 80) band = "CRITICAL";
  else if (t.score >= 60) band = "HIGH";
  else if (t.score >= 40) band = "MODERATE";
  else if (t.score >= 20) band = "ELEVATED";

  if (blurb) {
    blurb.textContent = band;
    blurb.title =
      "Score " +
      t.score +
      "/100 (" +
      band +
      "). " +
      pctHits +
      "% of Pushing The Limits phrase hits (" +
      t.hTds.toLocaleString() +
      " of " +
      t.hAll.toLocaleString() +
      " weighted) are Trump topics or Trump-related debate tactics. Across debates: " +
      (t.videoShare * 100).toFixed(1) +
      "%.";
  }
}

function renderTdsBreakdown(clusters) {
  const panel = document.getElementById("tds-breakdown");
  const grid = document.getElementById("tds-breakdown-grid");
  const side = document.getElementById("tds-side");
  const closeBtn = document.getElementById("tds-breakdown-close");
  if (!panel || !grid) return;

  const bucketMap = {};
  let totalBoardHits = 0;
  clusters.forEach(function (c) {
    if (c.exclude_from_catchphrase_board) return;
    const b = c.topic_bucket || "other";
    const h = Number(c.hit_count_ptl) || 0;
    const v = Number(c.videos_hit_ptl) || 0;
    totalBoardHits += h;
    if (!bucketMap[b]) {
      bucketMap[b] = { bucket: b, hits: 0, videos: 0, clusters: 0 };
    }
    bucketMap[b].hits += h;
    bucketMap[b].videos = Math.max(bucketMap[b].videos, v);
    bucketMap[b].clusters += 1;
  });

  const rows = Object.values(bucketMap).sort(function (a, b) {
    return b.hits - a.hits;
  });
  const maxHits = rows.length ? rows[0].hits : 1;

  grid.innerHTML = rows
    .map(function (r) {
      const pct = ((r.hits / Math.max(totalBoardHits, 1)) * 100).toFixed(1);
      const barW = Math.max(6, Math.round((r.hits / maxHits) * 100));
      const label = BUCKET_LABELS[r.bucket] || r.bucket.replace(/_/g, " ");
      return (
        '<div class="tds-bucket-card">' +
        '<div class="tds-bucket-top"><span>' +
        escapeHtml(label) +
        "</span><span>" +
        r.hits +
        " hits (" +
        pct +
        "%)</span></div>" +
        '<div class="tds-bucket-bar"><div style="width:' +
        barW +
        '%"></div></div>' +
        '<div class="tds-bucket-meta">Peak ' +
        r.videos +
        " debates · " +
        r.clusters +
        " phrase group" +
        (r.clusters === 1 ? "" : "s") +
        "</div></div>"
      );
    })
    .join("");

  function toggleBreakdown() {
    const nextHidden = !panel.hidden;
    panel.hidden = nextHidden;
    if (side) side.setAttribute("aria-expanded", nextHidden ? "false" : "true");
  }

  if (side && !side._bound) {
    side._bound = true;
    side.addEventListener("click", toggleBreakdown);
    side.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleBreakdown();
      }
    });
  }
  if (closeBtn && !closeBtn._bound) {
    closeBtn._bound = true;
    closeBtn.addEventListener("click", function () {
      panel.hidden = true;
      if (side) side.setAttribute("aria-expanded", "false");
    });
  }
}

function renderCorpusPills() {
  const corpus = DATA.corpus || {};
  const pills = [
    ["Debates included", corpus.included_debates],
    ["Pushing The Limits videos", corpus.ptl_videos],
    ["Kewl Vic Live videos", corpus.kewl_vic_live_videos],
    [
      "Phrase clusters",
      corpus.clusters_kept != null
        ? corpus.clusters_kept
        : (DATA.clusters || []).length,
    ],
    ["Phrase hits", corpus.hits_extracted],
    ["Polite-dodge windows", (DATA.polite_dodge_windows || []).length || corpus.polite_dodge_windows],
    ["Andrew Wilson debates", (DATA.wilson_debates || []).length || corpus.wilson_debates],
  ];
  const el = document.getElementById("corpus-pills");
  if (!el) return;
  el.innerHTML = pills
    .filter(function (p) {
      return p[1] != null;
    })
    .map(function (p) {
      return (
        '<span class="corpus-pill">' +
        escapeHtml(p[0]) +
        " <strong>" +
        escapeHtml(String(p[1])) +
        "</strong></span>"
      );
    })
    .join("");
}

function getCategoryCount(cat) {
  if (!DATA || !Array.isArray(DATA.clusters)) return 0;
  if (cat === "all") return boardClusters().length;
  if (cat === "floor_control") return floorControlClusters().length;
  return boardClusters().filter(function (c) {
    return c.category === cat;
  }).length;
}

function renderFilters() {
  const el = document.getElementById("filters");
  if (!el) return;
  el.innerHTML = CATEGORIES.map(function (cat) {
    const active = cat === activeFilter ? " active" : "";
    const count = getCategoryCount(cat);
    return (
      '<button type="button" class="filter-chip cat-filter-' +
      cat +
      active +
      '" data-cat="' +
      cat +
      '">' +
      escapeHtml(CAT_LABELS[cat] || cat) +
      ' <span class="filter-chip-count">(' +
      count +
      ")</span></button>"
    );
  }).join("");
  el.querySelectorAll(".filter-chip").forEach(function (btn) {
    btn.addEventListener("click", function () {
      activeFilter = btn.dataset.cat;
      expandedId = null;
      showAll = false;
      renderFilters();
      refreshBoard();
    });
  });
}

function bindBoardControls() {
  const searchInput = document.getElementById("board-search");
  const clearBtn = document.getElementById("board-search-clear");
  const sortSelect = document.getElementById("board-sort");

  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    searchInput.addEventListener("input", function () {
      searchQuery = String(searchInput.value || "").trim().toLowerCase();
      if (clearBtn) clearBtn.hidden = !searchQuery;
      refreshBoard();
    });
  }
  if (clearBtn && !clearBtn._bound) {
    clearBtn._bound = true;
    clearBtn.addEventListener("click", function () {
      searchQuery = "";
      if (searchInput) searchInput.value = "";
      clearBtn.hidden = true;
      refreshBoard();
    });
  }
  if (sortSelect && !sortSelect._bound) {
    sortSelect._bound = true;
    sortSelect.addEventListener("change", function () {
      sortMode = sortSelect.value || "ptl_hits";
      refreshBoard();
    });
  }
}

function bindShowMore() {
  const btn = document.getElementById("show-more-btn");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", function () {
    showAll = !showAll;
    refreshBoard();
  });
}

function matchesSearch(c, q) {
  if (!q) return true;
  const hay = [
    boardLabel(c),
    c.canonical_label,
    c.display_title,
    c.tactic,
    c.topic_bucket,
    Array.isArray(c.about) ? c.about.join(" ") : "",
    Array.isArray(c.member_lines)
      ? c.member_lines.map(function (m) { return m.text || ""; }).join(" ")
      : "",
    Array.isArray(c.examples)
      ? c.examples.map(function (ex) { return (ex.quote || "") + " " + (ex.title || ""); }).join(" ")
      : "",
  ]
    .join(" ")
    .toLowerCase();
  return hay.indexOf(q) !== -1;
}

function filteredRows(clusters) {
  let rows = clusters;
  if (activeFilter !== "all" && activeFilter !== "floor_control") {
    rows = rows.filter(function (c) {
      return c.category === activeFilter;
    });
  }
  if (searchQuery) {
    rows = rows.filter(function (c) {
      return matchesSearch(c, searchQuery);
    });
  }
  return rows;
}

function renderQuoteCards(container, rows, rankSource, opts) {
  opts = opts || {};
  const compactMode = !!opts.compact;
  const rankMap = new Map();
  rankSource.forEach(function (c, i) {
    rankMap.set(c.cluster_id, i + 1);
  });

  const html = [];
  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    const rank = rankMap.get(c.cluster_id) || i + 1;
    const id = c.cluster_id;
    const isOpen = expandedId === id;
    const compact = compactMode || (!!opts.markCompactFrom && i >= opts.markCompactFrom);
    const kewlHits = Number(c.hit_count_kewl_vic_live) || 0;
    const wilsonHits = Number(c.wilson_videos_hit) || 0;
    const hitsCount = c.hit_count_ptl != null ? c.hit_count_ptl : 0;
    const debatesCount = c.videos_hit_ptl != null ? c.videos_hit_ptl : 0;

    html.push(
      '<article class="quote-card' +
        (isOpen ? " is-open" : "") +
        (compact ? " quote-card-compact" : "") +
        (opts.floor ? " quote-card-floor" : "") +
        '" data-id="' +
        escapeAttr(id) +
        '">' +
        '<div class="quote-card-header">' +
        '<div class="quote-tags">' +
        '<span class="quote-rank-badge">' +
        (opts.floor ? "FC" : "#" + rank) +
        "</span>" +
        '<span class="cat-pill cat-' +
        escapeAttr(c.category || "dodge") +
        '">' +
        escapeHtml(prettyCat(c.category)) +
        "</span>" +
        "</div>" +
        '<div class="quote-audio-col">' +
        phraseAudioButtonHtml(id) +
        "</div>" +
        "</div>" +
        '<div class="quote-trigger" role="button" tabindex="0" aria-expanded="' +
        isOpen +
        '" id="trigger-' +
        escapeAttr(id) +
        '" aria-controls="drawer-' +
        escapeAttr(id) +
        '">' +
        '<h3 class="quote-title">' +
        escapeHtml(quotedTitle(c)) +
        "</h3>" +
        '<div class="quote-meta-row">' +
        '<span class="quote-hits"><strong>' +
        hitsCount.toLocaleString() +
        " hits</strong> across " +
        debatesCount +
        " debates</span>" +
        (wilsonHits > 0
          ? '<span class="quote-source-badge">' + wilsonHits + " vs Wilson</span>"
          : "") +
        (kewlHits > 0
          ? '<span class="quote-source-badge">+' + kewlHits + " Kewl</span>"
          : "") +
        '<span class="quote-expand-hint">' +
        (isOpen ? "Hide Proof ▴" : "View Proof ▾") +
        "</span>" +
        "</div>" +
        "</div>" +
        '<div class="quote-drawer" id="drawer-' +
        escapeAttr(id) +
        '" role="region" aria-labelledby="trigger-' +
        escapeAttr(id) +
        '">' +
        renderDrawer(c) +
        "</div>" +
        "</article>"
    );
  }
  container.innerHTML = html.join("");

  function toggleQuoteCard(trigger) {
    const card = trigger.closest(".quote-card");
    const id = card && card.dataset.id;
    if (!id) return;
    expandedId = expandedId === id ? null : id;
    refreshBoard();
    const open =
      document.querySelector(".quote-card.is-open") ||
      document.querySelector("#floor-board .quote-card.is-open");
    if (open) open.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  container.querySelectorAll(".quote-trigger").forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      if (ev.target.closest(".phrase-audio-btn")) return;
      toggleQuoteCard(btn);
    });
    btn.addEventListener("keydown", function (e) {
      if (e.target.closest(".phrase-audio-btn")) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleQuoteCard(btn);
      }
    });
  });

  container.querySelectorAll(".phrase-audio-btn").forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var id = btn.getAttribute("data-cluster-id");
      if (id) playPhraseAudio(id);
    });
  });

  container.querySelectorAll(".more-quotes-btn").forEach(function (btn) {
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var cid = btn.getAttribute("data-cluster-id");
      if (!cid) return;
      expandedQuotesMap[cid] = !expandedQuotesMap[cid];
      refreshBoard();
    });
  });

  syncPhraseAudioButtons();
}

function renderFloorSection() {
  const floorBoard = document.getElementById("floor-board");
  if (!floorBoard) return;

  const floors = floorControlClusters();
  if (!floors.length) {
    floorBoard.innerHTML = '<p class="board-empty">No floor control tics indexed.</p>';
    return;
  }

  renderQuoteCards(floorBoard, floors, floors, { floor: true, compact: false });
  syncPhraseAudioButtons();
}

function renderBoard(clusters) {
  const board = document.getElementById("quote-board");
  const moreWrap = document.getElementById("board-more-wrap");
  const moreBtn = document.getElementById("show-more-btn");
  const rows = filteredRows(clusters);

  if (!rows.length) {
    board.innerHTML =
      '<p class="board-empty">No catchphrases match this filter or search query.</p>';
    if (moreWrap) moreWrap.hidden = true;
    return;
  }

  const isFloorFilter = activeFilter === "floor_control";
  const showAllEffective = showAll || isFloorFilter || !!searchQuery;
  const visible = showAllEffective ? rows : rows.slice(0, TOP_N);
  const leftover = showAllEffective ? 0 : Math.max(0, rows.length - TOP_N);

  renderQuoteCards(board, visible, clusters, {
    floor: isFloorFilter,
    markCompactFrom: isFloorFilter ? null : TOP_N,
  });

  if (moreWrap && moreBtn) {
    if (rows.length > TOP_N && !isFloorFilter && !searchQuery) {
      moreWrap.hidden = false;
      moreBtn.textContent = showAll
        ? "Show top " + TOP_N + " only"
        : "Show all " + rows.length + " catchphrases (+" + leftover + " more)";
    } else {
      moreWrap.hidden = true;
    }
  }
}

function formatSecTimestamp(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m + ":" + (rem < 10 ? "0" : "") + rem;
}

function renderDrawer(c) {
  const examples = Array.isArray(c.examples) ? c.examples : [];
  const about = Array.isArray(c.about) ? c.about : [];
  const parts = [];

  var audioItem = getPhraseAudio(c.cluster_id);
  var audioBtn = phraseAudioButtonHtml(c.cluster_id);
  if (audioBtn && audioItem) {
    var hitsHtml = "";
    if (Array.isArray(audioItem.hits) && audioItem.hits.length) {
      hitsHtml =
        '<div class="mashup-sources">' +
        audioItem.hits
          .map(function (h, idx) {
            var vid = h.sourceVideoId;
            var start = Math.floor(Number(h.sourceStartSec) || 0);
            var ytUrl = vid
              ? "https://www.youtube.com/watch?v=" +
                encodeURIComponent(vid) +
                "&t=" +
                start +
                "s"
              : "#";
            var label =
              "Hit #" +
              (idx + 1) +
              " (" +
              formatSecTimestamp(start) +
              ")" +
              (h.note ? " · " + h.note.replace(/^seed:\s*/i, "") : "");
            return (
              '<a class="mashup-chip" href="' +
              escapeAttr(ytUrl) +
              '" target="_blank" rel="noopener noreferrer">' +
              escapeHtml(label) +
              " ↗</a>"
            );
          })
          .join("") +
        "</div>";
    }
    parts.push(
      '<div class="drawer-audio-row">' +
        audioBtn +
        '<span class="drawer-audio-label">Hear the mashup (' +
        Math.round(audioItem.durationSec || 6) +
        "s)</span>" +
        hitsHtml +
        "</div>"
    );
  }

  const metaBits = [];
  if (c.videos_hit_ptl != null) {
    metaBits.push(
      "Appears in " + c.videos_hit_ptl + " PTL debate" + (c.videos_hit_ptl === 1 ? "" : "s")
    );
  }
  if (c.rate_per_1k_ptl != null) {
    metaBits.push(
      Number(c.rate_per_1k_ptl).toFixed(3) + " per 1,000 PTL words"
    );
  }
  if (c.hit_count_kewl_vic_live) {
    metaBits.push(c.hit_count_kewl_vic_live + " Kewl Vic Live hits");
  }
  if (c.wilson_videos_hit) {
    metaBits.push(c.wilson_videos_hit + " Andrew Wilson debates");
  }
  if (c.merged_count && c.merged_count > 1) {
    metaBits.push("Merged from " + c.merged_count + " caption clusters");
  }

  if (metaBits.length) {
    parts.push(
      '<p class="drawer-stats">' + escapeHtml(metaBits.join(" · ")) + "</p>"
    );
  }

  if (c.tactic) {
    const keyBit = c.key_phrase || c.canonical_label;
    parts.push(
      '<div class="expand-tactic">Tactic: ' +
        escapeHtml(c.tactic) +
        (keyBit ? " · Canonical phrase: " + escapeHtml(keyBit) : "") +
        "</div>"
    );
  }

  if (about.length) {
    parts.push(
      '<div class="about-tags">' +
        about
          .map(function (t) {
            return '<span class="about-tag">' + escapeHtml(t) + "</span>";
          })
          .join("") +
        "</div>"
    );
  }

  const memberLines = Array.isArray(c.member_lines) ? c.member_lines : [];
  if (memberLines.length) {
    parts.push(
      '<div class="drawer-members">' +
        "<strong>Associated lines &amp; spoken variants (" +
        memberLines.length +
        ")</strong>" +
        '<ul class="member-line-list">' +
        memberLines
          .map(function (m) {
            const text = (m && (m.text || m.span || m.phrase)) || "";
            const n =
              m && (m.hit_count_ptl != null ? m.hit_count_ptl : m.count != null ? m.count : null);
            const countBit =
              n != null
                ? ' <span class="member-count">' +
                  escapeHtml(String(n)) +
                  "</span>"
                : "";
            return (
              '<li><span class="member-text">' +
              escapeHtml(text) +
              "</span>" +
              countBit +
              "</li>"
            );
          })
          .join("") +
        "</ul></div>"
    );
  }

  if (!examples.length) {
    parts.push(
      '<p class="expand-empty">No example quotes stored for this cluster.</p>'
    );
    return '<div class="expand-panel">' + parts.join("") + "</div>";
  }

  const sampleTitles = [];
  const seenTitles = {};
  examples.forEach(function (ex) {
    const t = ex.title || "";
    if (t && !seenTitles[t]) {
      seenTitles[t] = true;
      sampleTitles.push(t);
    }
  });
  if (sampleTitles.length) {
    parts.push(
      '<div class="drawer-samples">' +
        "<strong>Debates sampled (" +
        sampleTitles.length +
        ")</strong>" +
        "<ul>" +
        sampleTitles
          .slice(0, 6)
          .map(function (t) {
            return "<li>" + escapeHtml(t) + "</li>";
          })
          .join("") +
        "</ul></div>"
    );
  }

  const showAllEx = !!expandedQuotesMap[c.cluster_id];
  const visibleEx = showAllEx ? examples : examples.slice(0, 4);

  parts.push(
    '<strong class="drawer-quotes-head">Timestamped transcript quotes (' +
      visibleEx.length +
      " of " +
      examples.length +
      ")</strong>"
  );

  const quotes = visibleEx.map(function (ex) {
    const quote = ex.quote || ex.span || "(no quote)";
    const span = ex.span || c.key_phrase || "";
    const title = ex.title || "";
    const url =
      ex.url ||
      (ex.video_id ? "https://www.youtube.com/watch?v=" + ex.video_id : "");
    const ts = ex.timestamp || "";
    return (
      '<blockquote class="expand-quote">“' +
      highlightSpanHtml(quote, span) +
      "”</blockquote>" +
      '<div class="expand-meta">' +
      escapeHtml(title) +
      (ts ? " · @" + escapeHtml(ts) : "") +
      (url
        ? ' · <a href="' +
          escapeAttr(url) +
          '" target="_blank" rel="noopener noreferrer">Watch on YouTube ↗</a>'
        : "") +
      "</div>"
    );
  });
  parts.push(quotes.join(""));

  if (examples.length > 4) {
    parts.push(
      '<button type="button" class="more-quotes-btn" data-cluster-id="' +
        escapeAttr(c.cluster_id) +
        '">' +
        (showAllEx
          ? "Show fewer quotes"
          : "Show all " + examples.length + " transcript quotes (+" + (examples.length - 4) + " more)") +
        "</button>"
    );
  }

  return '<div class="expand-panel">' + parts.join("") + "</div>";
}

/* ===== POLITE DODGE LAB (164 WINDOWS) ===== */
function renderDodgeLab() {
  const grid = document.getElementById("dodge-grid");
  const tabsWrap = document.getElementById("dodge-tabs");
  const searchInput = document.getElementById("dodge-search");
  const moreWrap = document.getElementById("dodge-more-wrap");
  const moreBtn = document.getElementById("dodge-more-btn");
  if (!grid || !DATA) return;

  const allWindows = Array.isArray(DATA.polite_dodge_windows)
    ? DATA.polite_dodge_windows
    : [];

  const pivotCount = allWindows.filter(function (w) {
    return w.evidence_type === "pivot_marker";
  }).length;
  const abandonCount = allWindows.length - pivotCount;

  const elAll = document.getElementById("dodge-count-all");
  const elPivot = document.getElementById("dodge-count-pivot");
  const elAbandon = document.getElementById("dodge-count-abandon");
  const navDodge = document.getElementById("nav-dodge-count");
  if (elAll) elAll.textContent = String(allWindows.length);
  if (elPivot) elPivot.textContent = String(pivotCount);
  if (elAbandon) elAbandon.textContent = String(abandonCount);
  if (navDodge) navDodge.textContent = String(allWindows.length);

  if (tabsWrap && !tabsWrap._bound) {
    tabsWrap._bound = true;
    tabsWrap.querySelectorAll(".dodge-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        dodgeFilter = tab.getAttribute("data-dodge-filter") || "all";
        dodgeVisibleCount = DODGE_PAGE_SIZE;
        tabsWrap.querySelectorAll(".dodge-tab").forEach(function (t) {
          t.classList.toggle("active", t === tab);
        });
        renderDodgeLab();
      });
    });
  }

  if (searchInput && !searchInput._bound) {
    searchInput._bound = true;
    searchInput.addEventListener("input", function () {
      dodgeSearch = String(searchInput.value || "").trim().toLowerCase();
      dodgeVisibleCount = DODGE_PAGE_SIZE;
      renderDodgeLab();
    });
  }

  if (moreBtn && !moreBtn._bound) {
    moreBtn._bound = true;
    moreBtn.addEventListener("click", function () {
      dodgeVisibleCount += 12;
      renderDodgeLab();
    });
  }

  let filtered = allWindows.filter(function (w) {
    if (dodgeFilter !== "all" && w.evidence_type !== dodgeFilter) return false;
    if (dodgeSearch) {
      const blob = (
        (w.title || "") +
        " " +
        (w.opener_span || "") +
        " " +
        (w.pivot_span || "") +
        " " +
        (w.pivot_marker || "")
      ).toLowerCase();
      if (blob.indexOf(dodgeSearch) === -1) return false;
    }
    return true;
  });

  if (!filtered.length) {
    grid.innerHTML =
      '<p class="board-empty">No polite-dodge windows match this filter.</p>';
    if (moreWrap) moreWrap.hidden = true;
    return;
  }

  const visible = filtered.slice(0, dodgeVisibleCount);
  grid.innerHTML = visible
    .map(function (w) {
      const isPivot = w.evidence_type === "pivot_marker";
      const badgeText = isPivot
        ? "Pivot: “" + (w.pivot_marker || "pivot") + "”"
        : "90s Topic Abandon";
      const openerQuote = cleanRollingStutter(w.opener_span || "");
      const pivotQuote = w.pivot_span
        ? highlightSpanHtml(w.pivot_span, w.pivot_marker)
        : "<em>Caller’s topic never returned to within 90-second window.</em>";

      return (
        '<article class="dodge-card">' +
        '<div class="dodge-card-top">' +
        '<div class="dodge-debate-title">' +
        escapeHtml(w.title || "Debate") +
        "</div>" +
        '<span class="dodge-badge' +
        (isPivot ? "" : " is-abandon") +
        '">' +
        escapeHtml(badgeText) +
        "</span></div>" +
        '<div class="dodge-steps">' +
        '<div class="dodge-step">' +
        '<span class="dodge-step-label">1. Polite Opener (@' +
        escapeHtml(w.opener_timestamp || "0:00") +
        ")</span>" +
        '<div class="dodge-step-quote">“' +
        escapeHtml(openerQuote) +
        "”</div></div>" +
        '<div class="dodge-step dodge-step-pivot">' +
        '<span class="dodge-step-label">2. ' +
        (isPivot ? "Immediate Pivot" : "Topic Abandon Check") +
        " (@" +
        escapeHtml(w.pivot_timestamp || "") +
        ")</span>" +
        '<div class="dodge-step-quote">' +
        (w.pivot_span ? "“" + pivotQuote + "”" : pivotQuote) +
        "</div></div></div>" +
        '<div class="dodge-card-foot">' +
        "<span>Window: " +
        escapeHtml(w.opener_timestamp || "0:00") +
        " → " +
        escapeHtml(w.pivot_timestamp || "") +
        "</span>" +
        (w.url_start
          ? '<a href="' +
            escapeAttr(w.url_start) +
            '" target="_blank" rel="noopener noreferrer">Watch @ ' +
            escapeHtml(w.opener_timestamp || "clip") +
            " ↗</a>"
          : "") +
        "</div></article>"
      );
    })
    .join("");

  if (moreWrap && moreBtn) {
    const remaining = filtered.length - visible.length;
    if (remaining > 0) {
      moreWrap.hidden = false;
      moreBtn.textContent =
        "Show more dodge windows (+" + remaining + " remaining)";
    } else {
      moreWrap.hidden = true;
    }
  }
}

/* ===== ANDREW WILSON FILES (14 DEBATES) ===== */
function renderWilsonSection() {
  const barsEl = document.getElementById("wilson-bars");
  const listEl = document.getElementById("wilson-debate-list");
  if (!barsEl || !listEl || !DATA) return;

  const wilsonClusters = Array.isArray(DATA.clusters_wilson_priority)
    ? DATA.clusters_wilson_priority
    : [];
  const wilsonDebates = Array.isArray(DATA.wilson_debates)
    ? DATA.wilson_debates
    : [];

  const clusterLookup = {};
  (DATA.clusters || []).forEach(function (c) {
    clusterLookup[c.cluster_id] = c;
  });

  const maxVids = wilsonClusters.reduce(function (m, x) {
    return Math.max(m, Number(x.wilson_videos_hit) || 0);
  }, 1);

  barsEl.innerHTML = wilsonClusters
    .map(function (w) {
      const full = clusterLookup[w.cluster_id];
      const label = full ? boardLabel(full) : w.canonical_label || w.cluster_id;
      const vids = Number(w.wilson_videos_hit) || 0;
      const totalHits = Number(w.hit_count_ptl) || 0;
      const pct = Math.max(8, Math.round((vids / maxVids) * 100));
      return (
        '<button type="button" class="wilson-bar-row" data-jump-id="' +
        escapeAttr(w.cluster_id) +
        '">' +
        '<div class="wilson-bar-top">' +
        "<span>“" +
        escapeHtml(label) +
        "”</span>" +
        '<span class="wilson-bar-stats">' +
        vids +
        "/" +
        wilsonDebates.length +
        " Wilson debates · " +
        totalHits +
        " PTL hits</span></div>" +
        '<div class="wilson-bar-track"><div class="wilson-bar-fill" style="width:' +
        pct +
        '%"></div></div></button>'
      );
    })
    .join("");

  barsEl.querySelectorAll(".wilson-bar-row").forEach(function (btn) {
    btn.addEventListener("click", function () {
      jumpToCluster(btn.getAttribute("data-jump-id"));
    });
  });

  listEl.innerHTML = wilsonDebates
    .map(function (d, idx) {
      return (
        "<li>" +
        '<a href="' +
        escapeAttr(d.url || "#") +
        '" target="_blank" rel="noopener noreferrer">' +
        "<span><strong>#" +
        (idx + 1) +
        "</strong> " +
        escapeHtml(d.title || d.id) +
        "</span>" +
        '<span class="yt-tag">YouTube ↗</span>' +
        "</a></li>"
      );
    })
    .join("");

  const n = wilsonDebates.length;
  const navW = document.getElementById("nav-wilson-count");
  const kick = document.getElementById("wilson-kicker");
  const lt = document.getElementById("wilson-list-title");
  if (navW) navW.textContent = String(n);
  if (kick) kick.textContent = "HEAD-TO-HEAD SUB-CORPUS · " + n + " DEBATES";
  if (lt) lt.textContent = "All " + n + " Indexed Wilson Debates";
}

/* ===== FEUDS + X RECEIPTS ===== */
async function renderFeudsAndX() {
  const [feuds, xc] = await Promise.all([
    fetch("./data/feuds.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    fetch("./data/x_corpus.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
  ]);

  const fg = document.getElementById("feuds-grid");
  if (fg && feuds && Array.isArray(feuds.feuds)) {
    const navF = document.getElementById("nav-feuds-count");
    if (navF) navF.textContent = String(feuds.feuds.length);
    fg.innerHTML = feuds.feuds
      .map(function (f) {
        return (
          '<article class="feud-card"><header><h3>vs. ' +
          escapeHtml(f.opponent) +
          '</h3><span class="feud-count">' +
          f.videos.length +
          (f.videos.length === 1 ? " clash" : " clashes") +
          "</span></header><ul>" +
          f.videos
            .map(function (v) {
              return (
                '<li><a href="https://www.youtube.com/watch?v=' +
                escapeAttr(v.id) +
                '" target="_blank" rel="noopener noreferrer" data-track="feud_click" data-track-id="' +
                escapeAttr(v.id) +
                '"><span>' +
                escapeHtml(v.title) +
                '</span><small>' +
                escapeHtml(v.channel) +
                " ↗</small></a></li>"
              );
            })
            .join("") +
          "</ul></article>"
        );
      })
      .join("");
  }

  const xg = document.getElementById("x-grid");
  if (!xg || !xc || !Array.isArray(xc.posts)) return;
  const navX = document.getElementById("nav-x-count");
  if (navX) navX.textContent = String(xc.posts.length);
  const filters = [
    ["all", "All"],
    ["insult", "Insults"],
    ["feud", "Feuds"],
    ["trump", "Trump"],
    ["sarcasm", "\u201cIt was sarcasm\u201d"],
  ];
  let active = "all";
  const fx = document.getElementById("x-filters");
  function draw() {
    const posts = xc.posts.filter(function (p) {
      if (active === "all") return true;
      if (active === "sarcasm") return p.tags.indexOf("sarcasm") !== -1 || p.tags.indexOf("i_never_said_that") !== -1;
      return p.tags.indexOf(active) !== -1;
    });
    xg.innerHTML = posts
      .map(function (p) {
        const url = "https://x.com/" + p.handle + "/status/" + p.id;
        const jump = p.cluster_id
          ? '<button type="button" class="x-jump" data-jump-id="' + escapeAttr(p.cluster_id) + '">See it on air →</button>'
          : "";
        return (
          '<blockquote class="x-card"><p>' +
          escapeHtml(p.text) +
          '</p><footer><a href="' +
          escapeAttr(url) +
          '" target="_blank" rel="noopener noreferrer" data-track="x_click" data-track-id="' +
          escapeAttr(p.id) +
          '">@' +
          escapeHtml(p.handle) +
          " ↗</a>" +
          jump +
          "</footer></blockquote>"
        );
      })
      .join("");
    xg.querySelectorAll(".x-jump").forEach(function (b) {
      b.addEventListener("click", function () {
        jumpToCluster(b.getAttribute("data-jump-id"));
      });
    });
  }
  if (fx) {
    fx.innerHTML = filters
      .map(function (f) {
        return '<button type="button" class="dodge-tab' + (f[0] === active ? " active" : "") + '" data-x="' + f[0] + '">' + escapeHtml(f[1]) + "</button>";
      })
      .join("");
    fx.addEventListener("click", function (e) {
      const b = e.target.closest("[data-x]");
      if (!b) return;
      active = b.getAttribute("data-x");
      fx.querySelectorAll("[data-x]").forEach(function (x) {
        x.classList.toggle("active", x === b);
      });
      track("x_filter", { filter: active });
      draw();
    });
  }
  draw();

  const about = document.getElementById("x-about");
  if (about && Array.isArray(xc.about_brian)) {
    about.innerHTML =
      "<h3>What others posted about him</h3>" +
      xc.about_brian
        .map(function (a) {
          return (
            '<blockquote class="x-card x-card-about"><p>' +
            escapeHtml(a.text) +
            '</p><footer><a href="' +
            escapeAttr(a.url) +
            '" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(a.source) +
            " ↗</a></footer></blockquote>"
          );
        })
        .join("");
  }
}

/* ===== FIRST-PARTY ANALYTICS =====
 * Sends small JSON beacons to the Worker at /api/event. No cookies, no third parties.
 * The visitor id lives in sessionStorage only, so it resets per tab session. */
const ANALYTICS_ENDPOINT =
  location.hostname.endsWith("lyingshapiro.com") || location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "/api/event"
    : "https://lyingshapiro.com/api/event";
const SESSION_ID = (function () {
  try {
    let s = sessionStorage.getItem("ls_sid");
    if (!s) {
      s = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("ls_sid", s);
    }
    return s;
  } catch (e) {
    return "nostorage";
  }
})();
const TRACK_QUEUE = [];
let trackTimer = null;

function track(type, props) {
  if (navigator.doNotTrack === "1") return;
  TRACK_QUEUE.push({
    type: String(type).slice(0, 40),
    props: props || {},
    path: location.pathname + location.hash,
    ts: Date.now(),
  });
  if (TRACK_QUEUE.length >= 10) flushTrack();
  else if (!trackTimer) trackTimer = setTimeout(flushTrack, 4000);
}

function flushTrack() {
  clearTimeout(trackTimer);
  trackTimer = null;
  if (!TRACK_QUEUE.length) return;
  const body = JSON.stringify({
    sid: SESSION_ID,
    ref: document.referrer || "",
    vw: window.innerWidth,
    events: TRACK_QUEUE.splice(0, TRACK_QUEUE.length),
  });
  try {
    if (navigator.sendBeacon && navigator.sendBeacon(ANALYTICS_ENDPOINT, new Blob([body], { type: "text/plain" }))) return;
  } catch (e) {}
  fetch(ANALYTICS_ENDPOINT, { method: "POST", body: body, keepalive: true, headers: { "content-type": "text/plain" } }).catch(function () {});
}

(function initAnalytics() {
  const t0 = Date.now();
  track("pageview", { title: document.title, utm: location.search.slice(0, 200) });

  // Generic click tracking: soundboard pads, filters, clips, outbound links, explicit data-track hooks.
  document.addEventListener(
    "click",
    function (e) {
      const el = e.target.closest("[data-track], button, a");
      if (!el) return;
      const explicit = el.getAttribute("data-track");
      const label = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 80);
      const id =
        el.getAttribute("data-track-id") ||
        el.getAttribute("data-jump-id") ||
        el.getAttribute("data-cluster-id") ||
        el.getAttribute("data-audio-key") ||
        el.getAttribute("data-clip-id") ||
        el.getAttribute("data-cat") ||
        el.getAttribute("data-id") ||
        (el.closest("[data-id]") && el.closest("[data-id]").getAttribute("data-id")) ||
        el.id ||
        "";
      let type = explicit;
      if (!type) {
        if (el.closest("#soundboard-grid")) type = "sound_play";
        else if (el.closest("#filters")) type = "filter";
        else if (el.closest(".clips-list")) type = "clip_select";
        else if (el.tagName === "A" && el.host && el.host !== location.host) type = "outbound";
        else if (el.closest(".studio-nav")) type = "nav";
        else type = "click";
      }
      track(type, { id: id, label: label, href: el.tagName === "A" ? el.href : undefined });
    },
    true
  );

  // Section visibility (which sections people actually scroll to).
  if ("IntersectionObserver" in window) {
    const seen = {};
    const io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && !seen[en.target.id]) {
            seen[en.target.id] = 1;
            track("section_view", { id: en.target.id });
          }
        });
      },
      { threshold: 0.35 }
    );
    ["soundboard-section", "floor-section", "dodge-section", "wilson-section", "feuds-section", "x-section", "clips-rail"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  // Debounced search terms.
  let st = null;
  document.addEventListener("input", function (e) {
    if (!e.target.matches || !e.target.matches("input[type=search]")) return;
    clearTimeout(st);
    const v = e.target.value.trim();
    st = setTimeout(function () {
      if (v.length >= 2) track("search", { box: e.target.id, q: v.slice(0, 60) });
    }, 1200);
  });

  // Media plays (audio + video).
  document.addEventListener(
    "play",
    function (e) {
      const m = e.target;
      if (!m || !m.currentSrc) return;
      track(m.tagName === "VIDEO" ? "video_play" : "audio_play", { src: m.currentSrc.split("/").pop().slice(0, 80) });
    },
    true
  );

  // Max scroll depth + time on page, sent when the tab is hidden.
  let maxDepth = 0;
  window.addEventListener(
    "scroll",
    function () {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0) maxDepth = Math.max(maxDepth, Math.round((window.scrollY / h) * 100));
    },
    { passive: true }
  );
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      track("engagement", { depth: maxDepth, secs: Math.round((Date.now() - t0) / 1000) });
      flushTrack();
    }
  });
  window.addEventListener("error", function (e) {
    track("js_error", { msg: String(e.message).slice(0, 160), src: String(e.filename || "").split("/").pop() });
  });
})();

function renderFooter() {
  const corpus = DATA.corpus || {};
  const subject = DATA.subject || "Brian Shapiro";
  const gen = DATA.generated_at ? DATA.generated_at.slice(0, 10) : "";
  const wilson = Array.isArray(DATA.wilson_debates)
    ? DATA.wilson_debates.length
    : 0;
  const polite = Array.isArray(DATA.polite_dodge_windows)
    ? DATA.polite_dodge_windows.length
    : corpus.polite_dodge_windows;

  const channelsEl = document.getElementById("footer-channels");
  if (channelsEl && Array.isArray(DATA.channels)) {
    channelsEl.innerHTML = DATA.channels
      .map(function (ch) {
        return (
          '<a class="footer-channel-link" href="' +
          escapeAttr(ch.url || "#") +
          '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(ch.name) +
          " (" +
          escapeHtml(ch.handle || "") +
          ") ↗</a>"
        );
      })
      .join("");
  }

  const parts = [
    "Subject: " + subject,
    corpus.included_debates != null
      ? corpus.included_debates + " debates included"
      : null,
    corpus.excluded_non_debate != null
      ? corpus.excluded_non_debate + " non-debate excluded"
      : null,
    corpus.ptl_words != null
      ? Number(corpus.ptl_words).toLocaleString() + " Pushing The Limits words"
      : null,
    corpus.kewl_words != null
      ? Number(corpus.kewl_words).toLocaleString() + " Kewl Vic Live words"
      : null,
    polite != null ? polite + " polite-dodge windows" : null,
    wilson ? wilson + " Andrew Wilson debates" : null,
    gen ? "corpus snapshot " + gen : null,
  ].filter(Boolean);
  document.getElementById("footer-stats").textContent = parts.join(" · ");
}

function prettyCat(cat) {
  if (!cat) return "-";
  if (CAT_LABELS[cat]) return CAT_LABELS[cat];
  return String(cat).replace(/_/g, " ");
}

function truncate(s, n) {
  const t = String(s || "");
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

/* ===== Watch Brian clips rail (Single active player — no double audio) ===== */
let CLIPS = [];
let activeClipId = null;

async function initClipsRail() {
  const rail = document.getElementById("clips-rail");
  const fab = document.getElementById("clips-fab");
  if (!rail || !fab) return;

  try {
    const res = await fetch("./data/clips.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    CLIPS = Array.isArray(data.clips) ? data.clips : [];
  } catch (err) {
    console.warn("clips.json unavailable", err);
    return;
  }

  rail.hidden = false;
  fab.hidden = false;
  fab.textContent = "▶ Watch Clips (" + CLIPS.length + ")";
  bindClipsChrome();
  renderClipsLists();
  if (CLIPS.length) {
    selectClip(CLIPS[0], { autoplay: false });
  } else {
    showClipsEmpty();
  }
}

function showClipsEmpty() {
  ["clips-list", "clips-drawer-list"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<li><p class="clips-empty">More clips coming.</p></li>';
  });
  ["clips-player-host", "clips-drawer-host"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  ["clips-now", "clips-drawer-now"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.textContent = "";
  });
}

function stepClip(delta) {
  if (!CLIPS.length) return;
  const idx = CLIPS.findIndex(function (c) {
    return c.id === activeClipId;
  });
  const nextIdx = (idx + delta + CLIPS.length) % CLIPS.length;
  selectClip(CLIPS[nextIdx], { autoplay: true });
}

function bindClipsChrome() {
  const fab = document.getElementById("clips-fab");
  const drawer = document.getElementById("clips-drawer");
  const closeBtn = document.getElementById("clips-drawer-close");
  const prevBtn = document.getElementById("clips-prev-btn");
  const nextBtn = document.getElementById("clips-next-btn");

  if (fab && !fab._bound) {
    fab._bound = true;
    fab.addEventListener("click", openClipsDrawer);
  }
  if (closeBtn && !closeBtn._bound) {
    closeBtn._bound = true;
    closeBtn.addEventListener("click", closeClipsDrawer);
  }
  if (prevBtn && !prevBtn._bound) {
    prevBtn._bound = true;
    prevBtn.addEventListener("click", function () {
      stepClip(-1);
    });
  }
  if (nextBtn && !nextBtn._bound) {
    nextBtn._bound = true;
    nextBtn.addEventListener("click", function () {
      stepClip(1);
    });
  }
  if (drawer && !drawer._bound) {
    drawer._bound = true;
    drawer.addEventListener("click", function (e) {
      if (e.target === drawer) closeClipsDrawer();
    });
  }
  if (!document._clipsEsc) {
    document._clipsEsc = true;
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeClipsDrawer();
    });
  }
}

function openClipsDrawer() {
  const drawer = document.getElementById("clips-drawer");
  const fab = document.getElementById("clips-fab");
  const desktopHost = document.getElementById("clips-player-host");
  if (!drawer) return;
  if (desktopHost) stopAllClipMedia(desktopHost);
  drawer.hidden = false;
  if (fab) fab.setAttribute("aria-expanded", "true");
  const current =
    CLIPS.find(function (c) {
      return c.id === activeClipId;
    }) || CLIPS[0];
  if (current) selectClip(current, { autoplay: false });
}

function closeClipsDrawer() {
  const drawer = document.getElementById("clips-drawer");
  const fab = document.getElementById("clips-fab");
  const host = document.getElementById("clips-drawer-host");
  if (drawer) drawer.hidden = true;
  if (fab) fab.setAttribute("aria-expanded", "false");
  if (host) {
    stopAllClipMedia(host);
    host.innerHTML = "";
  }
}

function renderClipsLists() {
  ["clips-list", "clips-drawer-list", "clips-tab-list"].forEach(function (id) {
    const ul = document.getElementById(id);
    if (!ul) return;
    ul.innerHTML = CLIPS.map(function (clip) {
      const poster = clip.poster
        ? '<img src="' + escapeAttr(clip.poster) + '" alt="" loading="lazy" />'
        : "<span></span>";
      return (
        '<li><button type="button" class="clips-list-btn" data-clip-id="' +
        escapeAttr(clip.id) +
        '">' +
        poster +
        "<span><strong>" +
        escapeHtml(clip.title || "Clip") +
        "</strong><em>" +
        escapeHtml(
          [clip.blurb, formatClipDuration(clip.durationSec)].filter(Boolean).join(" · ")
        ) +
        "</em></span></button></li>"
      );
    }).join("");
    ul.querySelectorAll(".clips-list-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const clip = CLIPS.find(function (c) {
          return c.id === btn.getAttribute("data-clip-id");
        });
        if (clip) selectClip(clip, { autoplay: true });
      });
    });
  });
}

function formatClipDuration(sec) {
  const n = Math.round(Number(sec) || 0);
  return n ? "~" + n + "s" : "";
}

/**
 * Only mount & play the <video> inside the currently active/visible host
 * so desktop, tab, and mobile drawer never double-play simultaneously.
 */
function selectClip(clip, opts) {
  opts = opts || {};
  activeClipId = clip.id;

  const idx = CLIPS.findIndex(function (c) {
    return c.id === clip.id;
  });
  const counterEl = document.getElementById("clips-counter");
  if (counterEl && idx !== -1) {
    counterEl.textContent = idx + 1 + "/" + CLIPS.length;
  }
  const counterTab = document.getElementById("clips-tab-counter");
  if (counterTab && idx !== -1) {
    counterTab.textContent = idx + 1 + "/" + CLIPS.length;
  }

  document.querySelectorAll(".clips-list-btn").forEach(function (btn) {
    btn.classList.toggle(
      "is-active",
      btn.getAttribute("data-clip-id") === clip.id
    );
  });

  const nowHtml =
    escapeHtml(clip.title || "Clip") +
    "<span>" +
    escapeHtml(
      [clip.blurb, formatClipDuration(clip.durationSec)].filter(Boolean).join(" · ")
    ) +
    "</span>";
  const now = document.getElementById("clips-now");
  const nowD = document.getElementById("clips-drawer-now");
  const nowTab = document.getElementById("clips-tab-now");
  if (now) now.innerHTML = nowHtml;
  if (nowD) nowD.innerHTML = nowHtml;
  if (nowTab) nowTab.innerHTML = nowHtml;

  const desktopHost = document.getElementById("clips-player-host");
  const drawerHost = document.getElementById("clips-drawer-host");
  const tabHost = document.getElementById("clips-tab-player-host");
  const drawer = document.getElementById("clips-drawer");
  const isDrawerOpen = drawer && !drawer.hidden;

  if (desktopHost) {
    stopAllClipMedia(desktopHost);
    desktopHost.innerHTML = "";
  }
  if (drawerHost) {
    stopAllClipMedia(drawerHost);
    drawerHost.innerHTML = "";
  }
  if (tabHost) {
    stopAllClipMedia(tabHost);
    tabHost.innerHTML = "";
  }

  let targetHost = desktopHost;
  if (activeTab === "clips" && tabHost) {
    targetHost = tabHost;
  } else if (isDrawerOpen && drawerHost) {
    targetHost = drawerHost;
  }
  if (!targetHost) return;

  if (opts.autoplay) {
    stopPhraseAudio();
  }

  const playerNode = buildPlayerNode(clip);
  targetHost.appendChild(playerNode);

  const video = targetHost.querySelector("video");
  if (video) {
    video.addEventListener("play", function () {
      stopPhraseAudio();
    });
    if (opts.autoplay) {
      const p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
  }
}

function buildPlayerNode(clip) {
  const host = document.createElement("div");
  host.className = "clips-player-inner";
  host.style.width = "100%";
  host.style.height = "100%";
  if (clip.youtubeId) {
    const iframe = document.createElement("iframe");
    iframe.src =
      "https://www.youtube-nocookie.com/embed/" +
      encodeURIComponent(clip.youtubeId) +
      "?rel=0&modestbranding=1";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.title = clip.title || "Watch Brian clip";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    host.appendChild(iframe);
  } else if (clip.src) {
    const video = document.createElement("video");
    video.controls = true;
    video.playsInline = true;
    if (clip.poster) video.poster = clip.poster;
    video.src = clip.src;
    video.style.width = "100%";
    video.style.height = "100%";
    host.appendChild(video);
  } else {
    host.textContent = "Clip unavailable";
  }
  return host;
}

function stopAllClipMedia(root) {
  if (!root) return;
  root.querySelectorAll("video").forEach(function (v) {
    try {
      v.pause();
    } catch (e) {}
    v.removeAttribute("src");
    try {
      v.load();
    } catch (e2) {}
  });
  root.querySelectorAll("iframe").forEach(function (f) {
    f.src = "about:blank";
  });
}

/* ===== TAB NAVIGATION & PAGES ROUTER ===== */
let activeTab = "catchphrases";
let activeCatchphraseSubView = "phrases"; // "phrases" | "floor"
let activeDebatesSubView = "wilson";       // "wilson" | "feuds"

function setCatchphraseSubView(subView) {
  activeCatchphraseSubView = subView === "floor" ? "floor" : "phrases";
  const btnPhrases = document.getElementById("sub-btn-phrases");
  const btnFloor = document.getElementById("sub-btn-floor");
  const boardPanel = document.getElementById("board-panel");
  const floorSection = document.getElementById("floor-section");

  if (btnPhrases) btnPhrases.classList.toggle("active", activeCatchphraseSubView === "phrases");
  if (btnFloor) btnFloor.classList.toggle("active", activeCatchphraseSubView === "floor");

  if (boardPanel) boardPanel.hidden = activeCatchphraseSubView !== "phrases";
  if (floorSection) floorSection.hidden = activeCatchphraseSubView !== "floor";
}

function setDebatesSubView(subView) {
  activeDebatesSubView = subView === "feuds" ? "feuds" : "wilson";
  const btnWilson = document.getElementById("sub-btn-wilson");
  const btnFeuds = document.getElementById("sub-btn-feuds");
  const wilsonSection = document.getElementById("wilson-section");
  const feudsSection = document.getElementById("feuds-section");

  if (btnWilson) btnWilson.classList.toggle("active", activeDebatesSubView === "wilson");
  if (btnFeuds) btnFeuds.classList.toggle("active", activeDebatesSubView === "feuds");

  if (wilsonSection) wilsonSection.hidden = activeDebatesSubView !== "wilson";
  if (feudsSection) feudsSection.hidden = activeDebatesSubView !== "feuds";
}

function initTabMenu() {
  const tabBtns = document.querySelectorAll(".tab-menu-item, .studio-nav-btn, .hero-cta-btn, .studio-quick-audio, [data-tab]");
  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      // Don't override if clicking an audio play button inside a card
      if (e.target.closest && e.target.closest(".phrase-audio-btn")) return;
      e.preventDefault();
      closeMobileSheet();
      const tab = btn.getAttribute("data-tab");
      if (tab) switchTab(tab, true);
    });
  });

  // Catchphrase sub-view buttons
  const btnSubPhrases = document.getElementById("sub-btn-phrases");
  const btnSubFloor = document.getElementById("sub-btn-floor");
  if (btnSubPhrases) {
    btnSubPhrases.addEventListener("click", function () {
      setCatchphraseSubView("phrases");
    });
  }
  if (btnSubFloor) {
    btnSubFloor.addEventListener("click", function () {
      setCatchphraseSubView("floor");
    });
  }

  // Head-to-Head sub-view buttons
  const btnSubWilson = document.getElementById("sub-btn-wilson");
  const btnSubFeuds = document.getElementById("sub-btn-feuds");
  if (btnSubWilson) {
    btnSubWilson.addEventListener("click", function () {
      setDebatesSubView("wilson");
    });
  }
  if (btnSubFeuds) {
    btnSubFeuds.addEventListener("click", function () {
      setDebatesSubView("feuds");
    });
  }

  // Mobile bottom dock buttons
  document.querySelectorAll(".dock-item[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      closeMobileSheet();
      const tab = btn.getAttribute("data-tab");
      if (tab) switchTab(tab, true);
    });
  });

  // Mobile bottom sheet ("More" drawer)
  const moreBtn = document.getElementById("mobile-more-btn");
  const sheet = document.getElementById("mobile-sheet");
  const backdrop = document.getElementById("mobile-sheet-backdrop");
  const closeSheetBtn = document.getElementById("mobile-sheet-close");

  function openMobileSheet() {
    if (sheet) sheet.hidden = false;
    if (backdrop) backdrop.hidden = false;
    if (moreBtn) moreBtn.setAttribute("aria-expanded", "true");
  }

  function closeMobileSheet() {
    if (sheet) sheet.hidden = true;
    if (backdrop) backdrop.hidden = true;
    if (moreBtn) moreBtn.setAttribute("aria-expanded", "false");
  }

  if (moreBtn) moreBtn.addEventListener("click", openMobileSheet);
  if (closeSheetBtn) closeSheetBtn.addEventListener("click", closeMobileSheet);
  if (backdrop) backdrop.addEventListener("click", closeMobileSheet);

  document.querySelectorAll(".sheet-tile[data-tab]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      const tab = btn.getAttribute("data-tab");
      closeMobileSheet();
      if (tab) switchTab(tab, true);
    });
  });

  const sheetTdsBtn = document.getElementById("sheet-tds-btn");
  if (sheetTdsBtn) {
    sheetTdsBtn.addEventListener("click", function () {
      closeMobileSheet();
      const breakdown = document.getElementById("tds-breakdown");
      if (breakdown) {
        breakdown.hidden = false;
        breakdown.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  // Audio dock stop button
  const dockStop = document.getElementById("audio-dock-stop-btn");
  if (dockStop) {
    dockStop.addEventListener("click", function () {
      stopPhraseAudio();
    });
  }

  // Keyboard navigation for top tabs
  const tabContainer = document.getElementById("studio-tab-menu");
  if (tabContainer) {
    tabContainer.addEventListener("keydown", function (e) {
      const items = Array.from(tabContainer.querySelectorAll(".tab-menu-item"));
      const idx = items.findIndex(function (b) {
        return b.classList.contains("active");
      });
      if (idx === -1) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = items[(idx + 1) % items.length];
        next.focus();
        switchTab(next.getAttribute("data-tab"), true);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = items[(idx - 1 + items.length) % items.length];
        prev.focus();
        switchTab(prev.getAttribute("data-tab"), true);
      }
    });
  }

  window.addEventListener("hashchange", function () {
    const raw = (location.hash || "").replace(/^#/, "");
    if (raw) switchTab(raw, false);
  });

  const initial = (location.hash || "").replace(/^#/, "");
  switchTab(initial || "catchphrases", false);
}

function switchTab(targetId, shouldScroll) {
  const validTabs = [
    "catchphrases",
    "soundboard",
    "dodge",
    "debates",
    "clips",
    "x",
  ];

  const aliases = {
    phrases: "catchphrases",
    board: "catchphrases",
    "board-panel": "catchphrases",
    "board-title": "catchphrases",
    floor: "floor",
    "floor-section": "floor",
    soundboard: "soundboard",
    "soundboard-section": "soundboard",
    dodge: "dodge",
    "dodge-section": "dodge",
    wilson: "wilson",
    "wilson-section": "wilson",
    feuds: "feuds",
    "feuds-section": "feuds",
    debates: "debates",
    clashes: "debates",
    "head-to-head": "debates",
    x: "x",
    "x-section": "x",
    receipts: "x",
    social: "x",
    clips: "clips",
    "clips-tab-section": "clips",
    "clips-rail": "clips",
    watch: "clips",
  };

  const resolved = aliases[targetId] || targetId;

  // Handle sub-view routing
  if (resolved === "floor") {
    targetId = "catchphrases";
    setCatchphraseSubView("floor");
  } else if (resolved === "wilson") {
    targetId = "debates";
    setDebatesSubView("wilson");
  } else if (resolved === "feuds") {
    targetId = "debates";
    setDebatesSubView("feuds");
  } else if (resolved === "catchphrases") {
    targetId = "catchphrases";
    // default to phrases unless floor was requested
    if (activeCatchphraseSubView !== "floor") {
      setCatchphraseSubView("phrases");
    }
  } else if (resolved === "debates") {
    targetId = "debates";
  } else {
    targetId = resolved;
  }

  if (validTabs.indexOf(targetId) === -1) targetId = "catchphrases";

  activeTab = targetId;

  // Toggle tab panel visibility
  validTabs.forEach(function (id) {
    const panel = document.getElementById("tab-panel-" + id);
    if (panel) {
      const isActive = id === targetId;
      panel.hidden = !isActive;
      panel.classList.toggle("tab-panel-active", isActive);
    }
  });

  // Toggle active styling on desktop top tab buttons
  document.querySelectorAll(".tab-menu-item, .studio-nav-btn").forEach(function (btn) {
    const isTarget = btn.getAttribute("data-tab") === targetId;
    btn.classList.toggle("active", isTarget);
    if (btn.hasAttribute("aria-selected")) {
      btn.setAttribute("aria-selected", isTarget ? "true" : "false");
    }
  });

  // Toggle active styling on mobile bottom dock items
  document.querySelectorAll(".dock-item[data-tab]").forEach(function (btn) {
    const isTarget = btn.getAttribute("data-tab") === targetId;
    btn.classList.toggle("active", isTarget);
  });

  // Sync layout mode (e.g. clips tab gets full width)
  const layout = document.getElementById("main-layout");
  if (layout) {
    layout.classList.toggle("clips-tab-active", targetId === "clips");
  }

  // Update URL hash cleanly without page jump
  if (history.replaceState) {
    history.replaceState(null, "", "#" + (resolved || targetId));
  }

  // If switched to clips tab, ensure clip is loaded in the tab host
  if (targetId === "clips" && CLIPS.length) {
    const current =
      CLIPS.find(function (c) {
        return c.id === activeClipId;
      }) || CLIPS[0];
    if (current) selectClip(current, { autoplay: false });
  }

  // Smooth scroll to top of content on tab switch
  if (shouldScroll) {
    const wrap = document.getElementById("studio-tab-menu-wrap");
    const header = document.querySelector(".site-header");
    const targetScroll = (window.innerWidth <= 768 && header) ? header : wrap;
    if (targetScroll) {
      const rect = targetScroll.getBoundingClientRect();
      if (rect.top < 0 || rect.top > 250) {
        targetScroll.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  if (typeof track === "function") {
    track("tab_switch", { tab: targetId, sub: (targetId === "debates" ? activeDebatesSubView : (targetId === "catchphrases" ? activeCatchphraseSubView : null)) });
  }
}

/* ===== IMMERSIVE TOUCH SWIPE GESTURES ===== */
function initSwipeGestures() {
  let startX = 0;
  let startY = 0;
  let endX = 0;
  let endY = 0;
  const tabsList = [
    "catchphrases",
    "soundboard",
    "dodge",
    "debates",
    "clips",
    "x",
  ];

  document.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    function (e) {
      if (e.changedTouches.length !== 1) return;
      endX = e.changedTouches[0].clientX;
      endY = e.changedTouches[0].clientY;

      const dx = endX - startX;
      const dy = endY - startY;

      // Predominantly horizontal swipe with at least 65px distance
      if (Math.abs(dx) > 65 && Math.abs(dy) < 45) {
        const target = e.target;
        if (
          target &&
          target.closest &&
          target.closest(
            ".filters, .ticker, .studio-tab-menu, .x-filters, .clips-list, .wilson-bars, .mobile-sheet, .mobile-bottom-dock, .sub-view-nav"
          )
        ) {
          return;
        }
        const curIdx = tabsList.indexOf(activeTab);
        if (curIdx === -1) return;

        if (dx < 0 && curIdx < tabsList.length - 1) {
          // Swiped left -> next tab
          switchTab(tabsList[curIdx + 1], true);
        } else if (dx > 0 && curIdx > 0) {
          // Swiped right -> prev tab
          switchTab(tabsList[curIdx - 1], true);
        }
      }
    },
    { passive: true }
  );
}

main();
