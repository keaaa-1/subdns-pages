// src/index.js
var ALGO = "PBKDF2";
var ITERATIONS = 1e5;
var KEY_LEN = 32;
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".zip": "application/zip"
};
var DAY = 24 * 60 * 60 * 1e3;
var DEFAULT_SETTINGS = {
  signup_credits: 1e3,
  deploy_cost: 2,
  visit_cost: 0.1,
  monthly_gift: 100,
  referral_referrer: 50,
  referral_invitee: 10,
  renew_cost: 10,
  domain_valid_days: 180,
  renew_days: 180,
  renew_grace_days: 90,
  recharge_min: 1
};
function mimeOf(path) {
  const i = path.lastIndexOf(".");
  if (i < 0) return "application/octet-stream";
  return MIME[path.slice(i).toLowerCase()] || "application/octet-stream";
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}
function ok(data) {
  return json({ ok: true, ...data });
}
function fail(message, status = 400, extra = {}) {
  return json({ ok: false, error: message, ...extra }, status);
}
function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randId(len = 16) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}
function randCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
  return out;
}
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), ALGO, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: ALGO, salt: enc.encode(salt), iterations: ITERATIONS, hash: "SHA-256" },
    key,
    KEY_LEN * 8
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function daysBetween(a, b) {
  return Math.floor((a - b) / DAY);
}
var SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  credits REAL NOT NULL DEFAULT 1000,
  primary_domain TEXT,
  invite_code TEXT UNIQUE,
  referred_by INTEGER,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  last_gift_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  current_deployment_id INTEGER,
  visits INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  domain_expires_at TEXT,
  renewed_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0,
  credits_spent REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta REAL NOT NULL,
  balance_after REAL NOT NULL,
  type TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  cost REAL NOT NULL DEFAULT 0.1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS domains (
  domain TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  project_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  order_no TEXT UNIQUE NOT NULL,
  amount REAL NOT NULL,
  credits REAL NOT NULL,
  method TEXT NOT NULL,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gift_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  period TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  target_users TEXT DEFAULT 'all',
  pool_total REAL DEFAULT 0,
  pool_current REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(activity_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_logs_user ON credit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_gift_user ON gift_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_claims_activity ON activity_claims(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_claims_user ON activity_claims(user_id);
`;
var schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  const row = await env.DB.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='activity_claims'`
  ).first();
  if (row) {
    await ensureActivityColumns(env);
    schemaReady = true;
    return;
  }
  const stmts = SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
  for (const s of stmts) await env.DB.prepare(s).run();
  await ensureActivityColumns(env);
  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`).run();
  } catch (e) {
  }
  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0`).run();
  } catch (e) {
  }
  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN real_name_verified INTEGER DEFAULT 0`).run();
  } catch (e) {
  }
  schemaReady = true;
}
async function ensureActivityColumns(env) {
  try {
    await env.DB.prepare(`ALTER TABLE activities ADD COLUMN pool_total REAL DEFAULT 0`).run();
  } catch (e) {
  }
  try {
    await env.DB.prepare(`ALTER TABLE activities ADD COLUMN pool_current REAL DEFAULT 0`).run();
  } catch (e) {
  }
  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`).run();
  } catch (e) {
  }
  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0`).run();
  } catch (e) {
  }
  try {
    await env.DB.prepare(`ALTER TABLE users ADD COLUMN real_name_verified INTEGER DEFAULT 0`).run();
  } catch (e) {
  }
}function parseNum(v) {
  const num = Number(v);
  return v !== "" && !isNaN(num) && /^-?\d+(\.\d+)?$/.test(String(v)) ? num : v;
}
async function getSettings(env) {
  const cfg = { ...DEFAULT_SETTINGS };
  try {
    const rows = await env.DB.prepare(`SELECT key, value FROM settings`).all();
    for (const r of rows.results || []) {
      if (r.key in cfg) cfg[r.key] = parseNum(r.value);
    }
  } catch (e) {
  }
  return cfg;
}
async function setSetting(env, key, value) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(key, String(value)).run();
}
async function createSession(env, userId) {
  const token = randId(24) + "." + randId(24);
  await env.SESSIONS.put(token, JSON.stringify({ userId, createdAt: Date.now() }), {
    expirationTtl: 60 * 60 * 24 * 30
  });
  return token;
}
async function getUserFromRequest(env, request) {
  let token = request.headers.get("authorization") || "";
  if (token.toLowerCase().startsWith("bearer ")) token = token.slice(7).trim();
  if (!token) {
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)sp_token=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }
  if (!token) return null;
  const raw = await env.SESSIONS.get(token, "json");
  if (!raw || !raw.userId) return null;
  const user = await env.DB.prepare(
    `SELECT id, username, email, credits, primary_domain, invite_code, referred_by, role, status, created_at
     FROM users WHERE id = ?`
  ).bind(raw.userId).first();
  if (!user) return null;
  if (user.status === "banned") return null;
  return user;
}
async function requireUser(env, request) {
  const user = await getUserFromRequest(env, request);
  if (!user) return { error: fail("\u8BF7\u5148\u767B\u5F55", 401) };
  return { user };
}
async function requireAdmin(env, request) {
  const { user, error } = await requireUser(env, request);
  if (error) return { error };
  if (user.role !== "admin") return { error: fail("\u9700\u8981\u7BA1\u7406\u5458\u6743\u9650", 403) };
  return { user };
}
function sanitizeSlug(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
async function domainTaken(env, domain) {
  const row = await env.DB.prepare(`SELECT domain FROM domains WHERE domain = ?`).bind(domain).first();
  if (row) return true;
  const p = await env.DB.prepare(`SELECT id FROM projects WHERE domain = ?`).bind(domain).first();
  return !!p;
}
var SITE_PATH_PREFIX = "/pages/main/";
function sitePath(slug) {
  return SITE_PATH_PREFIX + slug;
}
function siteUrl(env, slug) {
  const panel = env.PANEL_DOMAIN || "pages.subdns.cc";
  return `https://${panel}${sitePath(slug)}`;
}
async function allocateDomain(env, base, userId, projectId = null) {
  const clean = sanitizeSlug(base) || "site";
  const candidates = [clean];
  for (let i = 0; i < 8; i++) candidates.push(`${clean}-${randId(4)}`);
  for (const c of candidates) {
    if (!await domainTaken(env, c)) {
      await env.DB.prepare(
        `INSERT INTO domains (domain, user_id, project_id, created_at) VALUES (?, ?, ?, ?)`
      ).bind(c, userId, projectId, nowIso()).run();
      return c;
    }
  }
  const slug = `${clean}-${Date.now().toString(36)}`;
  await env.DB.prepare(
    `INSERT INTO domains (domain, user_id, project_id, created_at) VALUES (?, ?, ?, ?)`
  ).bind(slug, userId, projectId, nowIso()).run();
  return slug;
}
async function addCredits(env, userId, delta, type, note) {
  await env.DB.prepare(`UPDATE users SET credits = ROUND(credits + ?, 2) WHERE id = ?`).bind(delta, userId).run();
  const u = await env.DB.prepare(`SELECT credits FROM users WHERE id = ?`).bind(userId).first();
  await env.DB.prepare(
    `INSERT INTO credit_logs (user_id, delta, balance_after, type, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(userId, delta, u.credits, type, note || null, nowIso()).run();
  return u.credits;
}
async function grantMonthlyGifts(env, force = false) {
  const amount = Number(await getSettingOr(env, "monthly_gift"));
  if (!amount) return { granted: 0, amount };
  const rows = await env.DB.prepare(`SELECT id, last_gift_at FROM users WHERE status = 'active'`).all();
  const period = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
  let granted = 0;
  for (const u of rows.results || []) {
    if (!force && u.last_gift_at) {
      const days = daysBetween(Date.now(), new Date(u.last_gift_at).getTime());
      if (days < 30) continue;
    }
    if (!force) {
      const dup = await env.DB.prepare(`SELECT id FROM gift_log WHERE user_id = ? AND period = ?`).bind(u.id, period).first();
      if (dup) continue;
    }
    await addCredits(env, u.id, amount, "monthly", `\u6BCF\u6708\u8D60\u9001\u79EF\u5206\uFF08${period}\uFF09`);
    await env.DB.prepare(`UPDATE users SET last_gift_at = ? WHERE id = ?`).bind(nowIso(), u.id).run();
    await env.DB.prepare(`INSERT INTO gift_log (user_id, amount, period, created_at) VALUES (?, ?, ?, ?)`).bind(u.id, amount, period, nowIso()).run();
    granted++;
  }
  return { granted, amount };
}
async function getSettingOr(env, key) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?`).bind(key).first();
  if (!row) return DEFAULT_SETTINGS[key];
  return parseNum(row.value);
}
async function handleRegister(env, request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const refCode = String(body.ref || "").trim().toUpperCase();
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) {
    return fail("\u7528\u6237\u540D\u9700\u4E3A 3-24 \u4F4D\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u3001\u70B9\u6216\u77ED\u6A2A\u7EBF");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("\u90AE\u7BB1\u683C\u5F0F\u4E0D\u6B63\u786E");
  if (password.length < 6) return fail("\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
  const exists = await env.DB.prepare(`SELECT id FROM users WHERE username = ? OR email = ?`).bind(username, email).first();
  if (exists) return fail("\u7528\u6237\u540D\u6216\u90AE\u7BB1\u5DF2\u88AB\u6CE8\u518C", 409);
  let referrer = null;
  if (refCode) {
    referrer = await env.DB.prepare(`SELECT id, username FROM users WHERE invite_code = ?`).bind(refCode).first();
    if (!referrer) return fail("\u9080\u8BF7\u7801\u65E0\u6548", 400);
  }
  const cfg = await getSettings(env);
  const signupCredits = Number(cfg.signup_credits);
  const salt = randId(16);
  const hash = await hashPassword(password, salt);
  const inviteCode = randCode(8);
  const res = await env.DB.prepare(
    `INSERT INTO users (username, email, salt, password_hash, credits, invite_code, referred_by, role, status, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?, 'user', 'active', ?)`
  ).bind(username, email, salt, hash, inviteCode, referrer ? referrer.id : null, nowIso()).run();
  const userId = Number(res.meta.last_row_id);
  const domain = await allocateDomain(env, username, userId);
  await env.DB.prepare(`UPDATE users SET primary_domain = ? WHERE id = ?`).bind(domain, userId).run();
  await addCredits(env, userId, signupCredits, "signup", `\u65B0\u7528\u6237\u6CE8\u518C\u8D60\u9001 ${signupCredits} \u79EF\u5206`);
  const signupActivity = await getActiveActivity(env, "signup_bonus");
  if (signupActivity && signupActivity.value > 0) {
    await addCredits(
      env,
      userId,
      signupActivity.value,
      "activity",
      `\u6D3B\u52A8\u300C${signupActivity.title}\u300D\u6CE8\u518C\u989D\u5916\u8D60\u9001 ${signupActivity.value} \u79EF\u5206`
    );
  }
  let referralBonus = null;
  if (referrer) {
    const refAmount = Number(cfg.referral_referrer);
    const inviteeAmount = Number(cfg.referral_invitee);
    await addCredits(env, referrer.id, refAmount, "referral", `\u9080\u8BF7\u65B0\u7528\u6237 ${username} \u5956\u52B1`);
    await addCredits(env, userId, inviteeAmount, "referral", `\u4F7F\u7528 ${referrer.username} \u7684\u9080\u8BF7\u7801\u5956\u52B1`);
    referralBonus = { referrer: refAmount, invitee: inviteeAmount };
  }
  const token = await createSession(env, userId);
  const balance = await env.DB.prepare(`SELECT credits FROM users WHERE id = ?`).bind(userId).first();
  return ok({
    token,
    user: {
      id: userId,
      username,
      email,
      credits: balance.credits,
      primary_domain: domain,
      invite_code: inviteCode,
      referred_by: referrer ? referrer.username : null,
      role: "user"
    },
    referral_bonus: referralBonus
  });
}
async function handleLogin(env, request) {
  const body = await request.json().catch(() => ({}));
  const account = String(body.username || body.email || "").trim();
  const password = String(body.password || "");
  if (!account || !password) return fail("\u8BF7\u8F93\u5165\u7528\u6237\u540D/\u90AE\u7BB1\u548C\u5BC6\u7801");
  const row = await env.DB.prepare(`SELECT * FROM users WHERE username = ? OR email = ?`).bind(account, account.toLowerCase()).first();
  if (!row) return fail("\u8D26\u53F7\u4E0D\u5B58\u5728", 401);
  if (row.status === "banned") return fail("\u8D26\u53F7\u5DF2\u88AB\u5C01\u7981\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458", 403);
  const hash = await hashPassword(password, row.salt);
  if (hash !== row.password_hash) return fail("\u5BC6\u7801\u9519\u8BEF", 401);
  const token = await createSession(env, row.id);
  return ok({
    token,
    user: {
      id: row.id,
      username: row.username,
      email: row.email,
      credits: row.credits,
      primary_domain: row.primary_domain,
      invite_code: row.invite_code,
      referred_by: row.referred_by,
      role: row.role
    }
  });
}
async function handleLogout(env, request) {
  let token = request.headers.get("authorization") || "";
  if (token.toLowerCase().startsWith("bearer ")) token = token.slice(7).trim();
  if (token) await env.SESSIONS.delete(token);
  return ok({});
}
function domainState(project, cfg, now = Date.now()) {
  if (!project.domain_expires_at) return { state: "active", daysLeft: null, renewable: false, overdue: 0 };
  const exp = new Date(project.domain_expires_at).getTime();
  const daysLeft = Math.ceil((exp - now) / DAY);
  if (daysLeft > 0) {
    return { state: "active", daysLeft, renewable: false, overdue: 0, expiresAt: project.domain_expires_at };
  }
  const graceDays = Number(cfg.renew_grace_days);
  const overdue = Math.abs(daysLeft);
  if (overdue <= graceDays) {
    return { state: "grace", daysLeft, renewable: false, overdue, graceDays, expiresAt: project.domain_expires_at };
  }
  return { state: "expired", daysLeft, renewable: true, overdue, graceDays, expiresAt: project.domain_expires_at };
}
async function handleRenew(env, request, user, projectId) {
  const cfg = await getSettings(env);
  const p = await env.DB.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).bind(projectId, user.id).first();
  if (!p) return fail("\u9879\u76EE\u4E0D\u5B58\u5728", 404);
  const st = domainState(p, cfg);
  if (st.state === "active") return fail("\u57DF\u540D\u5C1A\u672A\u5230\u671F\uFF0C\u65E0\u9700\u7EED\u671F");
  if (!st.renewable) {
    return fail(`\u57DF\u540D\u5DF2\u8FC7\u671F ${st.overdue} \u5929\uFF0C\u9700\u8D85\u8FC7 ${st.graceDays} \u5929\u5BBD\u9650\u671F\u540E\u624D\u53EF\u7EED\u671F`);
  }
  const cost = Number(cfg.renew_cost);
  const urow = await env.DB.prepare(`SELECT credits FROM users WHERE id = ?`).bind(user.id).first();
  if ((urow.credits || 0) < cost) {
    return fail(`\u79EF\u5206\u4E0D\u8DB3\uFF1A\u7EED\u671F\u9700\u8981 ${cost} \u79EF\u5206\uFF0C\u5F53\u524D\u4F59\u989D ${urow.credits}`, 402);
  }
  const renewDays = Number(cfg.renew_days);
  const base = p.domain_expires_at ? new Date(p.domain_expires_at).getTime() : Date.now();
  const newExp = new Date(Math.max(base, Date.now()) + renewDays * DAY).toISOString();
  await env.DB.prepare(
    `UPDATE projects SET domain_expires_at = ?, renewed_count = renewed_count + 1, updated_at = ? WHERE id = ?`
  ).bind(newExp, nowIso(), p.id).run();
  const balance = await addCredits(env, user.id, -cost, "renew", `\u57DF\u540D\u7EED\u671F ${p.domain}\uFF08${renewDays} \u5929\uFF09`);
  return ok({
    project: { id: p.id, domain: p.domain, domain_expires_at: newExp, renewed_count: p.renewed_count + 1 },
    credits: balance,
    cost
  });
}
async function listProjects(env, user) {
  const cfg = await getSettings(env);
  const rows = await env.DB.prepare(
    `SELECT p.*, d.file_count, d.total_size, d.created_at AS deployed_at, d.credits_spent
     FROM projects p
     LEFT JOIN deployments d ON d.id = p.current_deployment_id
     WHERE p.user_id = ?
     ORDER BY p.updated_at DESC`
  ).bind(user.id).all();
  const projects = (rows.results || []).map((p) => {
    const st = domainState(p, cfg);
    return {
      ...p,
      slug: p.domain,
      path: sitePath(p.domain),
      url: siteUrl(env, p.domain),
      domain_state: st.state,
      days_left: st.daysLeft,
      renewable: st.renewable,
      overdue: st.overdue || 0,
      expires_at: p.domain_expires_at
    };
  });
  return ok({ projects });
}
function sanitizePath(p) {
  let path = String(p || "").replace(/\\/g, "/").trim();
  path = path.replace(/^\/+/, "");
  if (!path) path = "index.html";
  if (path.includes("..")) return null;
  if (path.length > 200) return null;
  return path;
}
async function handleCreateProject(env, request, user) {
  const body = await request.json().catch(() => ({}));
  const name = sanitizeSlug(body.name);
  if (!name) return fail("\u9879\u76EE\u540D\u79F0\u9700\u4E3A\u5B57\u6BCD\u3001\u6570\u5B57\u6216\u77ED\u6A2A\u7EBF");
  const dup = await env.DB.prepare(`SELECT id FROM projects WHERE user_id = ? AND name = ?`).bind(user.id, name).first();
  if (dup) return fail("\u540C\u540D\u9879\u76EE\u5DF2\u5B58\u5728", 409);
  const slug = await allocateDomain(env, name, user.id);
  const now = nowIso();
  const res = await env.DB.prepare(
    `INSERT INTO projects (user_id, name, domain, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`
  ).bind(user.id, name, slug, now, now).run();
  const projectId = Number(res.meta.last_row_id);
  await env.DB.prepare(`UPDATE domains SET project_id = ? WHERE domain = ?`).bind(projectId, slug).run();
  return ok({
    project: {
      id: projectId,
      name,
      slug,
      path: sitePath(slug),
      url: siteUrl(env, slug),
      status: "active",
      created_at: now,
      updated_at: now
    }
  });
}
async function deleteProjectFiles(env, deploymentId) {
  const manifest = await env.SITES.get(`dep:${deploymentId}:manifest`, "json");
  for (const path of Object.keys(manifest && manifest.files || {})) {
    await env.SITES.delete(`dep:${deploymentId}:f:${path}`);
  }
  await env.SITES.delete(`dep:${deploymentId}:manifest`);
}
async function handleDeleteProject(env, request, user, projectId) {
  const p = await env.DB.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).bind(projectId, user.id).first();
  if (!p) return fail("\u9879\u76EE\u4E0D\u5B58\u5728", 404);
  const deps = await env.DB.prepare(`SELECT id FROM deployments WHERE project_id = ?`).bind(projectId).all();
  for (const d of deps.results || []) await deleteProjectFiles(env, d.id);
  await env.DB.prepare(`DELETE FROM deployments WHERE project_id = ?`).bind(projectId).run();
  await env.DB.prepare(`DELETE FROM visits WHERE project_id = ?`).bind(projectId).run();
  await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(projectId).run();
  await env.DB.prepare(`DELETE FROM domains WHERE domain = ?`).bind(p.domain).run();
  return ok({});
}
async function handleDeploy(env, request, user) {
  const body = await request.json().catch(() => ({}));
  const cfg = await getSettings(env);
  const projectId = Number(body.project_id);
  const project = await env.DB.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).bind(projectId, user.id).first();
  if (!project) return fail("\u9879\u76EE\u4E0D\u5B58\u5728", 404);
  const st = domainState(project, cfg);
  if (st.state === "expired") {
    return fail(`\u57DF\u540D\u5DF2\u8FC7\u671F ${st.overdue} \u5929\uFF0C\u8BF7\u5148\u7EED\u671F\uFF08${cfg.renew_cost} \u79EF\u5206\uFF09\u540E\u518D\u90E8\u7F72`, 402);
  }
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) return fail("\u8BF7\u81F3\u5C11\u4E0A\u4F20\u4E00\u4E2A\u6587\u4EF6");
  const deployActivity = await getActiveActivity(env, "deploy_discount");
  const deployCost = deployActivity && deployActivity.value < Number(cfg.deploy_cost) ? Number(deployActivity.value) : Number(cfg.deploy_cost);
  const urow = await env.DB.prepare(`SELECT credits FROM users WHERE id = ?`).bind(user.id).first();
  if ((urow.credits || 0) < deployCost) {
    return fail(`\u79EF\u5206\u4E0D\u8DB3\uFF1A\u672C\u6B21\u90E8\u7F72\u9700\u8981 ${deployCost} \u79EF\u5206\uFF0C\u5F53\u524D\u4F59\u989D ${urow.credits}`, 402);
  }
  const prepared = [];
  const seen = /* @__PURE__ */ new Set();
  let totalSize = 0;
  for (const f of files) {
    const path = sanitizePath(f.path);
    if (!path) return fail("\u6587\u4EF6\u8DEF\u5F84\u4E0D\u5408\u6CD5");
    if (seen.has(path)) continue;
    seen.add(path);
    if (f.encoding === "base64") {
      const bytes = b64decode(f.content);
      totalSize += bytes.length;
      prepared.push({ path, b64: f.content, size: bytes.length, text: false });
    } else {
      const content = String(f.content == null ? "" : f.content);
      const bytes = new TextEncoder().encode(content);
      totalSize += bytes.length;
      prepared.push({ path, text: true, content, size: bytes.length });
    }
    if (totalSize > 20 * 1024 * 1024) return fail("\u5355\u4E2A\u9879\u76EE\u603B\u5927\u5C0F\u4E0D\u80FD\u8D85\u8FC7 20MB");
  }
  const hasIndex = prepared.some((f) => f.path === "index.html" || f.path === "index.htm");
  if (!hasIndex) {
    prepared.push({
      path: "index.html",
      text: true,
      size: 0,
      content: '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>\u7AD9\u70B9\u5DF2\u5C31\u7EEA</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"></head><body style="font-family:Segoe UI,Microsoft YaHei,sans-serif;background:#f8f9fa;padding:40px"><h3>\u90E8\u7F72\u6210\u529F</h3><p>\u8BE5\u7AD9\u70B9\u5C1A\u672A\u63D0\u4F9B index.html\uFF0C\u5E73\u53F0\u5DF2\u81EA\u52A8\u751F\u6210\u9ED8\u8BA4\u9996\u9875\u3002</p></body></html>'
    });
  }
  const now = nowIso();
  const depRes = await env.DB.prepare(
    `INSERT INTO deployments (project_id, user_id, file_count, total_size, credits_spent, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(project.id, user.id, prepared.length, totalSize, deployCost, now).run();
  const deploymentId = Number(depRes.meta.last_row_id);
  const finalManifest = { files: {}, createdAt: now };
  for (const f of prepared) {
    const key = `dep:${deploymentId}:f:${f.path}`;
    if (f.text) {
      await env.SITES.put(key, f.content);
      finalManifest.files[f.path] = { size: f.size, type: mimeOf(f.path), enc: "text" };
    } else {
      await env.SITES.put(key, f.b64);
      finalManifest.files[f.path] = { size: f.size, type: mimeOf(f.path), enc: "base64" };
    }
  }
  await env.SITES.put(`dep:${deploymentId}:manifest`, JSON.stringify(finalManifest));
  let expiresAt = project.domain_expires_at;
  if (!expiresAt) {
    expiresAt = new Date(Date.now() + Number(cfg.domain_valid_days) * DAY).toISOString();
  }
  await env.DB.prepare(
    `UPDATE projects SET current_deployment_id = ?, domain_expires_at = ?, updated_at = ?, status = 'active' WHERE id = ?`
  ).bind(deploymentId, expiresAt, now, project.id).run();
  const balance = await addCredits(env, user.id, -deployCost, "deploy", `\u90E8\u7F72\u9879\u76EE ${project.name}`);
  return ok({
    deployment: {
      id: deploymentId,
      project_id: project.id,
      file_count: prepared.length,
      total_size: totalSize,
      credits_spent: deployCost,
      created_at: now
    },
    credits: balance,
    domain_expires_at: expiresAt
  });
}
async function handleProjectFiles(env, request, user, projectId) {
  const p = await env.DB.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`).bind(projectId, user.id).first();
  if (!p) return fail("\u9879\u76EE\u4E0D\u5B58\u5728", 404);
  if (!p.current_deployment_id) return ok({ files: [] });
  const manifest = await env.SITES.get(`dep:${p.current_deployment_id}:manifest`, "json");
  const files = Object.entries(manifest && manifest.files || {}).map(([path, meta]) => ({
    path,
    size: meta.size,
    type: meta.type
  }));
  let content = null;
  const target = new URL(request.url).searchParams.get("path");
  if (target && files.some((f) => f.path === target)) {
    const raw = await env.SITES.get(`dep:${p.current_deployment_id}:f:${target}`);
    const meta = manifest.files[target];
    content = meta.enc === "base64" ? { encoding: "base64", content: raw } : { encoding: "text", content: raw };
  }
  return ok({ files, content, domain: p.domain, slug: p.domain, path: sitePath(p.domain), url: siteUrl(env, p.domain), domain_expires_at: p.domain_expires_at });
}
async function handleCredits(env, user) {
  const cfg = await getSettings(env);
  const logs = await env.DB.prepare(
    `SELECT delta, balance_after, type, note, created_at FROM credit_logs
     WHERE user_id = ? ORDER BY id DESC LIMIT 100`
  ).bind(user.id).all();
  const stats = await env.DB.prepare(
    `SELECT COUNT(*) AS deploys, COALESCE(SUM(credits_spent),0) AS spent FROM deployments WHERE user_id = ?`
  ).bind(user.id).first();
  const visits = await env.DB.prepare(`SELECT COUNT(*) AS total FROM visits WHERE user_id = ?`).bind(user.id).first();
  const invited = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users WHERE referred_by = ?`).bind(user.id).first();
  const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first();
  const siteCount = await env.DB.prepare(`SELECT COUNT(*) AS c FROM projects`).first();
  const totalVisits = await env.DB.prepare(`SELECT COUNT(*) AS c FROM visits`).first();
  return ok({
    credits: user.credits,
    logs: logs.results || [],
    stats: {
      deploys: stats.deploys,
      spent: stats.spent,
      visits: visits.total,
      invited: invited.c,
      platform_users: total.c,
      platform_sites: siteCount.c,
      platform_visits: totalVisits.c
    },
    pricing: {
      signup: Number(cfg.signup_credits),
      deploy: Number(cfg.deploy_cost),
      visit: Number(cfg.visit_cost),
      monthly: Number(cfg.monthly_gift),
      referral_referrer: Number(cfg.referral_referrer),
      referral_invitee: Number(cfg.referral_invitee),
      renew: Number(cfg.renew_cost),
      valid_days: Number(cfg.domain_valid_days),
      renew_days: Number(cfg.renew_days),
      grace_days: Number(cfg.renew_grace_days),
      recharge_min: Number(cfg.recharge_min)
    }
  });
}
async function handleInvite(env, user) {
  const cfg = await getSettings(env);
  const rows = await env.DB.prepare(
    `SELECT id, username, email, credits, created_at FROM users WHERE referred_by = ? ORDER BY id DESC`
  ).bind(user.id).all();
  const total = await env.DB.prepare(
    `SELECT COALESCE(SUM(delta),0) AS total FROM credit_logs WHERE user_id = ? AND type = 'referral'`
  ).bind(user.id).first();
  return ok({
    invite_code: user.invite_code,
    invite_url: `https://${env.PANEL_DOMAIN || "pages.subdns.cc"}/?ref=${user.invite_code}`,
    site_prefix: sitePath(""),
    reward_per_invite: Number(cfg.referral_referrer),
    invitee_reward: Number(cfg.referral_invitee),
    invited: rows.results || [],
    total_reward: total.total
  });
}
async function handleCreateOrder(env, request, user) {
  const body = await request.json().catch(() => ({}));
  const cfg = await getSettings(env);
  const amount = Number(body.amount);
  const method = String(body.method || "alipay").slice(0, 20);
  const contact = String(body.contact || "").slice(0, 120);
  if (!amount || isNaN(amount) || amount < Number(cfg.recharge_min)) {
    return fail(`\u6700\u4F4E\u5145\u503C\u91D1\u989D\u4E3A ${cfg.recharge_min} \u5143`);
  }
  if (amount > 1e5) return fail("\u5355\u7B14\u5145\u503C\u91D1\u989D\u4E0D\u80FD\u8D85\u8FC7 100000 \u5143");
  const credits = Math.round(amount * 100);
  const orderNo = `SP${Date.now()}${randId(4).toUpperCase()}`;
  const res = await env.DB.prepare(
    `INSERT INTO orders (user_id, order_no, amount, credits, method, contact, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).bind(user.id, orderNo, amount, credits, method, contact || null, nowIso()).run();
  return ok({
    order: {
      id: Number(res.meta.last_row_id),
      order_no: orderNo,
      amount,
      credits,
      method,
      contact,
      status: "pending",
      created_at: nowIso()
    }
  });
}
async function handleOrders(env, user) {
  const rows = await env.DB.prepare(`SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 50`).bind(user.id).all();
  return ok({ orders: rows.results || [] });
}
async function handleAdminStats(env) {
  const users = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first();
  const admins = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`).first();
  const sites = await env.DB.prepare(`SELECT COUNT(*) AS c FROM projects`).first();
  const visits = await env.DB.prepare(`SELECT COUNT(*) AS c FROM visits`).first();
  const orders = await env.DB.prepare(`SELECT COUNT(*) AS c FROM orders`).first();
  const pending = await env.DB.prepare(`SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'`).first();
  const credits = await env.DB.prepare(`SELECT COALESCE(SUM(credits),0) AS c FROM users`).first();
  const spent = await env.DB.prepare(`SELECT COALESCE(SUM(credits_spent),0) AS c FROM deployments`).first();
  const invited = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users WHERE referred_by IS NOT NULL`).first();
  return ok({
    stats: {
      users: users.c,
      admins: admins.c,
      sites: sites.c,
      visits: visits.c,
      orders: orders.c,
      pending_orders: pending.c,
      total_credits: credits.c,
      total_spent: spent.c,
      referred_users: invited.c
    },
    settings: await getSettings(env)
  });
}
async function handleAdminUsers(env, request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const size = Math.min(100, Math.max(10, Number(url.searchParams.get("size") || 20)));
  const offset = (page - 1) * size;
  let sql = `SELECT id, username, email, credits, primary_domain, invite_code, referred_by, role, status, created_at, last_gift_at FROM users`;
  const args = [];
  if (q) {
    sql += ` WHERE username LIKE ? OR email LIKE ? OR invite_code LIKE ?`;
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
  args.push(size, offset);
  const rows = await env.DB.prepare(sql).bind(...args).all();
  const cnt = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first();
  return ok({ users: rows.results || [], total: cnt.c, page, size });
}
async function handleAdminAdjustCredits(env, request, userId) {
  const body = await request.json().catch(() => ({}));
  const delta = Number(body.delta);
  const note = String(body.note || "\u7BA1\u7406\u5458\u8C03\u6574").slice(0, 200);
  if (!delta || isNaN(delta)) return fail("\u8BF7\u8F93\u5165\u6709\u6548\u7684\u79EF\u5206\u6570\u91CF");
  const u = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();
  if (!u) return fail("\u7528\u6237\u4E0D\u5B58\u5728", 404);
  const balance = await addCredits(env, userId, delta, "admin", note);
  return ok({ credits: balance });
}
async function handleAdminSetRole(env, request, userId) {
  const body = await request.json().catch(() => ({}));
  const role = String(body.role || "user");
  if (!["user", "admin"].includes(role)) return fail("\u89D2\u8272\u65E0\u6548");
  const u = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();
  if (!u) return fail("\u7528\u6237\u4E0D\u5B58\u5728", 404);
  await env.DB.prepare(`UPDATE users SET role = ? WHERE id = ?`).bind(role, userId).run();
  return ok({ role });
}
async function handleAdminSetStatus(env, request, userId) {
  const body = await request.json().catch(() => ({}));
  const status = String(body.status || "active");
  if (!["active", "banned"].includes(status)) return fail("\u72B6\u6001\u65E0\u6548");
  const u = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first();
  if (!u) return fail("\u7528\u6237\u4E0D\u5B58\u5728", 404);
  await env.DB.prepare(`UPDATE users SET status = ? WHERE id = ?`).bind(status, userId).run();
  return ok({ status });
}
async function handleAdminOrders(env, request) {
  const status = new URL(request.url).searchParams.get("status") || "";
  let sql = `SELECT o.*, u.username, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id`;
  const args = [];
  if (status) {
    sql += ` WHERE o.status = ?`;
    args.push(status);
  }
  sql += ` ORDER BY o.id DESC LIMIT 200`;
  const rows = await env.DB.prepare(sql).bind(...args).all();
  return ok({ orders: rows.results || [] });
}
async function handleAdminReviewOrder(env, request, orderId) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "approve");
  const note = String(body.note || "").slice(0, 200);
  const order = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(orderId).first();
  if (!order) return fail("\u8BA2\u5355\u4E0D\u5B58\u5728", 404);
  if (order.status !== "pending") return fail("\u8BA2\u5355\u5DF2\u5904\u7406", 409);
  if (action === "approve") {
    await addCredits(env, order.user_id, order.credits, "recharge", `\u5145\u503C\u5230\u8D26 ${order.amount} \u5143 / ${order.credits} \u79EF\u5206`);
    const rechargeActivity = await getActiveActivity(env, "recharge_bonus");
    let bonus = 0;
    if (rechargeActivity && rechargeActivity.value > 0) {
      bonus = Math.round(order.credits * (Number(rechargeActivity.value) / 100) * 100) / 100;
      if (bonus > 0) {
        await addCredits(
          env,
          order.user_id,
          bonus,
          "activity",
          `\u6D3B\u52A8\u300C${rechargeActivity.title}\u300D\u5145\u503C\u989D\u5916\u8D60\u9001 ${rechargeActivity.value}%`
        );
      }
    }
    await env.DB.prepare(`UPDATE orders SET status = 'approved', admin_note = ?, reviewed_at = ? WHERE id = ?`).bind(note || null, nowIso(), orderId).run();
    return ok({ status: "approved", bonus });
  }
  if (action === "reject") {
    await env.DB.prepare(`UPDATE orders SET status = 'rejected', admin_note = ?, reviewed_at = ? WHERE id = ?`).bind(note || null, nowIso(), orderId).run();
    return ok({ status: "rejected" });
  }
  return fail("\u64CD\u4F5C\u65E0\u6548");
}
async function handleAdminSettings(env, request) {
  if (request.method === "GET") return ok({ settings: await getSettings(env) });
  const body = await request.json().catch(() => ({}));
  const allowed = Object.keys(DEFAULT_SETTINGS);
  const updated = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (!allowed.includes(k)) continue;
    const num = Number(v);
    if (isNaN(num) || num < 0) return fail(`${k} \u5FC5\u987B\u662F\u975E\u8D1F\u6570\u5B57`);
    await setSetting(env, k, num);
    updated[k] = num;
  }
  return ok({ settings: await getSettings(env), updated });
}
async function handleAdminLogs(env, request) {
  const limit = Math.min(200, Number(new URL(request.url).searchParams.get("limit") || 50));
  const rows = await env.DB.prepare(
    `SELECT l.*, u.username FROM credit_logs l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT ?`
  ).bind(limit).all();
  return ok({ logs: rows.results || [] });
}
async function handleAdminProjects(env) {
  const rows = await env.DB.prepare(
    `SELECT p.*, u.username FROM projects p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.id DESC LIMIT 200`
  ).all();
  return ok({
    projects: (rows.results || []).map((p) => ({
      ...p,
      slug: p.domain,
      path: sitePath(p.domain),
      url: siteUrl(env, p.domain)
    }))
  });
}
async function handleAdminDeleteProject(env, request, projectId) {
  const p = await env.DB.prepare(`SELECT * FROM projects WHERE id = ?`).bind(projectId).first();
  if (!p) return fail("\u9879\u76EE\u4E0D\u5B58\u5728", 404);
  const deps = await env.DB.prepare(`SELECT id FROM deployments WHERE project_id = ?`).bind(projectId).all();
  for (const d of deps.results || []) await deleteProjectFiles(env, d.id);
  await env.DB.prepare(`DELETE FROM deployments WHERE project_id = ?`).bind(projectId).run();
  await env.DB.prepare(`DELETE FROM visits WHERE project_id = ?`).bind(projectId).run();
  await env.DB.prepare(`DELETE FROM projects WHERE id = ?`).bind(projectId).run();
  await env.DB.prepare(`DELETE FROM domains WHERE domain = ?`).bind(p.domain).run();
  return ok({});
}
async function handleAdminGrantGift(env) {
  const result = await grantMonthlyGifts(env, true);
  return ok(result);
}
async function handleAdminMakeAdmin(env, request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();
  if (!username || !password) return fail("\u8BF7\u586B\u5199\u7528\u6237\u540D\u548C\u5BC6\u7801");
  const existing = await env.DB.prepare(`SELECT id FROM users WHERE username = ?`).bind(username).first();
  if (existing) {
    await env.DB.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).bind(existing.id).run();
    return ok({ username, created: false });
  }
  const salt = randId(16);
  const hash = await hashPassword(password, salt);
  const inviteCode = randCode(8);
  const res = await env.DB.prepare(
    `INSERT INTO users (username, email, salt, password_hash, credits, invite_code, role, status, created_at)
     VALUES (?, ?, ?, ?, 0, ?, 'admin', 'active', ?)`
  ).bind(username, `${username}@subdns.cc`, salt, hash, inviteCode, nowIso()).run();
  const id = Number(res.meta.last_row_id);
  await allocateDomain(env, username, id);
  return ok({ username, created: true, id });
}
async function handleBootstrapAdmin(env, request) {
  const count = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`).first();
  if (count.c > 0) return fail("\u7CFB\u7EDF\u5DF2\u5B58\u5728\u7BA1\u7406\u5458\uFF0C\u65E0\u6CD5\u91CD\u590D\u521D\u59CB\u5316", 403);
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const email = String(body.email || "").trim().toLowerCase() || `${username}@subdns.cc`;
  const password = String(body.password || "");
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) return fail("\u7528\u6237\u540D\u9700\u4E3A 3-24 \u4F4D\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u3001\u70B9\u6216\u77ED\u6A2A\u7EBF");
  if (password.length < 6) return fail("\u5BC6\u7801\u81F3\u5C11 6 \u4F4D");
  const exists = await env.DB.prepare(`SELECT id FROM users WHERE username = ?`).bind(username).first();
  if (exists) return fail("\u7528\u6237\u540D\u5DF2\u5B58\u5728", 409);
  const salt = randId(16);
  const hash = await hashPassword(password, salt);
  const inviteCode = randCode(8);
  const res = await env.DB.prepare(
    `INSERT INTO users (username, email, salt, password_hash, credits, invite_code, role, status, created_at)
     VALUES (?, ?, ?, ?, 0, ?, 'admin', 'active', ?)`
  ).bind(username, email, salt, hash, inviteCode, nowIso()).run();
  const id = Number(res.meta.last_row_id);
  await allocateDomain(env, username, id);
  const token = await createSession(env, id);
  return ok({ token, username, role: "admin" });
}
async function handleBootstrapStatus(env) {
  const count = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin'`).first();
  return ok({ needs_bootstrap: count.c === 0 });
}
function activityState(activity, now = Date.now()) {
  if (!activity.start_time || !activity.end_time) return { state: "inactive" };
  const s = new Date(activity.start_time).getTime();
  const e = new Date(activity.end_time).getTime();
  const d = (/* @__PURE__ */ new Date()).getTime();
  if (d < s) return { state: "pending", daysLeft: Math.ceil((s - d) / DAY) };
  if (d > e) return { state: "expired", daysLeft: null, expired: true };
  return { state: "active", daysLeft: Math.ceil((e - d) / DAY) };
}
var ACTIVITY_TYPES = {
  signup_bonus: "\u6CE8\u518C\u989D\u5916\u8D60\u9001\u79EF\u5206",
  deploy_discount: "\u90E8\u7F72\u8D39\u7528\u51CF\u514D\uFF08value=\u6D3B\u52A8\u4EF7\uFF09",
  recharge_bonus: "\u5145\u503C\u989D\u5916\u8D60\u9001\uFF08value=\u767E\u5206\u6BD4\uFF09",
  visit_bonus: "\u8BBF\u95EE\u8FD4\u8FD8\u79EF\u5206\uFF08value=\u6BD4\u4F8B\uFF09",
  promo: "\u5C55\u793A\u578B\u63A8\u5E7F\u6D3B\u52A8",
  manual_claim: "\u624B\u52A8\u9886\u53D6\uFF08\u5956\u52B1\u6C60\u6A21\u5F0F\uFF09"
};
function normalizeActivity(row) {
  const st = activityState(row);
  return {
    ...row,
    type_label: ACTIVITY_TYPES[row.type] || row.type,
    runtime_state: st.state,
    days_left: st.daysLeft === void 0 ? null : st.daysLeft,
    expired: !!st.expired
  };
}
async function handleAdminCreateActivity(env, request) {
  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim().slice(0, 80);
  const description = String(body.description || "").trim().slice(0, 500);
  const type = String(body.type || "").trim();
  const value = Number(body.value);
  const start_time = String(body.start_time || "").trim();
  const end_time = String(body.end_time || "").trim();
  const target_users = String(body.target_users || "all").trim();
  const pool_total = Number(body.pool_total || 0);
  const pool_current = Number(body.pool_current || 0);
  if (!title) return fail("\u8BF7\u586B\u5199\u6D3B\u52A8\u6807\u9898");
  if (!ACTIVITY_TYPES[type]) return fail("\u6D3B\u52A8\u7C7B\u578B\u65E0\u6548");
  if (isNaN(value) || value < 0) return fail("\u6D3B\u52A8\u6570\u503C\u5FC5\u987B\u662F\u975E\u8D1F\u6570\u5B57");
  if (!start_time || !end_time) return fail("\u8BF7\u586B\u5199\u5F00\u59CB\u548C\u7ED3\u675F\u65F6\u95F4");
  if (new Date(end_time).getTime() <= new Date(start_time).getTime()) {
    return fail("\u7ED3\u675F\u65F6\u95F4\u5FC5\u987B\u665A\u4E8E\u5F00\u59CB\u65F6\u95F4");
  }
  const now = nowIso();
  const res = await env.DB.prepare(
    `INSERT INTO activities (title, description, type, value, pool_total, pool_current, start_time, end_time, status, target_users, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  ).bind(title, description, type, value, pool_total, pool_current, start_time, end_time, target_users, now, now).run();
  return ok({ id: Number(res.meta.last_row_id) });
}
async function handleAdminUpdateActivity(env, request, activityId) {
  const existing = await env.DB.prepare(`SELECT * FROM activities WHERE id = ?`).bind(activityId).first();
  if (!existing) return fail("\u6D3B\u52A8\u4E0D\u5B58\u5728", 404);
  const body = await request.json().catch(() => ({}));
  const title = body.title !== void 0 ? String(body.title).trim().slice(0, 80) : existing.title;
  const description = body.description !== void 0 ? String(body.description).trim().slice(0, 500) : existing.description;
  const type = body.type !== void 0 ? String(body.type).trim() : existing.type;
  const value = body.value !== void 0 ? Number(body.value) : existing.value;
  const pool_total = body.pool_total !== void 0 ? Number(body.pool_total) : existing.pool_total;
  const pool_current = body.pool_current !== void 0 ? Number(body.pool_current) : existing.pool_current;
  const start_time = body.start_time !== void 0 ? String(body.start_time).trim() : existing.start_time;
  const end_time = body.end_time !== void 0 ? String(body.end_time).trim() : existing.end_time;
  const status = body.status !== void 0 ? String(body.status).trim() : existing.status;
  const target_users = body.target_users !== void 0 ? String(body.target_users).trim() : existing.target_users;
  if (!title) return fail("\u8BF7\u586B\u5199\u6D3B\u52A8\u6807\u9898");
  if (!ACTIVITY_TYPES[type]) return fail("\u6D3B\u52A8\u7C7B\u578B\u65E0\u6548");
  if (isNaN(value) || value < 0) return fail("\u6D3B\u52A8\u6570\u503C\u5FC5\u987B\u662F\u975E\u8D1F\u6570\u5B57");
  if (!["active", "paused", "exhausted"].includes(status)) return fail("\u72B6\u6001\u65E0\u6548");
  if (new Date(end_time).getTime() <= new Date(start_time).getTime()) {
    return fail("\u7ED3\u675F\u65F6\u95F4\u5FC5\u987B\u665A\u4E8E\u5F00\u59CB\u65F6\u95F4");
  }
  await env.DB.prepare(
    `UPDATE activities SET title = ?, description = ?, type = ?, value = ?, pool_total = ?, pool_current = ?,
       start_time = ?, end_time = ?, status = ?, target_users = ?, updated_at = ? WHERE id = ?`
  ).bind(title, description, type, value, pool_total, pool_current, start_time, end_time, status, target_users, nowIso(), activityId).run();
  return ok({ id: activityId });
}
async function handleAdminDeleteActivity(env, request, activityId) {
  const existing = await env.DB.prepare(`SELECT id FROM activities WHERE id = ?`).bind(activityId).first();
  if (!existing) return fail("\u6D3B\u52A8\u4E0D\u5B58\u5728", 404);
  await env.DB.prepare(`DELETE FROM activity_claims WHERE activity_id = ?`).bind(activityId).run();
  await env.DB.prepare(`DELETE FROM activities WHERE id = ?`).bind(activityId).run();
  return ok({ deleted: activityId });
}
async function handleActivityClaim(env, request, user) {
  const body = await request.json().catch(() => ({}));
  const activityId = Number(body.activity_id);
  const activity = await env.DB.prepare(`SELECT * FROM activities WHERE id = ?`).bind(activityId).first();
  if (!activity) return fail("\u6D3B\u52A8\u4E0D\u5B58\u5728", 404);
  const st = activityState(activity);
  if (st.state !== "active") {
    return fail(`\u6D3B\u52A8\u72B6\u6001\u5F02\u5E38\uFF1A${st.state === "expired" ? "\u5DF2\u7ED3\u675F" : "\u5C1A\u672A\u5F00\u59CB"}`);
  }
  const existingClaim = await env.DB.prepare(
    `SELECT id FROM activity_claims WHERE activity_id = ? AND user_id = ?`
  ).bind(activityId, user.id).first();
  if (existingClaim) return fail("\u60A8\u5DF2\u9886\u53D6\u8FC7\u6B64\u6D3B\u52A8\u5956\u52B1\uFF0C\u6BCF\u4E2A\u8D26\u53F7\u9650\u9886 1 \u6B21");
  const poolTotal = Number(activity.pool_total) || 0;
  const poolCurrent = Number(activity.pool_current) || 0;
  if (poolTotal > 0 && poolCurrent >= poolTotal) {
    return fail("\u6D3B\u52A8\u5956\u52B1\u5DF2\u53D1\u5B8C");
  }
  const value = Number(activity.value) || 0;
  if (value <= 0) return fail("\u6D3B\u52A8\u5956\u52B1\u6570\u503C\u65E0\u6548");
  const uRow = await env.DB.prepare(
    `SELECT email_verified, phone_verified, real_name_verified FROM users WHERE id = ?`
  ).bind(user.id).first();
  if (uRow) {
    const verified = uRow.email_verified || uRow.phone_verified || uRow.real_name_verified;
    if (!verified) {
      return fail("\u8BF7\u5148\u5B8C\u6210\u90AE\u7BB1\u3001\u624B\u673A\u6216\u5B9E\u540D\u9A8C\u8BC1\u540E\u518D\u9886\u53D6");
    }
  }
  const now = nowIso();
  const balance = await addCredits(
    env,
    user.id,
    value,
    "activity",
    `\u6D3B\u52A8\u300C${activity.title}\u300D\u9886\u53D6 ${value} \u79EF\u5206`
  );
  await env.DB.prepare(
    `INSERT INTO activity_claims (activity_id, user_id, amount, created_at)
     VALUES (?, ?, ?, ?)`
  ).bind(activityId, user.id, value, now).run();
  const newPoolCurrent = poolCurrent + value;
  await env.DB.prepare(
    `UPDATE activities SET pool_current = ?, updated_at = ? WHERE id = ?`
  ).bind(newPoolCurrent, now, activityId).run();
  const isExhausted = poolTotal > 0 && newPoolCurrent >= poolTotal;
  if (isExhausted) {
    await env.DB.prepare(`UPDATE activities SET status = 'exhausted', updated_at = ? WHERE id = ?`).bind(now, activityId).run();
  }
  return ok({
    credits: balance,
    awarded: value,
    activity: {
      id: activity.id,
      title: activity.title,
      pool_total,
      pool_current: newPoolCurrent,
      exhausted: isExhausted
    }
  });
}
async function handleActivityClaimStatus(env, request, user, activityId) {
  const activity = await env.DB.prepare(`SELECT * FROM activities WHERE id = ?`).bind(activityId).first();
  if (!activity) return fail("\u6D3B\u52A8\u4E0D\u5B58\u5728", 404);
  const claim = await env.DB.prepare(
    `SELECT id, amount, created_at FROM activity_claims WHERE activity_id = ? AND user_id = ?`
  ).bind(activityId, user.id).first();
  const st = activityState(activity);
  const poolTotal = Number(activity.pool_total) || 0;
  const poolCurrent = Number(activity.pool_current) || 0;
  return ok({
    activity: {
      id: activity.id,
      title: activity.title,
      description: activity.description,
      type: activity.type,
      value: activity.value,
      pool_total: poolTotal,
      pool_current: poolCurrent,
      exhausted: poolTotal > 0 && poolCurrent >= poolTotal,
      status: activity.status,
      start_time: activity.start_time,
      end_time: activity.end_time
    },
    claimed: !!claim,
    claim,
    runtime_state: st.state,
    days_left: st.daysLeft
  });
}
async function handleAdminActivities(env) {
  const rows = await env.DB.prepare(
    `SELECT id, title, description, type, value, status, target_users, start_time, end_time, created_at, updated_at
     FROM activities ORDER BY created_at DESC LIMIT 200`
  ).all();
  return ok({ activities: (rows.results || []).map(normalizeActivity), types: ACTIVITY_TYPES });
}
async function handleGetActivities(env) {
  const rows = await env.DB.prepare(
    `SELECT id, title, description, type, value, status, target_users, start_time, end_time
     FROM activities WHERE status = 'active' ORDER BY created_at DESC LIMIT 50`
  ).all();
  const items = (rows.results || []).map(normalizeActivity).filter((a) => a.runtime_state !== "expired");
  return ok({ activities: items, types: ACTIVITY_TYPES });
}
async function getActiveActivity(env, type) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const row = await env.DB.prepare(
    `SELECT * FROM activities
     WHERE status = 'active' AND type = ? AND start_time <= ? AND end_time >= ?
     ORDER BY end_time ASC LIMIT 1`
  ).bind(type, now, now).first();
  return row || null;
}
function isDocumentRequest(pathname) {
  const p = pathname.replace(/\/+$/, "");
  if (!p || p === "") return true;
  const lower = p.toLowerCase();
  return lower.endsWith(".html") || lower.endsWith(".htm") || !lower.includes(".");
}
var PANEL_HTML_HEAD = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
<style>body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;background:#f8f9fa}</style></head><body>`;
function panelPage(title, body) {
  return `${PANEL_HTML_HEAD}<div class="container mt-4"><div class="card text-center"><div class="card-body">
<h3>${title}</h3><p class="text-muted">${body}</p>
<a class="btn btn-primary" href="/">\u524D\u5F80 subdns Pages \u63A7\u5236\u53F0</a>
</div></div></div></body></html>`;
}
async function serveUserSite(env, request, slug, restPath) {
  const cfg = await getSettings(env);
  const project = await env.DB.prepare(`SELECT * FROM projects WHERE domain = ?`).bind(slug).first();
  if (!project) {
    return new Response(
      panelPage('<i class="fas fa-globe me-2"></i>\u7AD9\u70B9\u4E0D\u5B58\u5728', `\u7AD9\u70B9 ${slug} \u5C1A\u672A\u90E8\u7F72\u4EFB\u4F55\u5185\u5BB9\u3002`),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  const st = domainState(project, cfg);
  if (st.state === "expired") {
    return new Response(
      panelPage(
        '<i class="fas fa-clock-rotate-left me-2 text-danger"></i>\u7AD9\u70B9\u5DF2\u8FC7\u671F',
        `\u7AD9\u70B9 ${slug} \u5DF2\u8FC7\u671F ${st.overdue} \u5929\uFF0C\u8D85\u8FC7 ${st.graceDays} \u5929\u7EED\u8D39\u5BBD\u9650\u671F\uFF0C\u7AD9\u70B9\u5DF2\u505C\u6B62\u670D\u52A1\u3002\u8BF7\u767B\u5F55\u63A7\u5236\u53F0\u7EED\u671F\uFF08${cfg.renew_cost} \u79EF\u5206\uFF0C\u7EED\u671F ${cfg.renew_days} \u5929\uFF09\u3002`
      ),
      { status: 410, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  const owner = await env.DB.prepare(`SELECT id, username, credits FROM users WHERE id = ?`).bind(project.user_id).first();
  const url = new URL(request.url);
  if (isDocumentRequest(restPath)) {
    const visitCost = Number(cfg.visit_cost);
    if (owner && (owner.credits || 0) >= visitCost) {
      await addCredits(env, project.user_id, -visitCost, "visit", `\u7AD9\u70B9\u8BBF\u95EE ${slug}`);
      await env.DB.prepare(`UPDATE projects SET visits = visits + 1 WHERE id = ?`).bind(project.id).run();
      await env.DB.prepare(`INSERT INTO visits (project_id, user_id, cost, created_at) VALUES (?, ?, ?, ?)`).bind(project.id, project.user_id, visitCost, nowIso()).run();
    } else if (owner) {
      return new Response(
        panelPage(
          '<i class="fas fa-pause-circle me-2 text-warning"></i>\u7AD9\u70B9\u5DF2\u6682\u505C',
          "\u7AD9\u70B9\u6240\u6709\u8005\u79EF\u5206\u4E0D\u8DB3\uFF0C\u8BBF\u95EE\u670D\u52A1\u5DF2\u6682\u505C\uFF0C\u8BF7\u5145\u503C\u6216\u7B49\u5F85\u6BCF\u6708\u8D60\u9001\u79EF\u5206\u3002"
        ),
        { status: 402, headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }
  }
  if (!project.current_deployment_id) {
    return new Response(
      panelPage('<i class="fas fa-folder-open me-2"></i>\u6682\u65E0\u5185\u5BB9', "\u8BE5\u7AD9\u70B9\u5C1A\u672A\u90E8\u7F72\u4EFB\u4F55\u5185\u5BB9\u3002"),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  const manifest = await env.SITES.get(`dep:${project.current_deployment_id}:manifest`, "json");
  const files = manifest && manifest.files || {};
  let path = decodeURIComponent(restPath || "").replace(/^\/+/, "");
  if (!path) path = "index.html";
  if (!files[path]) {
    if (files[`${path}/index.html`]) path = `${path}/index.html`;
    else if (path.endsWith("/")) path = `${path}index.html`;
  }
  if (!files[path]) {
    return new Response(
      panelPage('<i class="fas fa-file-circle-question me-2"></i>404', `\u9875\u9762\u4E0D\u5B58\u5728\uFF1A/${path}`),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }
  const meta = files[path];
  const raw = await env.SITES.get(`dep:${project.current_deployment_id}:f:${path}`);
  let body = meta.enc === "base64" ? b64decode(raw) : raw;
  if ((meta.type || "").includes("text/html") && typeof body === "string") {
    const baseHref = sitePath(slug) + "/";
    if (!/<base\s/i.test(body)) {
      body = body.replace(/<head([^>]*)>/i, `<head$1><base href="${baseHref}">`);
    }
    if (st.state === "grace") {
      const banner = `<div style="background:#fff3cd;border-bottom:1px solid #ffe69c;padding:8px 12px;font-size:13px;text-align:center">
\u7AD9\u70B9\u5DF2\u8FC7\u671F ${st.overdue} \u5929\uFF0C\u8BF7\u5728 ${st.graceDays} \u5929\u5BBD\u9650\u671F\u5185\u7EED\u671F\uFF08${cfg.renew_cost} \u79EF\u5206\uFF09</div>`;
      body = body.replace(/<body([^>]*)>/i, `<body$1>${banner}`);
    }
  }
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": meta.type || "application/octet-stream",
      "cache-control": "public, max-age=60",
      "x-subdns-site": slug
    }
  });
}
async function handleApi(env, request, url) {
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = request.method.toUpperCase();
  if (path === "/register" && method === "POST") return handleRegister(env, request);
  if (path === "/login" && method === "POST") return handleLogin(env, request);
  if (path === "/logout" && method === "POST") return handleLogout(env, request);
  if (path === "/me" && method === "GET") {
    const user = await getUserFromRequest(env, request);
    if (!user) return fail("\u672A\u767B\u5F55", 401);
    const cfg = await getSettings(env);
    const deployActivity = await getActiveActivity(env, "deploy_discount");
    return ok({
      user,
      pricing: {
        signup: Number(cfg.signup_credits),
        deploy: deployActivity && deployActivity.value < Number(cfg.deploy_cost) ? Number(deployActivity.value) : Number(cfg.deploy_cost),
        visit: Number(cfg.visit_cost),
        monthly: Number(cfg.monthly_gift),
        referral_referrer: Number(cfg.referral_referrer),
        referral_invitee: Number(cfg.referral_invitee),
        renew: Number(cfg.renew_cost),
        valid_days: Number(cfg.domain_valid_days),
        renew_days: Number(cfg.renew_days),
        grace_days: Number(cfg.renew_grace_days),
        recharge_min: Number(cfg.recharge_min)
      }
    });
  }
  if (path === "/projects" && method === "GET") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return listProjects(env, user);
  }
  if (path === "/projects" && method === "POST") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleCreateProject(env, request, user);
  }
  if (path.startsWith("/projects/") && path.endsWith("/files") && method === "GET") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleProjectFiles(env, request, user, Number(path.split("/")[2]));
  }
  if (path.startsWith("/projects/") && path.endsWith("/renew") && method === "POST") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleRenew(env, request, user, Number(path.split("/")[2]));
  }
  if (path.startsWith("/projects/") && path.endsWith("/deploy") && method === "POST") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleDeploy(env, request, user);
  }
  if (path.startsWith("/projects/") && method === "DELETE") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleDeleteProject(env, request, user, Number(path.split("/")[2]));
  }
  if (path === "/credits" && method === "GET") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleCredits(env, user);
  }
  if (path === "/invite" && method === "GET") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleInvite(env, user);
  }
  if (path === "/orders" && method === "GET") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleOrders(env, user);
  }
  if (path === "/orders" && method === "POST") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleCreateOrder(env, request, user);
  }
  if (path === "/stats" && method === "GET") {
    const total = await env.DB.prepare(`SELECT COUNT(*) AS c FROM users`).first();
    const sites = await env.DB.prepare(`SELECT COUNT(*) AS c FROM projects`).first();
    const visits = await env.DB.prepare(`SELECT COUNT(*) AS c FROM visits`).first();
    return ok({ users: total.c, sites: sites.c, visits: visits.c });
  }
  if (path === "/activities" && method === "GET") return handleGetActivities(env);
  const claimMatch = path.match(/^\/activities\/(\d+)\/claim$/);
  if (claimMatch && method === "POST") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleActivityClaim(env, request, user, Number(claimMatch[1]));
  }
  const claimStatusMatch = path.match(/^\/activities\/(\d+)\/claim-status$/);
  if (claimStatusMatch && method === "GET") {
    const { user, error } = await requireUser(env, request);
    if (error) return error;
    return handleActivityClaimStatus(env, request, user, Number(claimStatusMatch[1]));
  }
  if (path === "/bootstrap" && method === "GET") return handleBootstrapStatus(env);
  if (path === "/bootstrap" && method === "POST") return handleBootstrapAdmin(env, request);
  if (path.startsWith("/admin/")) {
    const { user, error } = await requireAdmin(env, request);
    if (error) return error;
    if (path === "/admin/stats" && method === "GET") return handleAdminStats(env);
    if (path === "/admin/users" && method === "GET") return handleAdminUsers(env, request);
    if (path === "/admin/projects" && method === "GET") return handleAdminProjects(env);
    if (path === "/admin/logs" && method === "GET") return handleAdminLogs(env, request);
    if (path === "/admin/orders" && method === "GET") return handleAdminOrders(env, request);
    if (path === "/admin/settings" && method === "GET") return handleAdminSettings(env, request);
    if (path === "/admin/settings" && method === "POST") return handleAdminSettings(env, request);
    if (path === "/admin/grant-gift" && method === "POST") return handleAdminGrantGift(env);
    if (path === "/admin/make-admin" && method === "POST") return handleAdminMakeAdmin(env, request);
    if (path === "/admin/review-order" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      return handleAdminReviewOrder(env, request, Number(body.order_id));
    }
    if (path === "/admin/adjust-credits" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      return handleAdminAdjustCredits(env, request, Number(body.user_id));
    }
    if (path === "/admin/set-role" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      return handleAdminSetRole(env, request, Number(body.user_id));
    }
    if (path === "/admin/set-status" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      return handleAdminSetStatus(env, request, Number(body.user_id));
    }
    if (path === "/admin/delete-project" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      return handleAdminDeleteProject(env, request, Number(body.project_id));
    }
    if (path === "/admin/activities" && method === "GET") return handleAdminActivities(env);
    if (path === "/admin/activities" && method === "POST") return handleAdminCreateActivity(env, request);
    const actMatch = path.match(/^\/admin\/activities\/(\d+)$/);
    if (actMatch && method === "PUT") return handleAdminUpdateActivity(env, request, Number(actMatch[1]));
    if (actMatch && method === "DELETE") return handleAdminDeleteActivity(env, request, Number(actMatch[1]));
    return fail("\u7BA1\u7406\u63A5\u53E3\u4E0D\u5B58\u5728", 404);
  }
  return fail("\u63A5\u53E3\u4E0D\u5B58\u5728", 404);
}
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const root = (env.SITE_BASE_DOMAIN || "pages.subdns.cc").toLowerCase();
    const panelHost = (env.PANEL_DOMAIN || root).toLowerCase();
    try {
      await ensureSchema(env);
    } catch (e) {
      return new Response("Database init failed: " + e.message, { status: 500 });
    }
    if (url.pathname.startsWith("/api")) {
      try {
        return await handleApi(env, request, url);
      } catch (e) {
        return fail("\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF: " + e.message, 500);
      }
    }
    if (url.pathname.startsWith(SITE_PATH_PREFIX)) {
      const rest = url.pathname.slice(SITE_PATH_PREFIX.length);
      const slash = rest.indexOf("/");
      const slug = decodeURIComponent(slash >= 0 ? rest.slice(0, slash) : rest);
      const remainder = slash >= 0 ? rest.slice(slash) : "";
      if (!slug) {
        return new Response(
          panelPage('<i class="fas fa-compass me-2"></i>\u672A\u6307\u5B9A\u7AD9\u70B9', "\u8BF7\u901A\u8FC7 /pages/main/\u7AD9\u70B9\u540D \u8BBF\u95EE\u4F60\u7684\u7AD9\u70B9\u3002"),
          { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
        );
      }
      try {
        return await serveUserSite(env, request, slug, remainder);
      } catch (e) {
        return new Response("Site error: " + e.message, { status: 500 });
      }
    }
    const isPanel = host === panelHost || host.endsWith(".workers.dev") || host === "localhost" || host.startsWith("127.");
    if (isPanel) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(grantMonthlyGifts(env));
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map