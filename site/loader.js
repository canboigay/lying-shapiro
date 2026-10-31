/* Lying Shapiro — intro loader. Self-contained: injects its own CSS + DOM.
 * Plays once per session (add ?intro=1 to force). Tap/click or Skip to bypass.
 * Respects prefers-reduced-motion (short fade only). */
(function () {
  "use strict";
  var params = new URLSearchParams(location.search);
  var force = params.get("intro") === "1";
  var seen = false;
  try { seen = sessionStorage.getItem("ls_intro_seen") === "1"; } catch (e) {}
  if (seen && !force) return;
  if (params.get("intro") === "0") return;

  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var MIN_MS = reduce ? 700 : 3600;
  var QUOTES = [
    "January 6th", "Convicted felon", "That's a fair question", "Answer the question",
    "I'll answer that", "What? What?", "In the Epstein files", "Maga mushroom gobbler",
    "Do you condemn it?", "Let me finish", "Sir, sir", "I'm happy to talk",
    "Liable sexual abuser", "Praising Adolf Hitler", "Can I just say one thing"
  ];

  var css = [
    "#ls-intro{position:fixed;inset:0;z-index:99999;background:#050507;color:#f4f1ea;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Bebas Neue',Impact,'Arial Narrow',sans-serif;transition:opacity .55s ease,transform .55s ease;touch-action:manipulation;cursor:pointer}",
    "#ls-intro.out{opacity:0;transform:scale(1.06);pointer-events:none}",
    "#ls-intro .bg{position:absolute;inset:-20%;background:radial-gradient(circle at 50% 40%,#3a0a10 0%,#12060a 45%,#050507 80%);animation:ls-bg 3.6s ease-out both}",
    "@keyframes ls-bg{0%{opacity:0}25%{opacity:1}100%{opacity:1}}",
    "#ls-intro .rays{position:absolute;left:50%;top:40%;width:260vmax;height:260vmax;margin:-130vmax 0 0 -130vmax;background:repeating-conic-gradient(from 0deg,rgba(229,43,56,.10) 0 6deg,transparent 6deg 18deg);animation:ls-spin 28s linear infinite;mask-image:radial-gradient(circle,#000 0,transparent 42%);-webkit-mask-image:radial-gradient(circle,#000 0,transparent 42%)}",
    "@keyframes ls-spin{to{transform:rotate(360deg)}}",
    "#ls-intro .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px);pointer-events:none;mix-blend-mode:overlay}",
    "#ls-intro .stage{position:relative;width:min(58vmin,420px);aspect-ratio:1;margin-top:-6vh;flex:0 0 auto}",
    /* face */
    "#ls-intro .face{position:absolute;inset:0;border-radius:50%;background:url(./brand/face-800.jpg) center/cover;box-shadow:0 0 0 3px #e52b38,0 0 90px rgba(229,43,56,.55),0 30px 80px rgba(0,0,0,.8);animation:ls-slam .7s cubic-bezier(.2,1.4,.3,1) .15s both,ls-shake .35s linear 1.6s 3,ls-pulse 1.1s ease-in-out 2.1s infinite}",
    "@keyframes ls-slam{0%{transform:scale(.05) rotate(-200deg);opacity:0}60%{opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}",
    "@keyframes ls-shake{0%,100%{translate:0 0}25%{translate:-5px 3px}50%{translate:6px -3px}75%{translate:-4px -2px}}",
    "@keyframes ls-pulse{0%,100%{filter:none}50%{filter:saturate(1.35) contrast(1.06)}}",
    "#ls-intro .flash{position:absolute;inset:0;background:#fff;opacity:0;animation:ls-flash .6s ease-out .8s both;pointer-events:none}",
    "@keyframes ls-flash{0%{opacity:0}10%{opacity:.8}100%{opacity:0}}",
    /* spiral quotes */
    "#ls-intro .q{position:absolute;left:50%;top:50%;width:0;height:0;animation:ls-spiral 2.4s cubic-bezier(.15,.7,.2,1) both}",
    "#ls-intro .q i{position:absolute;left:0;top:0;transform:translate(-50%,-50%);white-space:nowrap;font-style:normal;font-size:clamp(.72rem,2.6vmin,1.35rem);letter-spacing:.06em;text-transform:uppercase;padding:.15em .55em;background:rgba(5,5,7,.78);border:1px solid rgba(229,43,56,.55);border-radius:6px;color:#fff;animation:ls-upright 2.4s cubic-bezier(.15,.7,.2,1) both}",
    "#ls-intro .q.gold i{border-color:rgba(240,180,41,.7);color:#f0b429}",
    "@keyframes ls-spiral{0%{transform:rotate(calc(var(--a) - 260deg)) translateX(2vmin) scale(.2);opacity:0}15%{opacity:1}100%{transform:rotate(var(--a)) translateX(var(--r)) scale(1);opacity:1}}",
    "@keyframes ls-upright{0%{transform:translate(-50%,-50%) rotate(calc(260deg - var(--a)))}100%{transform:translate(-50%,-50%) rotate(calc(-1 * var(--a)))}}",
    /* headline */
    "#ls-intro h1{position:relative;z-index:6;margin:3.2vh 5vw 0;text-align:center;font-weight:400;line-height:.9;font-size:clamp(2.7rem,10.5vmin,6.4rem);text-transform:uppercase;text-shadow:0 4px 0 #7a0f19,0 10px 40px rgba(0,0,0,.9)}",
    "#ls-intro h1 span{display:inline-block;opacity:0;animation:ls-word .42s cubic-bezier(.2,1.6,.35,1) both}",
    "#ls-intro h1 .r{color:#e52b38}",
    "@keyframes ls-word{0%{opacity:0;transform:translateY(40px) scale(2.2) rotate(-6deg)}100%{opacity:1;transform:none}}",
    "#ls-intro .sub{position:relative;z-index:6;margin-top:1.4vh;font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-size:clamp(.62rem,1.8vmin,.8rem);letter-spacing:.18em;text-transform:uppercase;color:#f0b429;opacity:0;animation:ls-fade .5s ease 2.5s both}",
    "@keyframes ls-fade{to{opacity:1}}",
    /* progress */
    "#ls-intro .bar{position:absolute;left:6vw;right:6vw;bottom:calc(5vh + env(safe-area-inset-bottom,0px));font-family:'IBM Plex Mono',ui-monospace,Menlo,monospace;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;color:#9a9aab}",
    "#ls-intro .track{height:6px;border-radius:99px;background:#1b1b26;overflow:hidden;margin-top:.5rem}",
    "#ls-intro .fill{height:100%;width:0;background:linear-gradient(90deg,#e52b38,#f0b429);border-radius:99px;transition:width .2s linear}",
    "#ls-intro .bar .row{display:flex;justify-content:space-between;gap:1rem}",
    "#ls-intro .skip{position:absolute;top:calc(1rem + env(safe-area-inset-top,0px));right:1rem;background:rgba(0,0,0,.5);color:#cfcfd8;border:1px solid #3a3a4a;border-radius:99px;padding:.45rem .9rem;font:600 .68rem 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}",
    "html.ls-lock,html.ls-lock body{overflow:hidden!important}",
    "@media (prefers-reduced-motion:reduce){#ls-intro *{animation-duration:.01s!important;animation-delay:0s!important}}"
  ].join("\n");

  var style = document.createElement("style");
  style.id = "ls-intro-css";
  style.textContent = css;
  document.head.appendChild(style);
  document.documentElement.classList.add("ls-lock");

  var el = document.createElement("div");
  el.id = "ls-intro";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Loading");

  var words = ["Brian,", "why", "you", "always", "lying?"];
  var h1 = words.map(function (w, i) {
    var cls = w === "lying?" ? ' class="r"' : "";
    return '<span' + cls + ' style="animation-delay:' + (1.15 + i * 0.22).toFixed(2) + 's">' + w + "</span>";
  }).join(" ");

  var quotes = "";
  var narrow = Math.min(window.innerWidth, window.innerHeight) < 600;
  if (narrow) {
    QUOTES = ["January 6th", "Convicted felon", "Answer the question", "What? What?",
      "In the Epstein files", "Let me finish", "Sir, sir", "I'll answer that"];
  }
  var n = QUOTES.length;
  for (var i = 0; i < n; i++) {
    // spread across the top and sides only (skip the bottom arc where the headline sits)
    var a = Math.round(140 + (260 / (n - 1)) * i);
    var r = narrow ? (i % 2 ? 38 : 33) : (i % 3 === 0 ? 36 : i % 3 === 1 ? 30 : 42);
    var d = (0.9 + i * 0.07).toFixed(2);
    quotes += '<div class="q' + (i % 4 === 0 ? " gold" : "") + '" style="--a:' + a + "deg;--r:" + r + "vmin;animation-delay:" + d + 's"><i style="animation-delay:' + d + 's">' + QUOTES[i] + "</i></div>";
  }

  el.innerHTML =
    '<div class="bg"></div><div class="rays"></div><div class="scan"></div>' +
    '<button type="button" class="skip" aria-label="Skip intro">Skip</button>' +
    '<div class="stage"><div class="face"></div>' + quotes + "</div>" +
    "<h1>" + h1 + "</h1>" +
    '<div class="sub">Loading the receipts</div>' +
    '<div class="bar"><div class="row"><span id="ls-msg">Loading straight answers</span><span id="ls-pct">0%</span></div><div class="track"><div class="fill" id="ls-fill"></div></div></div>' +
    '<div class="flash"></div>';
  document.documentElement.appendChild(el);

  var start = performance.now();
  var loaded = document.readyState === "complete";
  var finished = false;
  var fill, pct, msg;
  var MSGS = [
    [0, "Loading straight answers"],
    [35, "Straight answers found: 0"],
    [70, "Searching transcripts for a yes or no"],
    [92, "Error: none exist. Continuing anyway"]
  ];

  function tick() {
    if (finished) return;
    fill = fill || document.getElementById("ls-fill");
    pct = pct || document.getElementById("ls-pct");
    msg = msg || document.getElementById("ls-msg");
    var t = performance.now() - start;
    var p = Math.min(1, t / MIN_MS);
    // never hit 100% until the page is actually loaded
    var cap = loaded ? 1 : 0.94;
    var v = Math.min(p, cap);
    var shown = Math.round(v * 100);
    if (fill) fill.style.width = shown + "%";
    if (pct) pct.textContent = shown + "%";
    if (msg) { for (var k = MSGS.length - 1; k >= 0; k--) { if (shown >= MSGS[k][0]) { msg.textContent = MSGS[k][1]; break; } } }
    if (p >= 1 && loaded) { done(); return; }
    requestAnimationFrame(tick);
  }

  function done() {
    if (finished) return;
    finished = true;
    el.classList.add("out");
    try { sessionStorage.setItem("ls_intro_seen", "1"); } catch (e) {}
    setTimeout(function () {
      document.documentElement.classList.remove("ls-lock");
      if (el.parentNode) el.parentNode.removeChild(el);
      if (style.parentNode) style.parentNode.removeChild(style);
    }, 650);
  }

  if (!loaded) window.addEventListener("load", function () { loaded = true; });
  el.addEventListener("click", done);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" || e.key === "Enter") done(); });
  // hard safety net so a slow asset can never trap the visitor
  setTimeout(done, 9000);
  requestAnimationFrame(tick);
})();
