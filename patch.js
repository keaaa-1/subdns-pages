const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\Users\\Administrator\\Desktop\\部署配置平台';
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => fs.writeFileSync(path.join(ROOT, p), s, 'utf8');

function must(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error('MISSING: ' + label);
}

/* ---------------- src/index.js ---------------- */
let src = read('src/index.js');

// 1) create activity: add pool columns
const oldCreate = `  const target_users = String(body.target_users || "all").trim();
  if (!title) return fail("\\u8BF7\\u586B\\u5199\\u6D3B\\u52A8\\u6807\\u9898");`;
must(src, oldCreate, 'create-activity head');
src = src.replace(oldCreate, `  const target_users = String(body.target_users || "all").trim();
  const pool_total = Number(body.pool_total || 0);
  const pool_current = Number(body.pool_current || 0);
  if (!title) return fail("\\u8BF7\\u586B\\u5199\\u6D3B\\u52A8\\u6807\\u9898");`);

const oldInsert = `    \`INSERT INTO activities (title, description, type, value, start_time, end_time, status, target_users, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)\`
  ).bind(title, description, type, value, start_time, end_time, target_users, now, now).run();`;
must(src, oldInsert, 'create insert');
src = src.replace(oldInsert, `    \`INSERT INTO activities (title, description, type, value, pool_total, pool_current, start_time, end_time, status, target_users, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)\`
  ).bind(title, description, type, value, pool_total, pool_current, start_time, end_time, target_users, now, now).run();`);

// 2) update activity: pool fields
const oldUpdHead = `  const value = body.value !== void 0 ? Number(body.value) : existing.value;
  const start_time = body.start_time !== void 0 ? String(body.start_time).trim() : existing.start_time;`;
must(src, oldUpdHead, 'update head');
src = src.replace(oldUpdHead, `  const value = body.value !== void 0 ? Number(body.value) : existing.value;
  const pool_total = body.pool_total !== void 0 ? Number(body.pool_total) : existing.pool_total;
  const pool_current = body.pool_current !== void 0 ? Number(body.pool_current) : existing.pool_current;
  const start_time = body.start_time !== void 0 ? String(body.start_time).trim() : existing.start_time;`);

const oldStatus = `  if (!["active", "paused"].includes(status)) return fail("\\u72B6\\u6001\\u65E0\\u6548");`;
must(src, oldStatus, 'status check');
src = src.replace(oldStatus, `  if (!["active", "paused", "exhausted"].includes(status)) return fail("\\u72B6\\u6001\\u65E0\\u6548");`);

const oldUpdSql = `    \`UPDATE activities SET title = ?, description = ?, type = ?, value = ?, start_time = ?, end_time = ?,
       status = ?, target_users = ?, updated_at = ? WHERE id = ?\`
  ).bind(title, description, type, value, start_time, end_time, status, target_users, nowIso(), activityId).run();`;
must(src, oldUpdSql, 'update sql');
src = src.replace(oldUpdSql, `    \`UPDATE activities SET title = ?, description = ?, type = ?, value = ?, pool_total = ?, pool_current = ?,
       start_time = ?, end_time = ?, status = ?, target_users = ?, updated_at = ? WHERE id = ?\`
  ).bind(title, description, type, value, pool_total, pool_current, start_time, end_time, status, target_users, nowIso(), activityId).run();`);

src = src.replace(/snbdns/g, 'subdns');
write('src/index.js', src);

/* ---------------- public/index.html ---------------- */
let html = read('public/index.html');

const oldForm = `                                    <div class="col-md-3"><label class="form-label">数值</label><input type="number" class="form-control" id="actValue" step="0.01" value="50"></div>
                                    <div class="col-md-3"><label class="form-label">开始时间</label><input type="datetime-local" class="form-control" id="actStart"></div>
                                    <div class="col-md-3"><label class="form-label">结束时间</label><input type="datetime-local" class="form-control" id="actEnd"></div>`;
must(html, oldForm, 'activity form');
html = html.replace(oldForm, `                                    <div class="col-md-3"><label class="form-label">单次奖励</label><input type="number" class="form-control" id="actValue" step="0.01" value="50"></div>
                                    <div class="col-md-3"><label class="form-label">奖池总额</label><input type="number" class="form-control" id="actPoolTotal" step="1" value="0" placeholder="0=不限制"></div>
                                    <div class="col-md-3"><label class="form-label">已发放</label><input type="number" class="form-control" id="actPoolCurrent" step="1" value="0"></div>
                                    <div class="col-md-3"><label class="form-label">开始时间</label><input type="datetime-local" class="form-control" id="actStart"></div>
                                    <div class="col-md-3"><label class="form-label">结束时间</label><input type="datetime-local" class="form-control" id="actEnd"></div>`);

const oldTh = `<thead><tr><th>ID</th><th>标题</th><th>类型</th><th>数值</th><th>时间</th><th>状态</th><th style="text-align:right">操作</th></tr></thead>`;
must(html, oldTh, 'activity table head');
html = html.replace(oldTh, `<thead><tr><th>ID</th><th>标题</th><th>类型</th><th>单次奖励</th><th>奖池总额</th><th>已发放</th><th>时间</th><th>状态</th><th style="text-align:right">操作</th></tr></thead>`);

html = html.replace(/snbdns/g, 'subdns');
write('public/index.html', html);

/* ---------------- public/app.js ---------------- */
let app = read('public/app.js');

const oldReset = `    if ($('actValue')) $('actValue').value = '50';
    if ($('actType')) $('actType').value = 'signup_bonus';`;
must(app, oldReset, 'reset form');
app = app.replace(oldReset, `    if ($('actValue')) $('actValue').value = '50';
    if ($('actPoolTotal')) $('actPoolTotal').value = '0';
    if ($('actPoolCurrent')) $('actPoolCurrent').value = '0';
    if ($('actType')) $('actType').value = 'signup_bonus';`);

const oldEdit = `    $('actValue').value = a.value;
    $('actTarget').value = a.target_users || 'all';`;
must(app, oldEdit, 'edit form');
app = app.replace(oldEdit, `    $('actValue').value = a.value;
    if ($('actPoolTotal')) $('actPoolTotal').value = a.pool_total || 0;
    if ($('actPoolCurrent')) $('actPoolCurrent').value = a.pool_current || 0;
    $('actTarget').value = a.target_users || 'all';`);

const oldPayload = `      value: Number($('actValue').value),
      start_time: new Date($('actStart').value).toISOString(),`;
must(app, oldPayload, 'payload');
app = app.replace(oldPayload, `      value: Number($('actValue').value),
      pool_total: Number($('actPoolTotal').value || 0),
      pool_current: Number($('actPoolCurrent').value || 0),
      start_time: new Date($('actStart').value).toISOString(),`);

const oldRow = `        '<td>' + a.value + '</td>' +
        '<td style="font-size:.76rem;white-space:nowrap">' + fmtTime(a.start_time) + '<br>' + fmtTime(a.end_time) + '</td>' +`;
must(app, oldRow, 'admin row');
app = app.replace(oldRow, `        '<td>' + a.value + '</td>' +
        '<td>' + Number(a.pool_total || 0).toLocaleString() + '</td>' +
        '<td>' + Number(a.pool_current || 0).toLocaleString() + '</td>' +
        '<td style="font-size:.76rem;white-space:nowrap">' + fmtTime(a.start_time) + '<br>' + fmtTime(a.end_time) + '</td>' +`);

app = app.replace(/snbdns/g, 'subdns');
write('public/app.js', app);

/* ---------------- wrangler.toml ---------------- */
let toml = read('wrangler.toml');
toml = toml.replace(/name = "subdns-pages"/, 'name = "snbdns-pages"');
toml = toml.replace(/snbdns/g, 'subdns');
// 保持已存在的 worker 名称，避免自定义域名重新绑定
toml = toml.replace(/name = "subdns-pages"/, 'name = "snbdns-pages"');
write('wrangler.toml', toml);

console.log('PATCH OK');
