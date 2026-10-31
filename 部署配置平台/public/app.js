/* subdns Pages - 前端控制台脚本 v2 */
(function () {
  'use strict';

  const API = '/api';
  const state = {
    token: localStorage.getItem('sp_token') || '',
    user: null,
    projects: [],
    pricing: {},
    deployFiles: [],
    deployProject: null,
    renewProject: null,
    editingActivity: null,
  };

  const $ = (id) => document.getElementById(id);

  function setToken(t) {
    state.token = t || '';
    if (t) localStorage.setItem('sp_token', t);
    else localStorage.removeItem('sp_token');
  }

  async function api(path, options = {}) {
    const opts = { method: options.method || 'GET', headers: {} };
    if (options.body !== undefined) {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(options.body);
    }
    if (state.token) opts.headers['authorization'] = 'Bearer ' + state.token;
    const res = await fetch(API + path, opts);
    let data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok || data.ok === false) {
      if (res.status === 401 && state.token) {
        setToken('');
        state.user = null;
        renderAuth();
      }
      throw new Error(data.error || ('请求失败 (' + res.status + ')'));
    }
    return data;
  }

  /**
   * 获取 Bootstrap Modal 实例。
   * getInstance() 对「从未通过 data-bs-toggle 打开过」的弹窗会返回 null，
   * 因此统一走 getOrCreateInstance()，避免 .show() 抛错导致弹窗打不开。
   */
  function modalOf(id) {
    const el = $(id);
    if (!el) return null;
    return bootstrap.Modal.getOrCreateInstance(el);
  }

  function showModal(id) {
    const m = modalOf(id);
    if (m) m.show();
    return m;
  }

  function hideModal(id) {
    const m = modalOf(id);
    if (m) m.hide();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function fmtSize(bytes) {
    const b = Number(bytes || 0);
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(2) + ' KB';
    return (b / 1024 / 1024).toFixed(2) + ' MB';
  }

  function fmtTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function toast(message, type = 'success') {
    const wrap = $('toastArea');
    const el = document.createElement('div');
    el.className = 'alert alert-' + type + ' shadow-sm';
    el.style.minWidth = '240px';
    el.innerHTML = escapeHtml(message);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn-close float-end';
    close.addEventListener('click', () => el.remove());
    el.appendChild(close);
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function showError(id, message) {
    const el = $(id);
    if (!el) return;
    el.textContent = message;
    el.classList.remove('d-none');
  }

  function clearError(id) {
    const el = $(id);
    if (!el) return;
    el.textContent = '';
    el.classList.add('d-none');
  }

  /* ---------------- 定价展示 ---------------- */

  function renderPricing(p) {
    state.pricing = p || {};
    const map = {
      pSignup: 'signup', pDeploy: 'deploy', pVisit: 'visit', pMonthly: 'monthly',
      pRefRef: 'referral_referrer', pRefNew: 'referral_invitee', pRenewCost: 'renew',
      pValidDays: 'valid_days', pRenewDays: 'renew_days', pGrace: 'grace_days',
    };
    for (const [elId, key] of Object.entries(map)) {
      const el = $(elId);
      if (el && p && p[key] !== undefined) el.textContent = p[key];
    }
    if (p) {
      if ($('guestSignup') && p.signup !== undefined) $('guestSignup').textContent = p.signup;
      if ($('guestDeploy') && p.deploy !== undefined) $('guestDeploy').textContent = p.deploy;
    }
    const gift = $('statGift');
    if (gift && p && p.monthly !== undefined) gift.textContent = p.monthly;
  }

  /* ---------------- 认证 ---------------- */

  async function doLogin() {
    clearError('loginError');
    const account = $('loginAccount').value.trim();
    const password = $('loginPassword').value;
    if (!account || !password) {
      showError('loginError', '请填写用户名/邮箱和密码');
      return;
    }
    try {
      const data = await api('/login', { method: 'POST', body: { username: account, password } });
      setToken(data.token);
      state.user = data.user;
      hideModal('loginModal');
      $('loginPassword').value = '';
      toast('欢迎回来，' + data.user.username);
      await refreshAll();
    } catch (e) {
      showError('loginError', e.message);
    }
  }

  async function doRegister() {
    clearError('registerError');
    const username = $('regUsername').value.trim();
    const email = $('regEmail').value.trim();
    const password = $('regPassword').value;
    const ref = $('regRef').value.trim();
    try {
      const data = await api('/register', { method: 'POST', body: { username, email, password, ref } });
      setToken(data.token);
      state.user = data.user;
      hideModal('registerModal');
      $('registerForm').reset();
      toast('注册成功，已赠送 1000 积分，站点地址：/pages/main/' + data.user.primary_domain);
      await refreshAll();
    } catch (e) {
      showError('registerError', e.message);
    }
  }

  async function doLogout() {
    try { await api('/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
    setToken('');
    state.user = null;
    renderAuth();
    toast('已退出登录', 'secondary');
  }

  function renderAuth() {
    const logged = !!state.user;
    $('dashboard').classList.toggle('d-none', !logged);
    $('guestBanner').classList.toggle('d-none', logged);
    $('btnLoginNav').classList.toggle('d-none', logged);
    $('btnRegisterNav').classList.toggle('d-none', logged);
    $('btnLogoutNav').classList.toggle('d-none', !logged);
    $('btnAdminNav').classList.toggle('d-none', !(logged && state.user.role === 'admin'));
    const chip = $('navCredits');
    chip.classList.toggle('d-none', !logged);
    if (logged) {
      chip.textContent = '积分 ' + state.user.credits;
      $('dashUser').textContent = state.user.username;
      $('dashDomain').textContent = state.user.primary_domain || '-';
      $('dashInviteCode').textContent = '邀请码 ' + (state.user.invite_code || '-');
      $('dashCredits').textContent = state.user.credits;
    } else {
      chip.textContent = '积分 0';
    }
  }

  /* ---------------- 项目 ---------------- */

  async function loadProjects() {
    const data = await api('/projects');
    state.projects = data.projects || [];
    renderProjects();
  }

  function expireBadge(p) {
    if (p.domain_state === 'active') {
      const d = p.days_left;
      if (d === null || d === undefined) return '<span class="chip chip-slate">未开始</span>';
      const cls = d <= 30 ? 'chip-amber' : 'chip-green';
      return '<span class="chip ' + cls + '">剩余 ' + d + ' 天</span>';
    }
    if (p.domain_state === 'grace') {
      return '<span class="chip chip-amber">宽限 ' + p.overdue + ' 天</span>';
    }
    return '<span class="chip chip-red">已过期 ' + p.overdue + ' 天</span>';
  }

  function sitePathOf(p) {
    return p.path || ('/pages/main/' + (p.slug || p.domain));
  }

  function siteUrlOf(p) {
    return p.url || (location.origin + sitePathOf(p));
  }

  function renderProjects() {
    const tbody = $('projectTbody');
    const empty = $('projectEmpty');
    tbody.innerHTML = '';
    if (!state.projects.length) {
      empty.classList.remove('d-none');
      $('dashProjects').textContent = '0';
      return;
    }
    empty.classList.add('d-none');
    $('dashProjects').textContent = state.projects.length;
    for (const p of state.projects) {
      const expired = p.domain_state === 'expired';
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><i class="fas fa-folder me-2" style="color:#f59e0b"></i><strong>' + escapeHtml(p.name) + '</strong></td>' +
        '<td><a class="chip chip-path" href="' + escapeHtml(siteUrlOf(p)) + '" target="_blank" rel="noopener">' +
          escapeHtml(sitePathOf(p)) + '</a></td>' +
        '<td>' + expireBadge(p) + '</td>' +
        '<td>' + (p.file_count != null ? p.file_count : '-') + '</td>' +
        '<td>' + (p.total_size != null ? fmtSize(p.total_size) : '-') + '</td>' +
        '<td>' + (p.visits || 0) + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          '<button class="btn-mini me-1 act-deploy"' + (expired ? ' disabled' : '') + '><i class="fas fa-rocket"></i>部署</button>' +
          '<button class="btn-mini me-1 act-domain"><i class="fas fa-globe"></i>信息</button>' +
          '<button class="btn-mini warn me-1 act-renew"><i class="fas fa-rotate-right"></i>续期</button>' +
          '<button class="btn-mini danger act-delete"><i class="fas fa-trash"></i></button>' +
        '</td>';
      tr.querySelector('.act-deploy').addEventListener('click', () => openDeploy(p));
      tr.querySelector('.act-domain').addEventListener('click', () => openDomain(p));
      tr.querySelector('.act-renew').addEventListener('click', () => openRenew(p));
      tr.querySelector('.act-delete').addEventListener('click', () => deleteProject(p));
      tbody.appendChild(tr);
    }
  }

  async function createProject() {
    clearError('projectError');
    const name = $('projectName').value.trim();
    if (!name) {
      showError('projectError', '请填写项目名称');
      return;
    }
    try {
      const data = await api('/projects', { method: 'POST', body: { name } });
      hideModal('projectModal');
      $('projectName').value = '';
      toast('项目已创建，站点地址：' + (data.project.path || '/pages/main/' + data.project.domain));
      await refreshAll();
    } catch (e) {
      showError('projectError', e.message);
    }
  }

  async function deleteProject(p) {
    if (!confirm('确定删除项目「' + p.name + '」及其所有部署文件？')) return;
    try {
      await api('/projects/' + p.id, { method: 'DELETE' });
      toast('项目已删除', 'secondary');
      await refreshAll();
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  /* ---------------- 续期 ---------------- */

  function openRenew(p) {
    state.renewProject = p;
    clearError('renewError');
    $('renewDomain').textContent = sitePathOf(p);
    const st = p.domain_state;
    const stateText = st === 'active' ? '正常' : (st === 'grace' ? '宽限期' : '已过期');
    $('renewState').textContent = stateText;
    $('renewState').className = 'fw-bold ' + (st === 'active' ? 'text-success' : (st === 'grace' ? 'text-warning' : 'text-danger'));
    $('renewOverdue').textContent = (p.overdue || 0) + ' 天';
    $('renewGrace').textContent = (state.pricing.grace_days || 90) + ' 天';
    $('renewDays').textContent = (state.pricing.renew_days || 180) + ' 天';
    $('renewCost').textContent = state.pricing.renew || 10;
    showModal('renewModal');
  }

  async function doRenew() {
    clearError('renewError');
    if (!state.renewProject) return;
    const btn = $('btnDoRenew');
    btn.disabled = true;
    try {
      const data = await api('/projects/' + state.renewProject.id + '/renew', { method: 'POST', body: {} });
      hideModal('renewModal');
      toast('续期成功，有效期延长 ' + (state.pricing.renew_days || 180) + ' 天，消耗 ' + data.cost + ' 积分');
      await refreshAll();
    } catch (e) {
      showError('renewError', e.message);
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------- 部署 ---------------- */

  function openDeploy(p) {
    state.deployProject = p;
    state.deployFiles = [];
    renderFiles();
    $('deployDomain').textContent = sitePathOf(p);
    $('deployCost').textContent = (state.pricing.deploy || 2) + ' 积分';
    clearError('deployError');
    showModal('deployModal');
  }

  function renderFiles() {
    const tbody = $('fileTbody');
    tbody.innerHTML = '';
    $('fileEmpty').classList.toggle('d-none', state.deployFiles.length > 0);
    for (const f of state.deployFiles) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="path-cell" title="' + escapeHtml(f.path) + '">' + escapeHtml(f.path) + '</td>' +
        '<td class="text-end">' + fmtSize(f.size) + '</td>';
      tbody.appendChild(tr);
    }
  }

  const TEXT_TYPES = ['text/', 'application/json', 'application/xml', 'application/javascript', 'image/svg+xml'];

  function readFile(file, relPath) {
    return new Promise((resolve) => {
      const isText = TEXT_TYPES.some((t) => (file.type || '').indexOf(t) === 0) ||
        /\.(html?|css|js|mjs|json|txt|md|xml|svg|webmanifest)$/i.test(relPath);
      if (isText) {
        const reader = new FileReader();
        reader.onload = () => resolve({ path: relPath, content: String(reader.result), encoding: 'text', size: file.size });
        reader.onerror = () => resolve({ path: relPath, content: '', encoding: 'text', size: 0 });
        reader.readAsText(file);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result);
          const idx = dataUrl.indexOf(',');
          resolve({ path: relPath, content: idx >= 0 ? dataUrl.slice(idx + 1) : '', encoding: 'base64', size: file.size });
        };
        reader.onerror = () => resolve({ path: relPath, content: '', encoding: 'text', size: 0 });
        reader.readAsDataURL(file);
      }
    });
  }

  function addFiles(fileList) {
    const arr = Array.from(fileList || []);
    const existing = new Set(state.deployFiles.map((f) => f.path));
    const jobs = [];
    for (const file of arr) {
      let rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/').replace(/^\/+/, '');
      if (!rel) continue;
      if (rel.split('/').some((seg) => seg === '.git' || seg === 'node_modules' || seg === '.DS_Store')) continue;
      if (existing.has(rel)) continue;
      existing.add(rel);
      jobs.push(readFile(file, rel));
    }
    Promise.all(jobs).then((items) => {
      state.deployFiles = state.deployFiles.concat(items);
      renderFiles();
    });
  }

  async function doDeploy() {
    clearError('deployError');
    if (!state.deployProject) return;
    if (!state.deployFiles.length) {
      showError('deployError', '请至少选择一个文件');
      return;
    }
    const btn = $('btnDoDeploy');
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin me-1"></i>部署中...';
    try {
      const data = await api('/projects/' + state.deployProject.id + '/deploy', {
        method: 'POST',
        body: { project_id: state.deployProject.id, files: state.deployFiles },
      });
      hideModal('deployModal');
      state.deployFiles = [];
      toast('部署成功！消耗 ' + data.deployment.credits_spent + ' 积分，剩余 ' + data.credits + ' 积分');
      await refreshAll();
    } catch (e) {
      showError('deployError', e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }

  /* ---------------- 域名详情 ---------------- */

  async function openDomain(p) {
    clearError('domainError');
    const url = siteUrlOf(p);
    $('domainUrl').value = url;
    $('btnOpenSite').href = url;
    $('domainFileTbody').innerHTML = '';
    $('domainFileEmpty').classList.remove('d-none');
    showModal('domainModal');
    try {
      const data = await api('/projects/' + p.id + '/files');
      const files = data.files || [];
      $('domainExpire').innerHTML = data.domain_expires_at
        ? ('到期时间：' + fmtTime(data.domain_expires_at) + ' ' + expireBadge(p))
        : '尚未开始（首次部署后起算 180 天）';
      if (files.length) {
        $('domainFileEmpty').classList.add('d-none');
        for (const f of files) {
          const tr = document.createElement('tr');
          tr.innerHTML = '<td class="path-cell" title="' + escapeHtml(f.path) + '">' + escapeHtml(f.path) + '</td>' +
            '<td class="text-end">' + fmtSize(f.size) + '</td>' +
            '<td class="text-end"><button class="btn-mini view-file">查看</button></td>';
          tr.querySelector('.view-file').addEventListener('click', () => viewFile(p.id, f.path));
          $('domainFileTbody').appendChild(tr);
        }
      }
    } catch (e) {
      showError('domainError', e.message);
    }
  }

  async function viewFile(projectId, path) {
    $('modalFileName').textContent = path;
    $('viewContent').innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-circle-notch fa-spin fa-2x"></i><p class="mt-2">正在加载...</p></div>';
    $('viewError').classList.add('d-none');
    const modal = showModal('viewModal');
    if (!modal) return;
    try {
      const data = await api('/projects/' + projectId + '/files?path=' + encodeURIComponent(path));
      const c = data.content;
      if (!c) {
        $('viewContent').innerHTML = '<div class="alert alert-warning">该文件没有可预览的文本内容。</div>';
      } else if (c.encoding === 'base64') {
        $('viewContent').innerHTML = '<div class="alert alert-info">二进制文件，无法作为文本预览。</div>';
      } else {
        $('viewContent').innerHTML = '<pre class="view-content bg-light p-2 border rounded">' + escapeHtml(c.content) + '</pre>';
      }
    } catch (e) {
      $('viewContent').innerHTML = '';
      $('viewError').textContent = '加载失败: ' + e.message;
      $('viewError').classList.remove('d-none');
    }
  }

  /* ---------------- 积分 ---------------- */

  async function loadCredits() {
    const data = await api('/credits');
    if (state.user) {
      state.user.credits = data.credits;
      $('navCredits').textContent = '积分 ' + data.credits;
      $('dashCredits').textContent = data.credits;
    }
    renderPricing(data.pricing);
    $('dashDeploys').textContent = (data.stats && data.stats.deploys) || 0;
    $('dashVisits').textContent = (data.stats && data.stats.visits) || 0;

    const tbody = $('logTbody');
    tbody.innerHTML = '';
    const logs = data.logs || [];
    $('logEmpty').classList.toggle('d-none', logs.length > 0);
    const typeMap = {
      signup: ['注册赠送', 'chip-green'], deploy: ['部署', 'chip'], visit: ['访问', 'chip-amber'],
      monthly: ['每月赠送', 'chip'], referral: ['邀请奖励', 'chip-slate'],
      recharge: ['充值', 'chip-green'], renew: ['站点续期', 'chip-amber'],
      admin: ['管理员调整', 'chip-slate'], activity: ['活动奖励', 'chip-green'],
    };
    for (const l of logs) {
      const meta = typeMap[l.type] || [l.type, 'chip-slate'];
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="text-muted" style="font-size:.8rem">' + fmtTime(l.created_at) + '</td>' +
        '<td><span class="chip ' + meta[1] + '">' + meta[0] + '</span></td>' +
        '<td>' + escapeHtml(l.note || '-') + '</td>' +
        '<td class="' + (l.delta >= 0 ? 'text-success' : 'text-danger') + ' fw-bold">' + (l.delta >= 0 ? '+' : '') + l.delta + '</td>' +
        '<td>' + l.balance_after + '</td>';
      tbody.appendChild(tr);
    }
  }

  /* ---------------- 邀请 ---------------- */

  async function loadInvite() {
    const data = await api('/invite');
    $('inviteCode').value = data.invite_code || '';
    $('inviteUrl').value = data.invite_url || '';
    $('inviteReward').textContent = data.reward_per_invite;
    $('inviteeReward').textContent = data.invitee_reward;
    $('inviteCount').textContent = (data.invited || []).length;
    $('inviteTotal').textContent = data.total_reward || 0;
    const tbody = $('inviteTbody');
    tbody.innerHTML = '';
    const list = data.invited || [];
    $('inviteEmpty').classList.toggle('d-none', list.length > 0);
    for (const u of list) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><i class="fas fa-user me-2 text-primary"></i>' + escapeHtml(u.username) + '</td>' +
        '<td class="text-muted">' + escapeHtml(u.email) + '</td>' +
        '<td class="text-muted">' + fmtTime(u.created_at) + '</td>' +
        '<td>' + u.credits + '</td>';
      tbody.appendChild(tr);
    }
  }

  /* ---------------- 充值 ---------------- */

  async function createOrder() {
    clearError('rechargeError');
    const amount = Number($('rechargeAmount').value);
    const method = $('rechargeMethod').value;
    const contact = $('rechargeContact').value.trim();
    try {
      const data = await api('/orders', { method: 'POST', body: { amount, method, contact } });
      toast('充值订单已提交：' + data.order.order_no + '，等待管理员审核到账');
      $('rechargeContact').value = '';
      await loadOrders();
    } catch (e) {
      showError('rechargeError', e.message);
    }
  }

  async function loadOrders() {
    const data = await api('/orders');
    const tbody = $('orderTbody');
    tbody.innerHTML = '';
    const list = data.orders || [];
    $('orderEmpty').classList.toggle('d-none', list.length > 0);
    const statusMap = { pending: ['待审核', 'chip-amber'], approved: ['已到账', 'chip-green'], rejected: ['已驳回', 'chip-red'] };
    const methodMap = { alipay: '支付宝', wechat: '微信', qq: 'QQ钱包' };
    for (const o of list) {
      const meta = statusMap[o.status] || [o.status, 'chip-slate'];
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="mono" style="font-size:.76rem">' + escapeHtml(o.order_no) + '</td>' +
        '<td>' + o.amount + ' 元</td>' +
        '<td>' + o.credits + '</td>' +
        '<td>' + (methodMap[o.method] || o.method) + '</td>' +
        '<td><span class="badge ' + meta[1] + '">' + meta[0] + '</span></td>' +
        '<td class="text-muted" style="font-size:.8rem">' + fmtTime(o.created_at) + '</td>';
      tbody.appendChild(tr);
    }
  }

  /* ---------------- 管理员后台 ---------------- */

  async function openAdmin() {
    clearError('adminError');
    showModal('adminModal');
    resetActivityForm();
    switchAdminTab('atabUsers');
    try {
      await Promise.all([
        loadAdminStats(), loadAdminUsers(), loadAdminOrders(),
        loadAdminProjects(), loadAdminLogs(), loadAdminActivities(),
      ]);
    } catch (e) {
      showError('adminError', e.message);
    }
  }

  function switchAdminTab(id) {
    document.querySelectorAll('#adminTabs .nav-link').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-atab') === id);
    });
    document.querySelectorAll('.atab-panel').forEach((p) => {
      p.classList.toggle('d-none', p.id !== id);
    });
  }

  async function loadAdminStats() {
    const data = await api('/admin/stats');
    const s = data.stats;
    $('asUsers').textContent = s.users;
    $('asSites').textContent = s.sites;
    $('asVisits').textContent = s.visits;
    $('asOrders').textContent = s.orders;
    $('asPending').textContent = s.pending_orders;
    $('asCredits').textContent = Math.round(s.total_credits);
    const cfg = data.settings || {};
    $('setSignupCredits').value = cfg.signup_credits;
    $('setDeployCost').value = cfg.deploy_cost;
    $('setVisitCost').value = cfg.visit_cost;
    $('setMonthlyGift').value = cfg.monthly_gift;
    $('setRefReferrer').value = cfg.referral_referrer;
    $('setRefInvitee').value = cfg.referral_invitee;
    $('setRenewCost').value = cfg.renew_cost;
    $('setValidDays').value = cfg.domain_valid_days;
    $('setRenewDays').value = cfg.renew_days;
    $('setGraceDays').value = cfg.renew_grace_days;
    $('setRechargeMin').value = cfg.recharge_min;
  }

  async function loadAdminUsers(q) {
    const data = await api('/admin/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
    const tbody = $('adminUserTbody');
    tbody.innerHTML = '';
    for (const u of data.users || []) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + u.id + '</td>' +
        '<td><strong>' + escapeHtml(u.username) + '</strong></td>' +
        '<td style="font-size:.78rem">' + escapeHtml(u.email) + '</td>' +
        '<td class="credit-chip">' + u.credits + '</td>' +
        '<td class="mono" style="font-size:.76rem">' + escapeHtml(u.invite_code || '-') + '</td>' +
        '<td><span class="badge ' + (u.role === 'admin' ? 'bg-warning text-dark' : 'bg-secondary') + '">' +
          (u.role === 'admin' ? '管理员' : '用户') + '</span></td>' +
        '<td><span class="badge ' + (u.status === 'active' ? 'bg-success' : 'bg-danger') + '">' +
          (u.status === 'active' ? '正常' : '封禁') + '</span></td>' +
        '<td class="text-nowrap">' +
          '<button class="btn-mini me-1 adm-adjust"><i class="fas fa-coins"></i></button>' +
          '<button class="btn-mini me-1 adm-role"><i class="fas fa-user-shield"></i></button>' +
          '<button class="btn-mini danger adm-status"><i class="fas fa-ban"></i></button>' +
        '</td>';
      tr.querySelector('.adm-adjust').addEventListener('click', () => adminAdjust(u));
      tr.querySelector('.adm-role').addEventListener('click', () => adminRole(u));
      tr.querySelector('.adm-status').addEventListener('click', () => adminStatus(u));
      tbody.appendChild(tr);
    }
  }

  async function adminAdjust(u) {
    const raw = prompt('为用户 ' + u.username + ' 调整积分（正数增加，负数扣减）：', '100');
    if (raw === null) return;
    const delta = Number(raw);
    if (!delta || isNaN(delta)) { toast('请输入有效数字', 'danger'); return; }
    const note = prompt('备注（可选）：', '管理员调整') || '管理员调整';
    try {
      const data = await api('/admin/adjust-credits', { method: 'POST', body: { user_id: u.id, delta, note } });
      toast(u.username + ' 积分已调整为 ' + data.credits);
      await loadAdminUsers($('adminUserQuery').value.trim());
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function adminRole(u) {
    const role = u.role === 'admin' ? 'user' : 'admin';
    if (!confirm('将 ' + u.username + ' 设为' + (role === 'admin' ? '管理员' : '普通用户') + '？')) return;
    try {
      await api('/admin/set-role', { method: 'POST', body: { user_id: u.id, role } });
      toast('已更新角色');
      await loadAdminUsers($('adminUserQuery').value.trim());
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function adminStatus(u) {
    const status = u.status === 'active' ? 'banned' : 'active';
    if (!confirm('将 ' + u.username + ' 设为' + (status === 'banned' ? '封禁' : '正常') + '？')) return;
    try {
      await api('/admin/set-status', { method: 'POST', body: { user_id: u.id, status } });
      toast('已更新状态');
      await loadAdminUsers($('adminUserQuery').value.trim());
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function loadAdminOrders() {
    const data = await api('/admin/orders');
    const tbody = $('adminOrderTbody');
    tbody.innerHTML = '';
    const statusMap = { pending: ['待审核', 'chip-amber'], approved: ['已到账', 'chip-green'], rejected: ['已驳回', 'chip-red'] };
    const methodMap = { alipay: '支付宝', wechat: '微信', qq: 'QQ钱包' };
    for (const o of data.orders || []) {
      const meta = statusMap[o.status] || [o.status, 'chip-slate'];
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="mono" style="font-size:.76rem">' + escapeHtml(o.order_no) + '</td>' +
        '<td>' + escapeHtml(o.username || '-') + '</td>' +
        '<td>' + o.amount + ' 元</td>' +
        '<td>' + o.credits + '</td>' +
        '<td>' + (methodMap[o.method] || o.method) + '</td>' +
        '<td><span class="badge ' + meta[1] + '">' + meta[0] + '</span></td>' +
        '<td class="text-muted" style="font-size:.8rem">' + fmtTime(o.created_at) + '</td>' +
        '<td>' + (o.status === 'pending'
          ? '<button class="btn-mini me-1 adm-ok"><i class="fas fa-check"></i></button>' +
            '<button class="btn-mini danger adm-no"><i class="fas fa-times"></i></button>'
          : '<span class="text-muted" style="font-size:.8rem">已处理</span>') + '</td>';
      if (o.status === 'pending') {
        tr.querySelector('.adm-ok').addEventListener('click', () => reviewOrder(o, 'approve'));
        tr.querySelector('.adm-no').addEventListener('click', () => reviewOrder(o, 'reject'));
      }
      tbody.appendChild(tr);
    }
  }

  async function reviewOrder(o, action) {
    const note = prompt(action === 'approve' ? '审核备注（可选）：' : '驳回原因：', '') || '';
    try {
      await api('/admin/review-order', { method: 'POST', body: { order_id: o.id, action, note } });
      toast(action === 'approve' ? '已通过，积分已到账' : '已驳回');
      await Promise.all([loadAdminOrders(), loadAdminStats()]);
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function saveSettings() {
    const body = {
      signup_credits: Number($('setSignupCredits').value),
      deploy_cost: Number($('setDeployCost').value),
      visit_cost: Number($('setVisitCost').value),
      monthly_gift: Number($('setMonthlyGift').value),
      referral_referrer: Number($('setRefReferrer').value),
      referral_invitee: Number($('setRefInvitee').value),
      renew_cost: Number($('setRenewCost').value),
      domain_valid_days: Number($('setValidDays').value),
      renew_days: Number($('setRenewDays').value),
      renew_grace_days: Number($('setGraceDays').value),
      recharge_min: Number($('setRechargeMin').value),
    };
    try {
      await api('/admin/settings', { method: 'POST', body });
      toast('设置已保存');
      await loadAdminStats();
      const me = await api('/me');
      state.user = me.user;
      renderPricing(me.pricing);
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function grantGift() {
    if (!confirm('立即为所有用户发放本月赠送积分？')) return;
    try {
      const data = await api('/admin/grant-gift', { method: 'POST', body: {} });
      toast('已发放给 ' + data.granted + ' 位用户');
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function makeAdmin() {
    const username = $('newAdminUser').value.trim();
    const password = $('newAdminPass').value.trim();
    if (!username || !password) { toast('请填写用户名和密码', 'danger'); return; }
    try {
      await api('/admin/make-admin', { method: 'POST', body: { username, password } });
      toast('管理员已创建：' + username);
      $('newAdminUser').value = '';
      $('newAdminPass').value = '';
      await loadAdminUsers();
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function loadAdminProjects() {
    const data = await api('/admin/projects');
    const tbody = $('adminProjectTbody');
    tbody.innerHTML = '';
    for (const p of data.projects || []) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + p.id + '</td>' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td class="mono" style="font-size:.76rem"><a href="' + escapeHtml(siteUrlOf(p)) + '" target="_blank" rel="noopener" class="text-decoration-none">' +
          escapeHtml(sitePathOf(p)) + '</a></td>' +
        '<td>' + escapeHtml(p.username || '-') + '</td>' +
        '<td>' + (p.visits || 0) + '</td>' +
        '<td style="font-size:.78rem">' + (p.domain_expires_at ? fmtTime(p.domain_expires_at) : '-') + '</td>' +
        '<td><button class="btn-mini danger adm-del"><i class="fas fa-trash"></i></button></td>';
      tr.querySelector('.adm-del').addEventListener('click', async () => {
        if (!confirm('删除站点 ' + sitePathOf(p) + '？')) return;
        try {
          await api('/admin/delete-project', { method: 'POST', body: { project_id: p.id } });
          toast('站点已删除', 'secondary');
          await loadAdminProjects();
        } catch (e) {
          toast(e.message, 'danger');
        }
      });
      tbody.appendChild(tr);
    }
  }

  async function loadAdminLogs() {
    const data = await api('/admin/logs?limit=100');
    const tbody = $('adminLogTbody');
    tbody.innerHTML = '';
    const typeMap = {
      signup: '注册', deploy: '部署', visit: '访问', monthly: '月赠',
      referral: '邀请', recharge: '充值', renew: '续期', admin: '管理', activity: '活动',
    };
    for (const l of data.logs || []) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + l.id + '</td>' +
        '<td>' + escapeHtml(l.username || l.user_id) + '</td>' +
        '<td>' + (typeMap[l.type] || l.type) + '</td>' +
        '<td style="font-size:.78rem">' + escapeHtml(l.note || '-') + '</td>' +
        '<td class="' + (l.delta >= 0 ? 'text-success' : 'text-danger') + '">' + (l.delta >= 0 ? '+' : '') + l.delta + '</td>' +
        '<td>' + l.balance_after + '</td>' +
        '<td class="text-muted" style="font-size:.8rem">' + fmtTime(l.created_at) + '</td>';
      tbody.appendChild(tr);
    }
  }

  /* ---------------- 初始化管理员 ---------------- */

  async function checkBootstrap() {
    try {
      const data = await api('/bootstrap');
      $('bootstrapHint').classList.toggle('d-none', !data.needs_bootstrap);
    } catch (e) { /* ignore */ }
  }

  async function doBootstrap() {
    clearError('bootstrapError');
    const username = $('bsUsername').value.trim();
    const email = $('bsEmail').value.trim();
    const password = $('bsPassword').value;
    if (!username || !password) {
      showError('bootstrapError', '请填写用户名和密码');
      return;
    }
    try {
      const data = await api('/bootstrap', { method: 'POST', body: { username, email, password } });
      setToken(data.token);
      hideModal('bootstrapModal');
      $('bootstrapForm').reset();
      $('bootstrapHint').classList.add('d-none');
      toast('管理员创建成功，已自动登录');
      const me = await api('/me');
      state.user = me.user;
      renderPricing(me.pricing);
      await refreshAll();
    } catch (e) {
      showError('bootstrapError', e.message);
    }
  }

  /* ---------------- 活动中心 ---------------- */

  const ACTIVITY_TYPE_LABEL = {
    signup_bonus: '注册加赠',
    deploy_discount: '部署减免',
    recharge_bonus: '充值返利',
    promo: '推广活动',
    manual_claim: '手动领取',
  };

  function activityValueText(a) {
    if (a.type === 'signup_bonus') return '+' + a.value + ' 积分';
    if (a.type === 'deploy_discount') return '部署仅 ' + a.value + ' 积分';
    if (a.type === 'recharge_bonus') return '充值得 ' + a.value + '% 额外积分';
    return '+' + a.value + ' 积分';
  }

  function activityCard(a) {
    const end = a.end_time ? fmtTime(a.end_time) : '-';
    const left = a.days_left != null ? ('剩余 ' + a.days_left + ' 天') : '';
    const claimType = a.type === 'manual_claim';
    const isExhausted = a.exhausted || a.runtime_state !== 'active';
    const claimed = a.claimed || false;

    let progressHtml = '';
    if (claimType && a.pool_total) {
      const pct = Math.min(100, Math.round((a.pool_current / a.pool_total) * 100 * 100) / 100);
      progressHtml = '<div style="height:6px;background:#e2e8f0;border-radius:3px;margin-top:8px;overflow:hidden">' +
        '<div style="height:100%;background:' + (isExhausted ? '#64748b' : '#0ea5e9') + ';width:' + pct + '%;transition:width 0.3s"></div>' +
        '</div>' +
        '<div style="font-size:.72rem;color:var(--text-light);text-align:right;margin-top:4px">' +
        '已发放 ' + a.pool_current.toLocaleString() + ' / 总池 ' + a.pool_total.toLocaleString() + ' 积分 (' + pct + '%)' +
        '</div>';
    }

    let claimBtn = '';
    if (claimType && !claimed && !isExhausted) {
      claimBtn = '<button class="btn-mini btn-primary-pill" onclick="claimActivity(' + a.id + ')"><i class="fas fa-gift"></i> 立即领取</button>';
    } else if (claimed) {
      claimBtn = '<button class="btn-mini" disabled style="background:#cbd5e1;color:#64748b;border-color:#cbd5e1"><i class="fas fa-check"></i> 已领取</button>';
    } else if (isExhausted) {
      claimBtn = '<button class="btn-mini" disabled style="background:#fee2e2;color:#b91c1c;border-color:#fee2e2"><i class="fas fa-ban"></i> 已发完</button>';
    }

    const chipClass = claimType ? 'chip-amber' : 'chip-green';
    return '<div class="col-lg-4 col-md-6">' +
      '<div class="activity-card">' +
      '<div class="d-flex justify-content-between align-items-start mb-1">' +
      '<h6 class="mb-0">' + escapeHtml(a.title) + '</h6>' +
      '<span class="chip ' + chipClass + '">' + escapeHtml(ACTIVITY_TYPE_LABEL[a.type] || a.type) + '</span>' +
      '</div>' +
      '<div class="desc">' + escapeHtml(a.description || '活动进行中') + '</div>' +
      '<div class="activity-value mb-1" style="color:#dc2626;font-weight:800">' + escapeHtml(activityValueText(a)) + '</div>' +
      '<div class="activity-meta">截止 ' + end + (left ? ' · ' + left : '') + '</div>' +
      progressHtml +
      '<div class="mt-3 d-flex gap-2 flex-wrap">' +
      claimBtn +
      '</div>' +
      '</div></div>';
  }

  async function claimActivity(activityId) {
    if (!state.user) {
      toast('请先登录', 'danger');
      showModal('loginModal');
      return;
    }
    try {
      const data = await api('/activities/' + activityId + '/claim', { method: 'POST', body: {} });
      toast('领取成功！+' + data.awarded + ' 积分，当前余额：' + data.credits);
      await refreshAll();
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function loadActivities() {
    try {
      const data = await api('/activities');
      const list = data.activities || [];
      if ($('activityList')) {
        $('activityList').innerHTML = list.map(activityCard).join('');
        $('activityEmpty').classList.toggle('d-none', list.length > 0);
      }
      if ($('dashActivityList')) {
        $('dashActivityList').innerHTML = list.map(activityCard).join('');
        $('dashActivityEmpty').classList.toggle('d-none', list.length > 0);
      }
    } catch (e) { /* ignore */ }
  }

  /* ---------------- 管理员：活动配置 ---------------- */

  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function defaultActivityTimes() {
    const now = new Date();
    const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    $('actStart').value = toLocalInput(now.toISOString());
    $('actEnd').value = toLocalInput(end.toISOString());
  }

  function resetActivityForm() {
    state.editingActivity = null;
    if ($('actTitle')) $('actTitle').value = '';
    if ($('actDesc')) $('actDesc').value = '';
    if ($('actValue')) $('actValue').value = '50';
    if ($('actPoolTotal')) $('actPoolTotal').value = '0';
    if ($('actPoolCurrent')) $('actPoolCurrent').value = '0';
    if ($('actType')) $('actType').value = 'signup_bonus';
    if ($('actTarget')) $('actTarget').value = 'all';
    defaultActivityTimes();
    $('actEditHint').textContent = '不选编辑时创建新活动';
    $('btnCreateActivity').innerHTML = '<i class="fas fa-save"></i> 保存活动';
    $('btnCancelEditActivity').classList.add('d-none');
    clearError('actError');
  }

  function editActivity(a) {
    state.editingActivity = a;
    $('actTitle').value = a.title || '';
    $('actDesc').value = a.description || '';
    $('actType').value = a.type;
    $('actValue').value = a.value;
    if ($('actPoolTotal')) $('actPoolTotal').value = a.pool_total || 0;
    if ($('actPoolCurrent')) $('actPoolCurrent').value = a.pool_current || 0;
    $('actTarget').value = a.target_users || 'all';
    $('actStart').value = toLocalInput(a.start_time);
    $('actEnd').value = toLocalInput(a.end_time);
    $('actEditHint').textContent = '正在编辑 #' + a.id;
    $('btnCreateActivity').innerHTML = '<i class="fas fa-save"></i> 更新活动';
    $('btnCancelEditActivity').classList.remove('d-none');
    $('atabActivities').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function saveActivity() {
    clearError('actError');
    const payload = {
      title: $('actTitle').value.trim(),
      description: $('actDesc').value.trim(),
      type: $('actType').value,
      value: Number($('actValue').value),
      pool_total: Number($('actPoolTotal').value || 0),
      pool_current: Number($('actPoolCurrent').value || 0),
      start_time: new Date($('actStart').value).toISOString(),
      end_time: new Date($('actEnd').value).toISOString(),
      target_users: $('actTarget').value,
    };
    if (!payload.title) { showError('actError', '请填写活动标题'); return; }
    if (!payload.start_time || !payload.end_time || isNaN(new Date(payload.start_time).getTime())) {
      showError('actError', '请填写开始和结束时间'); return;
    }
    try {
      if (state.editingActivity) {
        await api('/admin/activities/' + state.editingActivity.id, { method: 'PUT', body: payload });
        toast('活动已更新');
      } else {
        await api('/admin/activities', { method: 'POST', body: payload });
        toast('活动已创建');
      }
      resetActivityForm();
      await Promise.all([loadAdminActivities(), loadActivities()]);
    } catch (e) {
      showError('actError', e.message);
    }
  }

  async function toggleActivity(a) {
    const status = a.status === 'active' ? 'paused' : 'active';
    try {
      await api('/admin/activities/' + a.id, { method: 'PUT', body: { status } });
      toast(status === 'active' ? '活动已启用' : '活动已暂停');
      await Promise.all([loadAdminActivities(), loadActivities()]);
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function deleteActivity(a) {
    if (!confirm('确定删除活动「' + a.title + '」？')) return;
    try {
      await api('/admin/activities/' + a.id, { method: 'DELETE' });
      toast('活动已删除', 'secondary');
      await Promise.all([loadAdminActivities(), loadActivities()]);
    } catch (e) {
      toast(e.message, 'danger');
    }
  }

  async function loadAdminActivities() {
    const data = await api('/admin/activities');
    const list = data.activities || [];
    const tbody = $('adminActivityTbody');
    tbody.innerHTML = '';
    $('adminActivityEmpty').classList.toggle('d-none', list.length > 0);
    for (const a of list) {
      const stMap = {
        active: ['进行中', 'chip-green'],
        pending: ['未开始', 'chip-amber'],
        expired: ['已结束', 'chip-slate'],
        paused: ['已暂停', 'chip-slate'],
      };
      const st = stMap[a.runtime_state] || ['未知', 'chip-slate'];
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + a.id + '</td>' +
        '<td><strong>' + escapeHtml(a.title) + '</strong><div style="font-size:.74rem;color:var(--text-light)">' + escapeHtml(a.description || '') + '</div></td>' +
        '<td><span class="chip">' + escapeHtml(ACTIVITY_TYPE_LABEL[a.type] || a.type) + '</span></td>' +
        '<td>' + a.value + '</td>' +
        '<td>' + Number(a.pool_total || 0).toLocaleString() + '</td>' +
        '<td>' + Number(a.pool_current || 0).toLocaleString() + '</td>' +
        '<td style="font-size:.76rem;white-space:nowrap">' + fmtTime(a.start_time) + '<br>' + fmtTime(a.end_time) + '</td>' +
        '<td><span class="chip ' + st[1] + '">' + st[0] + '</span></td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          '<button class="btn-mini me-1 act-edit"><i class="fas fa-pen"></i>编辑</button>' +
          '<button class="btn-mini me-1 act-toggle"><i class="fas fa-' + (a.status === 'active' ? 'pause' : 'play') + '"></i>' +
            (a.status === 'active' ? '暂停' : '启用') + '</button>' +
          '<button class="btn-mini danger act-del"><i class="fas fa-trash"></i></button>' +
        '</td>';
      tr.querySelector('.act-edit').addEventListener('click', () => editActivity(a));
      tr.querySelector('.act-toggle').addEventListener('click', () => toggleActivity(a));
      tr.querySelector('.act-del').addEventListener('click', () => deleteActivity(a));
      tbody.appendChild(tr);
    }
  }

  /* ---------------- 全局刷新 ---------------- */

  async function loadStats() {
    try {
      const data = await api('/stats');
      $('statUsers').textContent = data.users || 0;
      $('statSites').textContent = data.sites || 0;
      $('statVisits').textContent = data.visits || 0;
    } catch (e) { /* ignore */ }
  }

  async function refreshAll() {
    renderAuth();
    await loadStats();
    await loadActivities();
    if (state.user) {
      try {
        const me = await api('/me');
        state.user = me.user;
        renderPricing(me.pricing);
        renderAuth();
      } catch (e) { /* ignore */ }
      await loadProjects();
      await loadCredits();
      await loadInvite();
      await loadOrders();
    }
  }

  /* ---------------- 标签页 ---------------- */

  function switchMainTab(id) {
    document.querySelectorAll('#mainTabs button').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === id);
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('d-none', p.id !== id);
    });
  }

  /* ---------------- 事件绑定 ---------------- */

  function bind() {
    $('btnDoLogin').addEventListener('click', doLogin);
    $('btnDoRegister').addEventListener('click', doRegister);
    $('btnLogoutNav').addEventListener('click', doLogout);
    $('btnDoCreateProject').addEventListener('click', createProject);
    $('btnDoDeploy').addEventListener('click', doDeploy);
    $('btnDoRenew').addEventListener('click', doRenew);
    $('btnCreateOrder').addEventListener('click', createOrder);
    $('btnLoginNav').addEventListener('click', () => { clearError('loginError'); showModal('loginModal'); });
    $('btnRegisterNav').addEventListener('click', () => { clearError('registerError'); showModal('registerModal'); });
    $('btnAdminNav').addEventListener('click', openAdmin);
    $('btnSaveSettings').addEventListener('click', saveSettings);
    $('btnGrantGift').addEventListener('click', grantGift);
    $('btnMakeAdmin').addEventListener('click', makeAdmin);
    $('btnAdminSearchUsers').addEventListener('click', () => loadAdminUsers($('adminUserQuery').value.trim()));
    $('btnCreateActivity').addEventListener('click', saveActivity);
    $('btnCancelEditActivity').addEventListener('click', resetActivityForm);
    $('btnHeroStart').addEventListener('click', () => {
      if (state.user) {
        document.getElementById('consoleSection').scrollIntoView({ behavior: 'smooth' });
      } else {
        showModal('registerModal');
      }
    });
    resetActivityForm();

    // 主标签页
    document.querySelectorAll('#mainTabs button').forEach((b) => {
      b.addEventListener('click', () => switchMainTab(b.getAttribute('data-tab')));
    });
    // 管理标签页
    document.querySelectorAll('#adminTabs .nav-link').forEach((b) => {
      b.addEventListener('click', () => switchAdminTab(b.getAttribute('data-atab')));
    });
    // FAQ 折叠
    document.querySelectorAll('.faq-q').forEach((q) => {
      q.addEventListener('click', () => q.parentElement.classList.toggle('open'));
    });
    // 页脚登录/注册
    document.querySelectorAll('[data-open-login]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); showModal('loginModal'); });
    });
    document.querySelectorAll('[data-open-register]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); showModal('registerModal'); });
    });
    const fy = $('footerYear');
    if (fy) fy.textContent = new Date().getFullYear();
    $('btnOpenBootstrap').addEventListener('click', () => {
      clearError('bootstrapError');
      showModal('bootstrapModal');
    });
    $('btnDoBootstrap').addEventListener('click', doBootstrap);
    $('bootstrapForm').addEventListener('submit', (e) => { e.preventDefault(); doBootstrap(); });

    [$('btnNewProject'), $('btnNewProject2')].forEach((b) => {
      if (!b) return;
      b.addEventListener('click', () => {
        clearError('projectError');
        $('projectName').value = '';
        showModal('projectModal');
      });
    });

    $('loginForm').addEventListener('submit', (e) => { e.preventDefault(); doLogin(); });
    $('registerForm').addEventListener('submit', (e) => { e.preventDefault(); doRegister(); });

    $('btnPickFiles').addEventListener('click', (e) => { e.stopPropagation(); $('fileInput').click(); });
    $('btnPickDir').addEventListener('click', (e) => { e.stopPropagation(); $('dirInput').click(); });
    $('dropZone').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    $('dirInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    $('btnClearFiles').addEventListener('click', () => { state.deployFiles = []; renderFiles(); });

    const dz = $('dropZone');
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); dz.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); dz.classList.remove('dragover');
    }));
    dz.addEventListener('drop', (e) => {
      const items = e.dataTransfer.items;
      if (items && items.length && items[0].webkitGetAsEntry) {
        const entries = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry();
          if (entry) entries.push(entry);
        }
        Promise.all(entries.map(readEntry)).then((out) => {
          addFiles(out.flat().map(fakeFile));
        });
      } else {
        addFiles(e.dataTransfer.files);
      }
    });

    $('btnCopyDomain').addEventListener('click', () => copyTo($('domainUrl').value, '域名已复制'));
    $('btnCopyCode').addEventListener('click', () => copyTo($('inviteCode').value, '邀请码已复制'));
    $('btnCopyUrl').addEventListener('click', () => copyTo($('inviteUrl').value, '邀请链接已复制'));

    $('regRef').addEventListener('input', function () {
      const v = this.value.trim().toUpperCase();
      this.value = v;
      $('registerRefBox').classList.toggle('d-none', !v);
      if (v) {
        $('registerRefCode').textContent = v;
        $('registerRefBonus').textContent = state.pricing.referral_invitee || 10;
      }
    });
  }

  function copyTo(text, msg) {
    navigator.clipboard.writeText(text).then(() => toast(msg, 'secondary'));
  }

  function readEntry(entry) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => resolve([{ file: f, path: entry.name }]));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const all = [];
        const readBatch = () => {
          reader.readEntries(async (entries) => {
            if (!entries.length) {
              const nested = await Promise.all(all.map((e) => readEntry(e)));
              resolve(nested.flat().map((x) => ({ file: x.file, path: entry.name + '/' + x.path })));
              return;
            }
            all.push(...entries);
            readBatch();
          }, () => resolve([]));
        };
        readBatch();
      } else {
        resolve([]);
      }
    });
  }

  function fakeFile(obj) {
    const f = obj.file;
    try {
      Object.defineProperty(f, 'webkitRelativePath', { value: obj.path, configurable: true });
    } catch (e) { /* ignore */ }
    return f;
  }

  window.copyContent = function () {
    const content = $('viewContent').innerText;
    navigator.clipboard.writeText(content).then(() => {
      const btn = $('btnCopy');
      const original = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check me-1"></i>已复制';
      setTimeout(() => { btn.innerHTML = original; }, 1500);
    });
  };

  document.addEventListener('DOMContentLoaded', async () => {
    bind();

    // 邀请码预填
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    if (ref) {
      $('regRef').value = ref.toUpperCase();
      $('registerRefBox').classList.remove('d-none');
      $('registerRefCode').textContent = ref.toUpperCase();
      showModal('registerModal');
    }

    if (state.token) {
      try {
        const me = await api('/me');
        state.user = me.user;
        renderPricing(me.pricing);
      } catch (e) {
        setToken('');
      }
    }
    renderAuth();
    await refreshAll();
    await checkBootstrap();
  });
})();
