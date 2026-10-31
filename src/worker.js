/**
 * lyingshapiro.com edge Worker
 *  - Serves the static site from ./site (ASSETS binding)
 *  - Logs page requests server-side to D1 (works for no-JS visitors and bots)
 *  - POST /api/event   : client beacons from app.js
 *  - GET  /api/stats   : aggregated analytics (Bearer ADMIN_TOKEN)
 *  - GET  /api/live    : last N raw events/requests (Bearer ADMIN_TOKEN)
 *  - /admin            : dashboard UI (static, data gated by token)
 *
 * Privacy: raw IPs are never stored. A visitor hash = sha256(ip | ua | day | HASH_SALT),
 * which rotates daily and can't be reversed into an IP.
 */

const ALLOWED_ORIGINS = new Set([
  "https://lyingshapiro.com",
  "https://www.lyingshapiro.com",
  "https://lying-capiro.pages.dev",
]);
const MAX_BODY = 16 * 1024;
const MAX_EVENTS = 25;
const ASSET_RE = /\.(?:js|css|png|jpe?g|webp|gif|svg|ico|json|m4a|mp3|mp4|webm|woff2?|ttf|map|txt|xml)$/i;
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|curl|wget|python-requests|httpx|go-http|headless|lighthouse|monitor|uptime|discord|telegram|whatsapp|slack|twitterbot|bingpreview/i;

export default {
  async fetch(request, env, ctx) {
    const t0 = Date.now();
    const url = new URL(request.url);

    // Canonicalise www -> apex.
    if (url.hostname === "www.lyingshapiro.com") {
      url.hostname = "lyingshapiro.com";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/api/event") return handleEvent(request, env, ctx);
    if (url.pathname === "/api/stats") return handleStats(request, env, url);
    if (url.pathname === "/api/live") return handleLive(request, env, url);
    if (url.pathname.startsWith("/api/")) return json({ error: "not_found" }, 404);

    let assetReq = request;
    if (url.pathname === "/admin" || url.pathname === "/admin/") {
      assetReq = new Request(new URL("/admin.html", url), request);
    }
    const res = await env.ASSETS.fetch(assetReq);

    // Only log navigations / HTML pages, not every image and audio file.
    const isAsset = ASSET_RE.test(url.pathname);
    const isAdmin = url.pathname.startsWith("/admin");
    if (!isAsset && !isAdmin && request.method === "GET" && env.DB) {
      ctx.waitUntil(logRequest(request, env, url, res.status, Date.now() - t0).catch((e) => console.error("logRequest", e)));
    }

    if (isAdmin) {
      const h = new Headers(res.headers);
      h.set("X-Robots-Tag", "noindex, nofollow");
      h.set("Cache-Control", "no-store");
      return new Response(res.body, { status: res.status, headers: h });
    }
    return res;
  },
};

/* ---------- helpers ---------- */

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

function corsHeaders(request) {
  const o = request.headers.get("Origin");
  if (o && ALLOWED_ORIGINS.has(o)) {
    return { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", Vary: "Origin" };
  }
  return {};
}

function today(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function visitorHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "0";
  const ua = request.headers.get("User-Agent") || "";
  return sha256(`${ip}|${ua}|${today()}|${env.HASH_SALT || "unsalted"}`);
}

function parseUA(ua = "") {
  const bot = BOT_RE.test(ua);
  let botName = null;
  if (bot) {
    const m = ua.match(/([A-Za-z\-]*(?:bot|spider|crawler|preview|hit)[A-Za-z\-]*)/i);
    botName = (m && m[1]) || ua.split(/[\s/]/)[0] || "bot";
  }
  let browser = "Other";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/CriOS|Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";
  let os = "Other";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  let device = "desktop";
  if (/iPad|Tablet/.test(ua)) device = "tablet";
  else if (/Mobi|iPhone|Android/.test(ua)) device = "mobile";
  if (bot) device = "bot";
  return { bot, botName, browser, os, device };
}

function refHost(ref) {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    return h === "lyingshapiro.com" ? null : h;
  } catch {
    return null;
  }
}

function clip(v, n) {
  if (v === undefined || v === null) return null;
  return String(v).slice(0, n);
}

function authed(request, env) {
  const h = request.headers.get("Authorization") || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!env.ADMIN_TOKEN || !tok || tok.length !== env.ADMIN_TOKEN.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < tok.length; i++) diff |= tok.charCodeAt(i) ^ env.ADMIN_TOKEN.charCodeAt(i);
  return diff === 0;
}

/* ---------- logging ---------- */

async function logRequest(request, env, url, status, ms) {
  const cf = request.cf || {};
  const ua = request.headers.get("User-Agent") || "";
  const p = parseUA(ua);
  const ref = request.headers.get("Referer") || "";
  await env.DB.prepare(
    `INSERT INTO requests (ts, day, host, path, query, method, status, country, region, city, colo, asn, as_org,
      browser, os, device, is_bot, bot_name, ref_host, referrer, vhash, ms)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
    .bind(
      Date.now(), today(), url.hostname, clip(url.pathname, 200), clip(url.search, 200), request.method, status,
      cf.country || null, cf.region || null, cf.city || null, cf.colo || null, cf.asn || null, clip(cf.asOrganization, 80),
      p.browser, p.os, p.device, p.bot ? 1 : 0, clip(p.botName, 60), refHost(ref), clip(ref, 300),
      await visitorHash(request, env), ms
    )
    .run();
}

async function handleEvent(request, env, ctx) {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return json({ error: "method" }, 405, cors);
  if (!env.DB) return json({ error: "no_db" }, 503, cors);

  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin) && !origin.startsWith("http://localhost") && !origin.startsWith("http://127.0.0.1")) {
    return json({ error: "origin" }, 403);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413, cors);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400, cors);
  }
  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  if (!events.length) return json({ ok: true, n: 0 }, 200, cors);

  const ua = request.headers.get("User-Agent") || "";
  const p = parseUA(ua);
  if (p.bot) return json({ ok: true, n: 0 }, 200, cors);

  const cf = request.cf || {};
  const vhash = await visitorHash(request, env);
  const sid = clip(body.sid, 40);
  const rh = refHost(body.ref);
  const vw = Number.isFinite(body.vw) ? Math.round(body.vw) : null;
  const now = Date.now();

  const stmt = env.DB.prepare(
    `INSERT INTO events (ts, day, sid, vhash, type, path, item, label, props, country, device, ref_host, vw)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const batch = events
    .filter((e) => e && typeof e.type === "string" && /^[a-z_]{2,40}$/.test(e.type))
    .map((e) => {
      const props = e.props && typeof e.props === "object" ? e.props : {};
      const item = props.id || props.src || props.filter || props.q || null;
      const ts = Number.isFinite(e.ts) && Math.abs(e.ts - now) < 3600e3 ? e.ts : now;
      return stmt.bind(
        ts, today(ts), sid, vhash, e.type, clip(e.path, 200), clip(item, 120), clip(props.label, 120),
        clip(JSON.stringify(props), 1000), cf.country || null, p.device, rh, vw
      );
    });
  if (batch.length) ctx.waitUntil(env.DB.batch(batch).catch((err) => console.error("events batch", err)));
  return json({ ok: true, n: batch.length }, 200, cors);
}

/* ---------- reporting ---------- */

async function handleStats(request, env, url) {
  if (!authed(request, env)) return json({ error: "unauthorized" }, 401);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "7", 10) || 7, 1), 365);
  const since = today(Date.now() - (days - 1) * 86400e3);
  const humans = "is_bot = 0";

  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args).all().then((r) => r.results);
  const one = (sql, ...args) => env.DB.prepare(sql).bind(...args).first();

  const [
    totals, botTotals, daily, pages, referrers, countries, cities, devices, browsers, oses, bots,
    evTypes, sounds, clips, sections, searches, outbound, clusters, engagement, errors, hourly, evDaily,
  ] = await Promise.all([
    one(`SELECT COUNT(*) AS pageviews, COUNT(DISTINCT vhash) AS visitors FROM requests WHERE day >= ? AND ${humans}`, since),
    one(`SELECT COUNT(*) AS hits FROM requests WHERE day >= ? AND is_bot = 1`, since),
    q(`SELECT day, COUNT(*) AS pageviews, COUNT(DISTINCT vhash) AS visitors FROM requests WHERE day >= ? AND ${humans} GROUP BY day ORDER BY day`, since),
    q(`SELECT path, COUNT(*) AS n FROM requests WHERE day >= ? AND ${humans} GROUP BY path ORDER BY n DESC LIMIT 20`, since),
    q(`SELECT COALESCE(ref_host,'(direct)') AS k, COUNT(*) AS n, COUNT(DISTINCT vhash) AS v FROM requests WHERE day >= ? AND ${humans} GROUP BY k ORDER BY n DESC LIMIT 25`, since),
    q(`SELECT COALESCE(country,'??') AS k, COUNT(DISTINCT vhash) AS n FROM requests WHERE day >= ? AND ${humans} GROUP BY k ORDER BY n DESC LIMIT 25`, since),
    q(`SELECT COALESCE(city,'?') || ', ' || COALESCE(region,'') || ' ' || COALESCE(country,'') AS k, COUNT(DISTINCT vhash) AS n FROM requests WHERE day >= ? AND ${humans} GROUP BY k ORDER BY n DESC LIMIT 20`, since),
    q(`SELECT device AS k, COUNT(DISTINCT vhash) AS n FROM requests WHERE day >= ? AND ${humans} GROUP BY k ORDER BY n DESC`, since),
    q(`SELECT browser AS k, COUNT(DISTINCT vhash) AS n FROM requests WHERE day >= ? AND ${humans} GROUP BY k ORDER BY n DESC`, since),
    q(`SELECT os AS k, COUNT(DISTINCT vhash) AS n FROM requests WHERE day >= ? AND ${humans} GROUP BY k ORDER BY n DESC`, since),
    q(`SELECT COALESCE(bot_name,'bot') AS k, COUNT(*) AS n FROM requests WHERE day >= ? AND is_bot = 1 GROUP BY k ORDER BY n DESC LIMIT 15`, since),
    q(`SELECT type AS k, COUNT(*) AS n, COUNT(DISTINCT sid) AS sessions FROM events WHERE day >= ? GROUP BY type ORDER BY n DESC`, since),
    q(`SELECT COALESCE(item, label) AS k, COUNT(*) AS n FROM events WHERE day >= ? AND type IN ('sound_play','audio_play') GROUP BY k ORDER BY n DESC LIMIT 20`, since),
    q(`SELECT COALESCE(item, label) AS k, COUNT(*) AS n FROM events WHERE day >= ? AND type IN ('clip_select','video_play') GROUP BY k ORDER BY n DESC LIMIT 20`, since),
    q(`SELECT item AS k, COUNT(DISTINCT sid) AS n FROM events WHERE day >= ? AND type = 'section_view' GROUP BY k ORDER BY n DESC`, since),
    q(`SELECT LOWER(item) AS k, COUNT(*) AS n FROM events WHERE day >= ? AND type = 'search' GROUP BY k ORDER BY n DESC LIMIT 25`, since),
    q(`SELECT COALESCE(json_extract(props,'$.href'), item) AS k, COUNT(*) AS n FROM events WHERE day >= ? AND type IN ('outbound','x_click','feud_click') GROUP BY k ORDER BY n DESC LIMIT 25`, since),
    q(`SELECT COALESCE(item, label) AS k, COUNT(*) AS n FROM events WHERE day >= ? AND type IN ('click','filter') AND item LIKE 'c0%' GROUP BY k ORDER BY n DESC LIMIT 20`, since),
    one(`SELECT ROUND(AVG(CAST(json_extract(props,'$.secs') AS REAL)),1) AS avg_secs,
                ROUND(AVG(CAST(json_extract(props,'$.depth') AS REAL)),1) AS avg_depth, COUNT(*) AS n
         FROM events WHERE day >= ? AND type = 'engagement' AND CAST(json_extract(props,'$.secs') AS REAL) < 7200`, since),
    q(`SELECT label AS k, item, COUNT(*) AS n, MAX(ts) AS last FROM events WHERE day >= ? AND type = 'js_error' GROUP BY props ORDER BY n DESC LIMIT 15`, since),
    q(`SELECT CAST(strftime('%H', ts/1000, 'unixepoch') AS INTEGER) AS hour, COUNT(*) AS n FROM requests WHERE day >= ? AND ${humans} GROUP BY hour ORDER BY hour`, since),
    q(`SELECT day, COUNT(*) AS events, COUNT(DISTINCT sid) AS sessions FROM events WHERE day >= ? GROUP BY day ORDER BY day`, since),
  ]);

  const live = await one(`SELECT COUNT(DISTINCT sid) AS n FROM events WHERE ts >= ?`, Date.now() - 5 * 60e3);

  return json({
    range: { days, since, generated_at: new Date().toISOString() },
    totals: { ...totals, bot_hits: botTotals?.hits || 0, live_sessions_5m: live?.n || 0, ...engagement },
    daily, evDaily, hourly, pages, referrers, countries, cities, devices, browsers, oses, bots,
    events: evTypes, sounds, clips, sections, searches, outbound, clusters, errors,
  });
}

async function handleLive(request, env, url) {
  if (!authed(request, env)) return json({ error: "unauthorized" }, 401);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
  const [events, requests] = await Promise.all([
    env.DB.prepare(`SELECT ts, type, item, label, path, country, device, ref_host, sid FROM events ORDER BY ts DESC LIMIT ?`).bind(limit).all(),
    env.DB.prepare(`SELECT ts, path, country, city, device, browser, os, is_bot, bot_name, ref_host, status FROM requests ORDER BY ts DESC LIMIT ?`).bind(limit).all(),
  ]);
  return json({ events: events.results, requests: requests.results });
}
