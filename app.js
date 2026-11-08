/**
 * Student Council Management System - Core Logic Controller
 */

// Local Storage Helper
const DB_KEY = 'LRP_STUDENT_COUNCIL_DB';
const MAX_SCHOOL_IMAGE_BYTES = 8 * 1024 * 1024;
// Supabase-backed core data/auth.
// The browser only uses the Supabase publishable key. Never put a service_role/secret key here.
const sb = window.schoolSupabase || null;

function isSupabaseReady() {
  return !!(sb && typeof sb.auth?.signInWithPassword === 'function');
}

const AUTH_HINT_KEY = 'sc_student_council_auth_hint_v2';
function clearAuthHint() { try { localStorage.removeItem(AUTH_HINT_KEY); } catch (e) {} }

function mapSupabaseProfile(row) {
  if (!row) return null;
  return {
    id: row.student_id,
    authId: row.id,
    name: row.name || '',
    role: row.role || 'student',
    class: row.classroom || '',
    email: row.email || ''
  };
}

function hydrateCurrentUserFromSession(session, profile) {
  if (!session?.user || !profile || profile.id !== session.user.id) return null;
  if (profile.role !== 'student' && profile.role !== 'admin') return null;

  currentUser = mapSupabaseProfile(profile);
  currentRole = currentUser.role;
  return currentUser;
}

function mapSupabaseReport(row) {
  return {
    id: row.id,
    reporterName: row.reporter_name || '',
    reporterId: row.reporter_id || '',
    classroom: row.classroom || '',
    title: row.title || '',
    category: row.category || '',
    location: row.location || '',
    datetime: row.datetime || '',
    description: row.description || '',
    photos: Array.isArray(row.photos) ? row.photos : [],
    status: row.status || 'pending',
    resolutionDate: row.resolution_date || '',
    notes: row.notes || ''
  };
}

async function refreshRemoteReports() {
  if (!isSupabaseReady()) return;
  try {
    let query = sb.from('reports').select('*').order('created_at', { ascending: false });
    if (currentRole === 'student' && currentUser?.authId) {
      query = query.eq('user_id', currentUser.authId);
    } else if (currentRole !== 'admin') {
      return;
    }
    const { data, error } = await query;
    if (error) throw error;
    db.reports = (data || []).map(mapSupabaseReport);
    inMemoryDB = normalizeDB(db);
  } catch (error) {
    console.error('Supabase reports load failed:', error);
    showToast('โหลดข้อมูลจากฐานข้อมูลไม่สำเร็จ', 'error');
  }
}

async function refreshRemoteUsers() {
  if (!isSupabaseReady() || currentRole !== 'admin') return;
  try {
    const { data, error } = await sb.from('profiles').select('id,student_id,name,role,classroom,email').order('created_at', { ascending: true });
    if (error) throw error;
    db.users = (data || []).map(mapSupabaseProfile);
    inMemoryDB = normalizeDB(db);
  } catch (error) {
    console.error('Supabase profiles load failed:', error);
  }
}

async function restoreSupabaseSession() {
  if (!isSupabaseReady()) return false;
  try {
    const { data: sessionData, error: sessionError } = await withTimeout(sb.auth.getSession(), 8000);
    if (sessionError) throw sessionError;
    const session = sessionData?.session;

    if (!session?.user) {
      clearAuthHint();
      currentUser = null;
      currentRole = 'guest';
      return false;
    }

    const { data: profile, error: profileError } = await withTimeout(sb
      .from('profiles')
      .select('id,student_id,name,role,classroom,email')
      .eq('id', session.user.id)
      .maybeSingle(), 8000);

    if (profileError) throw profileError;
    if (!profile || !hydrateCurrentUserFromSession(session, profile)) {
      clearAuthHint();
      currentUser = null;
      currentRole = 'guest';
      return false;
    }

    return true;
  } catch (error) {
    console.error('Supabase session restore failed:', error);
    currentUser = null;
    currentRole = 'guest';
    showToast('ตรวจสอบสถานะบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', 'error');
    return false;
  }
}

async function signOutSupabase() {
  if (isSupabaseReady()) {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
  }
  clearAuthHint();
  currentUser = null;
  currentRole = 'guest';
}


function getDefaultDB() {
  const fallback = window.DEFAULT_DATA || {
    adminAuth: { username: 'ADMINSCLRP', password: 'ADMINSCLRP3345' },
    users: [
      { id: '12345', name: 'นักเรียนตัวอย่าง', password: '123', role: 'student', class: 'ม.6/1' }
    ],
    reports: [],
    achievements: [],
    news: [],
    links: [],
    songs: [],
    lostFound: [],
    chats: {}
  };

  return {
    ...fallback,
    adminAuth: { username: 'ADMINSCLRP', password: 'ADMINSCLRP3345', ...(fallback.adminAuth || {}) },
    users: Array.isArray(fallback.users) ? fallback.users : [],
    reports: Array.isArray(fallback.reports) ? fallback.reports : [],
    achievements: Array.isArray(fallback.achievements) ? fallback.achievements : [],
    news: Array.isArray(fallback.news) ? fallback.news : [],
    links: Array.isArray(fallback.links) ? fallback.links : [],
    songs: Array.isArray(fallback.songs) ? fallback.songs : [],
    lostFound: Array.isArray(fallback.lostFound) ? fallback.lostFound : [],
    chats: fallback.chats && typeof fallback.chats === 'object' ? fallback.chats : {}
  };
}

function normalizeDB(data) {
  const fallback = getDefaultDB();
  return {
    ...fallback,
    ...(data || {}),
    adminAuth: { ...fallback.adminAuth, ...(data?.adminAuth || {}) },
    users: Array.isArray(data?.users) ? data.users : fallback.users,
    reports: Array.isArray(data?.reports) ? data.reports : fallback.reports,
    achievements: Array.isArray(data?.achievements) ? data.achievements : fallback.achievements,
    news: Array.isArray(data?.news) ? data.news : fallback.news,
    links: Array.isArray(data?.links) ? data.links : fallback.links,
    songs: Array.isArray(data?.songs) ? data.songs : fallback.songs,
    lostFound: Array.isArray(data?.lostFound) ? data.lostFound : fallback.lostFound,
    chats: data?.chats && typeof data.chats === 'object' ? data.chats : fallback.chats
  };
}

let inMemoryDB = null;

function loadDB() {
  try {
    const dataStr = window.localStorage.getItem(DB_KEY);
    if (!dataStr) {
      const defaultDb = getDefaultDB();
      inMemoryDB = defaultDb;
      try { window.localStorage.setItem(DB_KEY, JSON.stringify(defaultDb)); } catch (e) {}
      return defaultDb;
    }

    const parsed = JSON.parse(dataStr);
    const normalized = normalizeDB(parsed);
    inMemoryDB = normalized;
    return normalized;
  } catch (e) {
    const defaultDb = getDefaultDB();
    inMemoryDB = defaultDb;
    try { window.localStorage.setItem(DB_KEY, JSON.stringify(defaultDb)); } catch (e2) {}
    return defaultDb;
  }
}

function saveDB(db) {
  const merged = normalizeDB(db);
  inMemoryDB = merged;
  try { window.localStorage.setItem(DB_KEY, JSON.stringify(merged)); } catch (e) {}
  return merged;
}

let db = loadDB();
let currentUser = null;
let currentRole = 'guest'; // 'guest', 'student', 'admin'
let currentTab = 'public-achievements';
let currentChatSessionId = null;
let activeLFStatusFilter = 'all';
let activeLFCategoryFilter = 'all';
let appInitialized = false;

function safeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  return String(value);
}

function safeText(id, value) {
  const el = document.getElementById(id);
  if (el) el.innerText = value;
}

function safeValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function safeDate(value) {
  const text = safeString(value).replace('T', ' ');
  return text || 'ไม่ระบุ';
}

function renderChartFallback(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const parent = canvas.parentElement;
  if (!parent) return;
  parent.innerHTML = `
    <div class="w-full h-full min-h-[220px] flex items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-center px-4">
      <div class="text-xs font-semibold text-slate-500 dark:text-slate-400">${message}</div>
    </div>
  `;
}

// Toast Notification
function showToast(msg, type = 'info') {
  const container = document.getElementById('app-toast');
  if (!container) return;

  const toast = document.createElement('div');
  const bgClass = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-blue-600';
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info';
  
  toast.className = `toast-item pointer-events-auto p-4 rounded-2xl ${bgClass} text-white shadow-2xl flex items-center justify-between space-x-3 text-xs font-bold border border-white/20`;
  toast.innerHTML = `
    <div class="flex items-center space-x-2.5">
      <i class="fa-solid ${icon} text-lg"></i>
      <span>${msg}</span>
    </div>
    <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white"><i class="fa-solid fa-xmark"></i></button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

function showLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  clearTimeout(modal.closeTimer);
  modal.classList.remove('is-closing', 'hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal || modal.classList.contains('hidden')) return;
  clearTimeout(modal.closeTimer);
  modal.classList.add('is-closing');
  modal.closeTimer = setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('is-closing');
    modal.setAttribute('aria-hidden', 'true');
  }, 200);
}

// Navigation & Tab Switching
function switchTab(tabId) {
  currentTab = tabId;
  document.body.classList.toggle('login-shell', tabId === 'login');
  const sections = document.querySelectorAll('main > section');
  sections.forEach(sec => sec.classList.add('hidden'));

  const targetView = document.getElementById(`view-${tabId}`);
  if (targetView) {
    targetView.classList.remove('hidden');
  }

  const mainContent = document.querySelector('main');
  if (mainContent) mainContent.scrollTo({ top: 0, behavior: 'smooth' });

  // Update active sidebar link styling
  const links = document.querySelectorAll('.sidebar-link');
  links.forEach(link => {
    if (link.getAttribute('href') === `#${tabId}`) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Header Title mapping
  const titles = {
    'public-achievements': 'สรุปผลงานและการแก้ไขปัญหา',
    'student-news': 'ข่าวสารและประกาศ',
    'student-links': 'ศูนย์รวมลิงก์สำคัญ',
    'student-report': 'แจ้งปัญหากิจการโรงเรียน',
    'student-chat': 'แชทกับแอดมิน',
    'student-track': 'ติดตามสถานะปัญหา',
    'student-songs': 'ขอเพลงสภานักเรียน',
    'student-lostfound': 'ของหายได้คืน',
    'admin-dashboard': 'Dashboard สรุปผล',
    'admin-reports': 'จัดการปัญหาที่แจ้งเข้ามา',
    'admin-news': 'จัดการข่าวสาร',
    'admin-links': 'จัดการลิงก์สำคัญ',
    'admin-chat': 'หน้าจอแชทผู้ดูแล',
    'admin-achievements': 'จัดการผลงานสภาฯ',
    'admin-songs': 'จัดการคิวขอเพลง',
    'admin-lostfound': 'จัดการของหายได้คืน',
    'login': 'เข้าสู่ระบบ'
  };

  const headerTitle = document.getElementById('page-header-title');
  if (headerTitle) {
    headerTitle.innerText = titles[tabId] || 'ระบบจัดการสภานักเรียน';
  }

  // Close the compact mobile navigation after selecting a destination.
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar && sidebar.classList.contains('is-menu-open')) {
    sidebar.classList.remove('is-menu-open');
    sidebar.setAttribute('aria-expanded', 'false');
    const menuButton = document.getElementById('nav-menu-toggle');
    menuButton?.setAttribute('aria-expanded', 'false');
    menuButton?.setAttribute('aria-label', 'เปิดเมนู');
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  // View specific triggers
  if (tabId === 'public-achievements') renderPublicAchievements();
  if (tabId === 'student-news') renderStudentNews();
  if (tabId === 'student-links') renderStudentLinks();
  if (tabId === 'student-report') initStudentReportForm();
  if (tabId === 'student-track') renderStudentTrack();
  if (tabId === 'student-songs') renderStudentSongs();
  if (tabId === 'student-lostfound') renderStudentLostFound();
  if (tabId === 'student-chat') renderStudentChat();
  if (tabId === 'admin-dashboard') renderAdminDashboard();
  if (tabId === 'admin-reports') renderAdminReports();
  if (tabId === 'admin-news') renderAdminNews();
  if (tabId === 'admin-links') renderAdminLinks();
  if (tabId === 'admin-achievements') renderAdminAchievements();
  if (tabId === 'admin-songs') renderAdminSongs();
  if (tabId === 'admin-lostfound') renderAdminLostFound();
  if (tabId === 'admin-chat') renderAdminChat();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const isOpening = !sidebar.classList.contains('is-menu-open');
  sidebar.classList.toggle('is-menu-open', isOpening);
  sidebar.setAttribute('aria-expanded', String(isOpening));
  const menuButton = document.getElementById('nav-menu-toggle');
  menuButton?.setAttribute('aria-expanded', String(isOpening));
  menuButton?.setAttribute('aria-label', isOpening ? 'ปิดเมนู' : 'เปิดเมนู');
  if (overlay) {
    overlay.classList.toggle('hidden', !isOpening);
    overlay.setAttribute('aria-hidden', String(!isOpening));
  }
}

function toggleDarkMode() {
  const html = document.documentElement;
  html.classList.toggle('dark');
  const isDark = html.classList.contains('dark');
  const themeText = document.getElementById('theme-text');
  const themeIcon = document.getElementById('theme-icon');
  if (themeText) themeText.innerText = isDark ? 'โหมดสว่าง' : 'โหมดมืด';
  if (themeIcon) themeIcon.className = isDark ? 'fa-solid fa-sun text-yellow-400' : 'fa-solid fa-moon text-amber-400';
}

// Authentication Controller
function handleAuthAction() {
  if (currentRole !== 'guest') {
    signOutSupabase().then(() => {
      updateUIAuth();
      showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
      switchTab('login');
    }).catch(error => {
      console.error('Supabase sign out failed:', error);
      showToast('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง', 'error');
    });
  } else {
    switchTab('login');
  }
}

function setLoginRole(role) {
  const tabStudent = document.getElementById('login-tab-student');
  const tabAdmin = document.getElementById('login-tab-admin');
  const formStudent = document.getElementById('form-login-student');
  const formAdmin = document.getElementById('form-login-admin');
  const formRegister = document.getElementById('form-register-student');
  const formAdminRegister = document.getElementById('form-register-admin');

  if (role === 'student') {
    if (tabStudent) tabStudent.className = 'flex-1 py-3.5 text-xs font-bold border-b-2 border-school-blue text-school-blue dark:text-school-yellow dark:border-school-yellow transition-all';
    if (tabAdmin) tabAdmin.className = 'flex-1 py-3.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all';
    if (formStudent) formStudent.classList.remove('hidden');
    if (formAdmin) formAdmin.classList.add('hidden');
    if (formRegister) formRegister.classList.add('hidden');
    if (formAdminRegister) formAdminRegister.classList.add('hidden');
  } else {
    if (tabAdmin) tabAdmin.className = 'flex-1 py-3.5 text-xs font-bold border-b-2 border-slate-800 text-slate-900 dark:text-white dark:border-white transition-all';
    if (tabStudent) tabStudent.className = 'flex-1 py-3.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all';
    if (formAdmin) formAdmin.classList.remove('hidden');
    if (formStudent) formStudent.classList.add('hidden');
    if (formRegister) formRegister.classList.add('hidden');
    if (formAdminRegister) formAdminRegister.classList.add('hidden');
  }
}

function toggleAdminRegister(show) {
  const login = document.getElementById('form-login-admin');
  const register = document.getElementById('form-register-admin');
  if (show) {
    login?.classList.add('hidden');
    register?.classList.remove('hidden');
    register?.setAttribute('aria-hidden', 'false');
  } else {
    register?.classList.add('hidden');
    login?.classList.remove('hidden');
    register?.setAttribute('aria-hidden', 'true');
  }
}

function toggleLoginRegister(type) {
  const formStudent = document.getElementById('form-login-student');
  const formRegister = document.getElementById('form-register-student');
  if (type === 'register') {
    if (formStudent) formStudent.classList.add('hidden');
    if (formRegister) formRegister.classList.remove('hidden');
  } else {
    if (formRegister) formRegister.classList.add('hidden');
    if (formStudent) formStudent.classList.remove('hidden');
  }
}

// Thai keyboards can type ๐-๙; convert them (and stray spaces) to plain digits.
function normalizeDigits(value) {
  return String(value || '').replace(/[\u0E50-\u0E59]/g, d => String(d.charCodeAt(0) - 0x0E50)).replace(/\s+/g, '');
}

// Never let a stalled network/auth call leave the screen frozen.
function withTimeout(promise, ms, message = 'TIMEOUT') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { const err = new Error(message); err.code = 'TIMEOUT'; reject(err); }, ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

function schoolAuthEmail(identifier) {
  // Internal Auth identifier only. Users NEVER type or see this value.
  // Supabase Auth requires an email-shaped identifier for password auth,
  // so the website keeps the real login UI as Student ID + Password.
  const clean = normalizeDigits(identifier).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `account-${clean}@school-auth.invalid`;
}

function showLoginError(message) {
  const errorBox = document.getElementById('login-error');
  const errorMsg = document.getElementById('login-error-msg');
  if (errorBox) errorBox.classList.remove('hidden');
  if (errorMsg) errorMsg.innerText = message;
}

let loginSubmissionActive = false;
async function submitLogin(role) {
  if (loginSubmissionActive) return;
  loginSubmissionActive = true;
  const button = document.querySelector(`#form-login-${role} button[type="submit"]`);
  const oldHtml = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.classList.add('sc-busy');
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>กำลังเข้าสู่ระบบ...';
  }
  try {
    await withTimeout(performLogin(role), 25000);
  } catch (error) {
    console.error('Login request failed:', error);
    showLoginError(error?.code === 'TIMEOUT'
      ? 'ระบบตอบสนองช้า กรุณาลองใหม่อีกครั้ง (ถ้ายังไม่ได้ ลองปิดแล้วเปิดเบราว์เซอร์ใหม่)'
      : 'เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
  } finally {
    loginSubmissionActive = false;
    if (button) {
      button.disabled = false;
      button.classList.remove('sc-busy');
      if (oldHtml) button.innerHTML = oldHtml;
    }
  }
}

async function refreshPostLoginData() {
  try {
    await refreshRemoteReports();
    if (currentRole === 'admin') await refreshRemoteUsers();
  } catch (error) {
    console.error('Post-login data refresh failed:', error);
    showToast('เข้าสู่ระบบแล้ว แต่โหลดข้อมูลบางส่วนไม่สำเร็จ กรุณาลองเปิดหน้านี้อีกครั้ง', 'error');
  }
}

async function performLogin(role) {
  const errorBox = document.getElementById('login-error');
  if (errorBox) errorBox.classList.add('hidden');

  if (!isSupabaseReady()) {
    showLoginError('ยังไม่ได้ตั้งค่า Supabase กรุณาใส่ Project URL และ Publishable Key ใน supabase-config.js');
    return;
  }

  if (role === 'student') {
    const studentId = normalizeDigits(document.getElementById('login-student-id').value);
    const studentPass = document.getElementById('login-student-pass').value;

    if (!studentId || !studentPass) {
      showLoginError('กรุณากรอกรหัสนักเรียนและรหัสผ่าน');
      return;
    }

    const { data, error } = await withTimeout(sb.auth.signInWithPassword({
      email: schoolAuthEmail(studentId),
      password: studentPass
    }), 15000);

    if (error || !data.user) {
      showLoginError(error?.message?.toLowerCase().includes('rate limit') ? 'ระบบจำกัดการเข้าสู่ระบบชั่วคราว กรุณารอสักครู่แล้วลองใหม่' : 'รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง');
      return;
    }

    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id,student_id,name,role,classroom,email')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.role !== 'student') {
      await sb.auth.signOut();
      showLoginError('ไม่พบบัญชีนักเรียนในระบบ');
      return;
    }

    currentUser = mapSupabaseProfile(profile);
    currentRole = 'student';
    await refreshPostLoginData();
    updateUIAuth();
    showToast(`ยินดีต้อนรับ ${currentUser.name}`, 'success');
    switchTab('student-news');

  } else if (role === 'admin') {
    const username = document.getElementById('login-admin-user').value.trim();
    const pass = document.getElementById('login-admin-pass').value;

    if (!username || !pass) {
      showLoginError('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
      return;
    }

    const { data, error } = await withTimeout(sb.auth.signInWithPassword({
      email: schoolAuthEmail(username),
      password: pass
    }), 15000);

    if (error || !data.user) {
      showLoginError(error?.message?.toLowerCase().includes('rate limit') ? 'ระบบจำกัดการเข้าสู่ระบบชั่วคราว กรุณารอสักครู่แล้วลองใหม่' : 'ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
      return;
    }

    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id,student_id,name,role,classroom,email')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile || profile.role !== 'admin') {
      await sb.auth.signOut();
      showLoginError('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ');
      return;
    }

    currentUser = mapSupabaseProfile(profile);
    currentRole = 'admin';
    await refreshPostLoginData();
    updateUIAuth();
    showToast('เข้าสู่ระบบผู้ดูแลเรียบร้อย', 'success');
    switchTab('admin-dashboard');
  }
}

async function submitAdminRegister() {
  if (!isSupabaseReady()) {
    showLoginError('ยังไม่ได้ตั้งค่า Supabase กรุณาตั้งค่า Project URL และ Publishable Key ก่อน');
    return;
  }

  const username = document.getElementById('register-admin-user')?.value.trim();
  const name = document.getElementById('register-admin-name')?.value.trim();
  const password = document.getElementById('register-admin-pass')?.value || '';
  const confirm = document.getElementById('register-admin-pass-confirm')?.value || '';
  const setupCode = document.getElementById('register-admin-code')?.value || '';

  if (!/^[A-Za-z0-9_-]{4,32}$/.test(username)) {
    showLoginError('Username ต้องเป็นภาษาอังกฤษ ตัวเลข _ หรือ - และยาว 4-32 ตัวอักษร');
    return;
  }
  if (!name || password.length < 8 || password !== confirm || !setupCode) {
    showLoginError('กรุณากรอกข้อมูลให้ครบ และรหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
    return;
  }

  const button = document.querySelector('#form-register-admin button[type=submit]');
  if (button) {
    button.disabled = true;
    button.dataset.oldText = button.innerHTML;
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>กำลังสร้างบัญชี...';
  }

  try {
    const { data, error } = await sb.functions.invoke('create-admin', {
      body: { username, name, password, setup_code: setupCode }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'สร้างบัญชีผู้ดูแลไม่สำเร็จ');

    const { data: loginData, error: loginError } = await sb.auth.signInWithPassword({
      email: schoolAuthEmail(username),
      password
    });
    if (loginError || !loginData.user) throw loginError || new Error('เข้าสู่ระบบผู้ดูแลหลังสมัครไม่สำเร็จ');

    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id,student_id,name,role,classroom,email')
      .eq('id', loginData.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.role !== 'admin') {
      await sb.auth.signOut();
      throw profileError || new Error('ไม่พบข้อมูลผู้ดูแล');
    }

    currentUser = mapSupabaseProfile(profile);
    currentRole = 'admin';
    await refreshPostLoginData();
    updateUIAuth();
    document.getElementById('form-register-admin')?.reset();
    showToast(`สร้างบัญชีผู้ดูแลสำเร็จ ยินดีต้อนรับ ${currentUser.name}`, 'success');
    switchTab('admin-dashboard');
  } catch (err) {
    console.error('Admin registration failed:', err);
    const msg = String(err?.message || err || '');
    if (msg.toLowerCase().includes('already') || msg.includes('มีอยู่แล้ว') || msg.includes('duplicate')) {
      showLoginError('Username นี้มีบัญชีอยู่แล้ว กรุณาใช้ชื่ออื่นหรือเข้าสู่ระบบ');
    } else if (msg.toLowerCase().includes('invalid setup code') || msg.includes('รหัสเปิดสมัคร')) {
      showLoginError('รหัสเปิดสมัครผู้ดูแลไม่ถูกต้อง');
    } else {
      showLoginError(msg || 'สร้างบัญชีผู้ดูแลไม่สำเร็จ');
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = button.dataset.oldText || '<i class="fa-solid fa-user-shield mr-1.5"></i>สร้างบัญชีผู้ดูแล';
    }
  }
}

async function submitRegister() {
  if (!isSupabaseReady()) {
    showLoginError('ยังไม่ได้ตั้งค่า Supabase กรุณาตั้งค่า Project URL และ Publishable Key ก่อน');
    return;
  }

  const name = document.getElementById('register-student-name')?.value.trim();
  const studentId = normalizeDigits(document.getElementById('register-student-id')?.value);
  const classroom = document.getElementById('register-student-class')?.value.trim();
  const password = document.getElementById('register-student-pass')?.value || '';
  const confirm = document.getElementById('register-student-pass-confirm')?.value || '';

  if (!name || !/^\d{5}$/.test(studentId) || !classroom || password.length < 6) {
    showLoginError('กรุณากรอกชื่อ ห้องเรียน รหัสนักเรียน 5 หลัก และรหัสผ่านอย่างน้อย 6 ตัวอักษร');
    return;
  }
  if (password !== confirm) {
    showLoginError('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
    return;
  }

  const button = document.querySelector('#form-register-student button[type=submit]');
  if (button) { button.disabled = true; button.dataset.oldText = button.innerHTML; button.innerHTML = '<i class=\"fa-solid fa-spinner fa-spin mr-1.5\"></i>กำลังสร้างบัญชี...'; }
  try {
    const { data, error } = await sb.functions.invoke('create-student', {
      body: { student_id: studentId, name, classroom, password }
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'สร้างบัญชีไม่สำเร็จ');

    // The Edge Function creates the internal Auth identity. The student still only uses ID + password.
    const { data: loginData, error: loginError } = await sb.auth.signInWithPassword({
      email: schoolAuthEmail(studentId),
      password
    });
    if (loginError || !loginData.user) throw loginError || new Error('เข้าสู่ระบบหลังสมัครไม่สำเร็จ');

    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id,student_id,name,role,classroom,email')
      .eq('id', loginData.user.id)
      .maybeSingle();
    if (profileError || !profile || profile.role !== 'student') {
      await sb.auth.signOut();
      throw profileError || new Error('ไม่พบข้อมูลนักเรียน');
    }

    currentUser = mapSupabaseProfile(profile);
    currentRole = 'student';
    await refreshPostLoginData();
    updateUIAuth();
    document.getElementById('form-register-student')?.reset();
    showToast(`สมัครสมาชิกสำเร็จ ยินดีต้อนรับ ${currentUser.name}`, 'success');
    switchTab('student-news');
  } catch (err) {
    console.error('Student registration failed:', err);
    const msg = String(err?.message || err || '');
    if (msg.toLowerCase().includes('already') || msg.includes('มีอยู่แล้ว') || msg.includes('duplicate')) {
      showLoginError('รหัสนักเรียนนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ');
    } else if (msg.toLowerCase().includes('rate limit')) {
      showLoginError('ระบบจำกัดคำขอชั่วคราว กรุณารอสักครู่แล้วลองใหม่');
    } else {
      showLoginError(msg || 'สมัครสมาชิกไม่สำเร็จ');
    }
  } finally {
    if (button) { button.disabled = false; button.innerHTML = button.dataset.oldText || '<i class=\"fa-solid fa-user-plus mr-1.5\"></i>สมัครสมาชิก'; }
  }
}

function updateUIAuth() {
  const studentMenu = document.getElementById('sidebar-student-menu');
  const adminMenu = document.getElementById('sidebar-admin-menu');
  const authBtn = document.getElementById('sidebar-auth-btn');
  const sidebarUserPanel = document.getElementById('sidebar-user-panel');

  const headerUserName = document.getElementById('header-user-name');
  const headerUserClass = document.getElementById('header-user-class');
  const sidebarUserName = document.getElementById('sidebar-user-name');
  const sidebarUserRole = document.getElementById('sidebar-user-role');

  const safeUserName = currentUser?.name || 'ผู้เยี่ยมชม';
  const safeUserClass = currentUser?.class || 'สาธารณะ';

  if (currentRole === 'student') {
    if (studentMenu) studentMenu.classList.remove('hidden');
    if (adminMenu) adminMenu.classList.add('hidden');
    if (sidebarUserPanel) sidebarUserPanel.classList.remove('hidden');
    if (authBtn) {
      authBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i><span>ออกจากระบบ</span>';
      authBtn.className = 'w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition-all duration-150 flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/20';
    }

    if (headerUserName) headerUserName.innerText = safeUserName;
    if (headerUserClass) headerUserClass.innerText = safeUserClass;
    if (sidebarUserName) sidebarUserName.innerText = safeUserName;
    if (sidebarUserRole) sidebarUserRole.innerText = `นักเรียน (${safeUserClass})`;
  } else if (currentRole === 'admin') {
    if (studentMenu) studentMenu.classList.add('hidden');
    if (adminMenu) adminMenu.classList.remove('hidden');
    if (sidebarUserPanel) sidebarUserPanel.classList.remove('hidden');
    if (authBtn) {
      authBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i><span>ออกจากระบบ</span>';
      authBtn.className = 'w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm transition-all duration-150 flex items-center justify-center space-x-2 shadow-lg shadow-rose-600/20';
    }

    if (headerUserName) headerUserName.innerText = '';
    if (headerUserClass) headerUserClass.innerText = 'สภานักเรียน';
    if (sidebarUserName) sidebarUserName.innerText = '';
    if (sidebarUserRole) sidebarUserRole.innerText = 'ผู้ดูแลระบบ';
  } else {
    if (studentMenu) studentMenu.classList.add('hidden');
    if (adminMenu) adminMenu.classList.add('hidden');
    if (sidebarUserPanel) sidebarUserPanel.classList.add('hidden');
    if (authBtn) {
      authBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i><span>เข้าสู่ระบบ</span>';
      authBtn.className = 'w-full py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition-all duration-150 flex items-center justify-center space-x-2 shadow-lg shadow-blue-600/30';
    }

    if (headerUserName) headerUserName.innerText = 'ผู้เยี่ยมชม';
    if (headerUserClass) headerUserClass.innerText = 'สาธารณะ';
  }
}

// 1. PUBLIC ACHIEVEMENTS CONTROLLER
function renderPublicAchievements() {
  db = loadDB();
  const reports = Array.isArray(db.publicReports) ? db.publicReports : (Array.isArray(db.reports) ? db.reports : []);

  const total = reports.length;
  const completed = reports.filter(r => r?.status === 'completed').length;
  const processing = reports.filter(r => r?.status === 'processing' || r?.status === 'pending').length;
  const failed = reports.filter(r => r?.status === 'failed').length;

  safeText('pub-stat-total', total);
  safeText('pub-stat-completed', completed);
  safeText('pub-stat-processing', processing);
  safeText('pub-stat-failed', failed);

  const successPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
  safeText('pub-success-percent', `${successPercent}%`);
  safeText('pub-success-count', `${completed} เรื่อง`);
  safeText('pub-failed-count', `${failed} เรื่อง`);

  const ctxSuccess = document.getElementById('pubSuccessChart');
  if (ctxSuccess) {
    if (window.pubChart1) window.pubChart1.destroy();
    if (typeof Chart === 'function') {
      window.pubChart1 = new Chart(ctxSuccess, {
        type: 'doughnut',
        data: {
          labels: ['เสร็จสิ้น', 'ไม่สามารถทำได้', 'กำลังดำเนินการ'],
          datasets: [{
            data: [completed, failed, processing],
            backgroundColor: ['#16a34a', '#e11d48', '#f1c644'],
            borderWidth: 0
          }]
        },
        options: {
          cutout: '78%',
          plugins: { legend: { display: false } },
          responsive: true,
          maintainAspectRatio: false
        }
      });
    } else {
      renderChartFallback('pubSuccessChart', 'กราฟสถิติไม่สามารถโหลดได้ในตอนนี้');
    }
  }

  const ctxCat = document.getElementById('pubCategoryChart');
  if (ctxCat) {
    const cats = ['อาคารสถานที่', 'ห้องน้ำ', 'ไฟฟ้า', 'อินเทอร์เน็ต', 'ความสะอาด', 'ความปลอดภัย', 'อื่น ๆ'];
    const catCounts = cats.map(c => reports.filter(r => r?.category === c).length);

    if (window.pubChart2) window.pubChart2.destroy();
    if (typeof Chart === 'function') {
      window.pubChart2 = new Chart(ctxCat, {
        type: 'bar',
        data: {
          labels: cats,
          datasets: [{
            label: 'จำนวนเรื่อง',
            data: catCounts,
            backgroundColor: '#2456a6',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } }
          }
        }
      });
    } else {
      renderChartFallback('pubCategoryChart', 'กราฟหมวดหมู่ไม่สามารถโหลดได้ในตอนนี้');
    }
  }

  // Recent public-facing report summary (never expose reporter identity)
  const recent = document.getElementById('pub-recent-reports');
  if (recent) {
    const statusMeta = {
      completed: { label: 'เสร็จสิ้น', cls: 'done', icon: 'fa-circle-check' },
      processing: { label: 'กำลังดำเนินการ', cls: 'working', icon: 'fa-spinner' },
      pending: { label: 'รอดำเนินการ', cls: 'pending', icon: 'fa-clock' },
      failed: { label: 'ไม่สามารถดำเนินการ', cls: 'failed', icon: 'fa-circle-xmark' }
    };
    const latest = [...reports].sort((a,b) => String(b?.datetime||'').localeCompare(String(a?.datetime||''))).slice(0,6);
    recent.innerHTML = latest.length ? latest.map((r, i) => {
      const meta = statusMeta[r?.status] || statusMeta.pending;
      const title = scEscape(r?.title || 'เรื่องที่แจ้งเข้ามา');
      const category = scEscape(r?.category || 'อื่น ๆ');
      const location = scEscape(r?.location || 'ไม่ระบุสถานที่');
      const date = scEscape(safeDate(r?.resolutionDate || r?.datetime || '').split(' ')[0] || 'ไม่ระบุ');
      return `<article class="public-report-card" style="--delay:${i * 70}ms">
        <div class="public-report-top"><span class="public-status ${meta.cls}"><i class="fa-solid ${meta.icon}"></i>${meta.label}</span><span class="public-report-date">${date}</span></div>
        <h4>${title}</h4>
        <div class="public-report-meta"><span><i class="fa-solid fa-tag"></i>${category}</span><span><i class="fa-solid fa-location-dot"></i>${location}</span></div>
      </article>`;
    }).join('') : `<div class="public-empty-state"><i class="fa-regular fa-folder-open"></i><strong>ยังไม่มีรายการปัญหา</strong><span>เมื่อมีการแจ้งปัญหา รายการจะปรากฏที่นี่</span></div>`;
  }

  const grid = document.getElementById('pub-achievements-grid');
  if (grid) {
    const achievements = Array.isArray(db.achievements) ? db.achievements : [];
    grid.innerHTML = achievements.map(item => `
      <div class="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-premium border border-slate-100 dark:border-slate-700/50 flex flex-col justify-between">
        <div>
          <div class="h-44 bg-slate-100 dark:bg-slate-900 relative overflow-hidden">
            <img src="${scEscape(safeString(item?.imgUrl).trim() || 'https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?w=800')}" class="w-full h-full object-cover" alt="achievement">
            <span class="absolute bottom-3 left-3 px-3 py-1 bg-slate-950/80 backdrop-blur-md text-yellow-400 rounded-full text-[10px] font-extrabold font-english border border-yellow-400/30">
              <i class="fa-solid fa-trophy mr-1"></i>${scEscape(safeString(item?.date, 'ไม่ระบุ'))}</span>
          </div>
          <div class="p-6">
            <h4 class="font-extrabold text-base text-slate-900 dark:text-white leading-snug">${scEscape(safeString(item?.headline, 'หัวข้อผลงาน'))}</h4>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">โดย: ${scEscape(safeString(item?.responsible, 'ไม่ระบุ'))}</p>
            <p class="text-xs text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">${scEscape(safeString(item?.content, 'ไม่มีรายละเอียด'))}</p>
          </div>
        </div>
      </div>
    `).join('');
  }
}

// 2. STUDENT NEWS CONTROLLER
function renderStudentNews() {
  db = loadDB();
  const query = (document.getElementById('news-search')?.value || '').toLowerCase();
  const newsList = (Array.isArray(db.news) ? db.news : []).filter(n => {
    const headline = safeString(n?.headline, '').toLowerCase();
    const content = safeString(n?.content, '').toLowerCase();
    return headline.includes(query) || content.includes(query);
  });

  safeText('student-news-count', newsList.length);
  const grid = document.getElementById('student-news-grid');
  if (!grid) return;

  grid.innerHTML = newsList.map(item => `
    <div onclick="openStudentNewsModal('${scEscape(safeString(item?.id, 'news'))}')" class="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-premium border border-slate-100 dark:border-slate-700/50 cursor-pointer hover:-translate-y-1.5 transition-all duration-200">
      <div class="h-48 bg-slate-100 dark:bg-slate-900 relative">
        <img src="${scEscape(safeString(item?.imgUrl).trim() || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800')}" class="w-full h-full object-cover" alt="news">
      </div>
      <div class="p-6">
        <span class="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider font-english">${scEscape(safeString(item?.date, 'ไม่ระบุ'))}</span>
        <h4 class="font-extrabold text-base text-slate-900 dark:text-white mt-1 line-clamp-2">${scEscape(safeString(item?.headline, 'ข่าวสาร'))}</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-3 leading-relaxed">${scEscape(safeString(item?.content, 'ไม่มีรายละเอียด'))}</p>
      </div>
    </div>
  `).join('');
}

function openStudentNewsModal(id) {
  db = loadDB();
  const item = (Array.isArray(db.news) ? db.news : []).find(n => n?.id === id);
  if (!item) return;

  const img = document.getElementById('news-modal-image');
  if (img) img.src = safeString(item?.imgUrl).trim() || 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800';
  safeText('news-modal-date', safeString(item?.date, 'ไม่ระบุ'));
  safeText('news-modal-title', safeString(item?.headline, 'ข่าวสาร'));
  safeText('news-modal-content', safeString(item?.content, 'ไม่มีรายละเอียด'));

  const modal = document.getElementById('student-news-modal');
  if (modal) openModal('student-news-modal');
}

function closeStudentNewsModal() {
  closeModal('student-news-modal');
}

// 3. STUDENT LINKS CONTROLLER
function renderStudentLinks() {
  db = loadDB();
  const links = db.links || [];
  const categories = [...new Set(links.map(l => l.category))];

  const container = document.getElementById('student-links-container');
  if (!container) return;

  container.innerHTML = categories.map(cat => `
    <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-premium border border-slate-100 dark:border-slate-700/50">
      <h3 class="font-extrabold text-base text-slate-900 dark:text-white mb-4 flex items-center">
        <i class="fa-solid fa-folder-open text-blue-500 mr-2.5"></i>${scEscape(cat)}
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${links.filter(l => l.category === cat).map(link => `
          <a href="${scEscape(link.url)}" target="_blank" rel="noopener" class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/50 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700 transition flex items-center justify-between group">
            <span class="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">${scEscape(link.name)}</span>
            <i class="fa-solid fa-arrow-up-right-from-square text-xs text-slate-400 group-hover:text-blue-500 transition"></i>
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// 4. STUDENT REPORT CONTROLLER
let uploadedReportImages = [];
let reportImageFiles = [];

function initStudentReportForm() {
  reportImageFiles = [];
  if (currentUser) {
    safeValue('report-form-name', currentUser.name || '');
    safeValue('report-form-id', currentUser.id || '');
    safeValue('report-form-class', currentUser.class || '');
  }
  safeValue('report-title', '');
  safeValue('report-category', '');
  safeValue('report-location', '');
  safeValue('report-datetime', '');
  safeValue('report-desc', '');
  uploadedReportImages = [];
  renderReportImagePreviews();
}

function renderReportImagePreviews() {
  const container = document.getElementById('image-previews');
  if (!container) return;

  container.innerHTML = uploadedReportImages.map((img, idx) => `
    <div class="relative h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group">
      <img src="${img}" class="w-full h-full object-cover">
      <button type="button" onclick="removeReportImage(${idx});" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center opacity-90 hover:opacity-100">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');
}

function renderReportDetailPhotos(photos) {
  const container = document.getElementById('report-detail-photos');
  if (!container) return;

  const list = Array.isArray(photos) ? photos.filter(Boolean) : [];
  if (!list.length) {
    container.innerHTML = '<div class="text-xs text-slate-400">ไม่มีรูปภาพแนบ</div>';
    return;
  }

  container.innerHTML = list.map((photo, idx) => `
    <a href="${scEscape(photo)}" target="_blank" rel="noopener" class="block overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition">
      <img src="${scEscape(photo)}" alt="ภาพประกอบ ${idx + 1}" class="w-full h-24 object-cover" loading="lazy">
    </a>
  `).join('');
}


async function prepareReportImage(file, reportId) {
  if (!file || !file.type.startsWith('image/')) throw new Error('รองรับเฉพาะไฟล์รูปภาพ');
  if (file.size > MAX_SCHOOL_IMAGE_BYTES) throw new Error(`${file.name} ใหญ่เกิน 8MB`);

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safeExt = ['jpg','jpeg','png','webp'].includes(ext) ? ext : 'jpg';
  const path = `reports/${currentUser.authId}/${reportId}/${crypto.randomUUID()}.${safeExt}`;

  const { error } = await sb.storage.from('school-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;

  const { data } = sb.storage.from('school-images').getPublicUrl(path);
  return data.publicUrl;
}

async function uploadSelectedReportImages(reportId) {
  if (!reportImageFiles.length) return [];
  const urls = [];
  for (const file of reportImageFiles) {
    const url = await prepareReportImage(file, reportId);
    urls.push(url);
  }
  return urls;
}

function handleReportImagesChange(files) {
  const selected = Array.from(files || []);
  if (!selected.length) return;

  if (reportImageFiles.length + selected.length > 5) {
    showToast('อัปโหลดรูปได้สูงสุด 5 รูปต่อเรื่อง', 'error');
    return;
  }

  selected.forEach(file => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      showToast(`${file.name}: รองรับเฉพาะไฟล์ JPG, PNG, WEBP`, 'error');
      return;
    }
    if (file.size > MAX_SCHOOL_IMAGE_BYTES) {
      showToast(`${file.name} ใหญ่เกิน 8MB`, 'error');
      return;
    }

    reportImageFiles.push(file);
    uploadedReportImages.push(URL.createObjectURL(file));
  });
  renderReportImagePreviews();
}

function removeReportImage(index) {
  reportImageFiles.splice(index, 1);
  const [removedPreview] = uploadedReportImages.splice(index, 1);
  if (removedPreview && removedPreview.startsWith('blob:')) URL.revokeObjectURL(removedPreview);
  renderReportImagePreviews();
}

function initReportImageUploader() {
  const input = document.getElementById('report-images-input');
  const area = document.getElementById('image-drag-area');
  if (!input || !area || area.dataset.bound === '1') return;
  area.dataset.bound = '1';

  area.addEventListener('click', () => input.click());
  input.addEventListener('change', e => {
    handleReportImagesChange(e.target.files);
    input.value = '';
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    area.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      area.classList.add('ring-2', 'ring-blue-500');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    area.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
      area.classList.remove('ring-2', 'ring-blue-500');
    });
  });

  area.addEventListener('drop', e => {
    handleReportImagesChange(e.dataTransfer?.files);
  });
}

async function submitProblemReport() {
  // Re-check the real Supabase session immediately before submitting.
  // This prevents false 'please login' redirects after a page reload or token refresh.
  if (!isSupabaseReady()) {
    showToast('ยังไม่ได้ตั้งค่า Supabase', 'error');
    return;
  }
  const { data: sessionData, error: sessionError } = await sb.auth.getSession();
  if (sessionError || !sessionData?.session?.user) {
    showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', 'error');
    switchTab('login');
    return;
  }
  const authUserId = sessionData.session.user.id;
  // Always use the Auth UUID returned by Supabase, never a stale cached/local value.
  if (currentRole !== 'student' || !currentUser || currentUser.authId !== authUserId) {
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id,student_id,name,role,classroom,email')
      .eq('id', authUserId)
      .maybeSingle();

    if (!profileError && profile && profile.role === 'student') {
      currentUser = mapSupabaseProfile(profile);
      currentRole = 'student';
    } else {
      showToast('ไม่พบสิทธิ์นักเรียนของบัญชีนี้', 'error');
      return;
    }
  }

  const name = document.getElementById('report-form-name').value.trim();
  const studentId = (document.getElementById('report-form-id').value.trim() || currentUser.id || '').trim();
  const classroom = document.getElementById('report-form-class').value.trim() || currentUser.class || '';
  const title = document.getElementById('report-title').value.trim();
  const category = document.getElementById('report-category').value;
  const location = document.getElementById('report-location').value.trim();
  const datetime = document.getElementById('report-datetime').value;
  const description = document.getElementById('report-desc').value.trim();

  if (!title || !category || !location || !description) {
    showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
    return;
  }

  if (!isSupabaseReady()) {
    showToast('ยังไม่ได้ตั้งค่า Supabase', 'error');
    return;
  }

  const reportId = `REP-${Date.now().toString(36).toUpperCase()}`;

  const payload = {
    id: reportId,
    user_id: authUserId,
    reporter_name: name,
    reporter_id: studentId,
    classroom,
    title,
    category,
    location,
    datetime,
    description,
    photos: [],

    status: 'pending',
    resolution_date: null,
    notes: ''
  };

  showLoadingOverlay();
  try {
    payload.photos = await uploadSelectedReportImages(reportId);
  } catch (uploadError) {
    console.error('Report image upload failed:', uploadError);
    showToast('อัปโหลดรูปไม่สำเร็จ: ' + (uploadError.message || uploadError), 'error');
    hideLoadingOverlay();
    return;
  }

  try {
    const { data, error } = await sb.from('reports').insert(payload).select('*').single();

    if (error) {
      console.error('Report insert failed:', error);
      showToast('บันทึกเรื่องร้องเรียนไม่สำเร็จ: ' + error.message, 'error');
      return;
    }

    db.reports.unshift(mapSupabaseReport(data));
    inMemoryDB = normalizeDB(db);

    uploadedReportImages = [];
    reportImageFiles = [];
    renderReportImagePreviews();
    showToast('ส่งเรื่องร้องเรียนและบันทึกลงฐานข้อมูลแล้ว', 'success');
    switchTab('student-track');
  } catch (submitError) {
    console.error('Report submit crashed:', submitError);
    showToast('ส่งเรื่องร้องเรียนไม่สำเร็จ: ' + (submitError?.message || submitError), 'error');
  } finally {
    hideLoadingOverlay();
  }
}

// 5. STUDENT TRACK CONTROLLER
let activeTrackFilter = 'all';

function filterStudentTrack(status) {
  activeTrackFilter = status;
  ['all', 'pending', 'processing', 'completed', 'failed'].forEach(s => {
    const btn = document.getElementById(`track-tab-${s}`);
    if (btn) {
      if (s === status) {
        btn.className = 'px-5 py-2.5 text-xs font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400';
      } else {
        btn.className = 'px-5 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
      }
    }
  });
  renderStudentTrack();
}

function renderStudentTrack() {
  db = loadDB();
  let reports = db.reports || [];

  if (currentUser) {
    reports = reports.filter(r => r.reporterId === currentUser.id);
  }

  if (activeTrackFilter !== 'all') {
    reports = reports.filter(r => r.status === activeTrackFilter);
  }

  const container = document.getElementById('student-track-list');
  if (!container) return;

  if (reports.length === 0) {
    container.innerHTML = `
      <div class="text-center py-16 bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700/50">
        <i class="fa-solid fa-clock-rotate-left text-4xl text-slate-300 dark:text-slate-600 mb-3 block"></i>
        <p class="text-xs text-slate-400 font-medium">ยังไม่มีประวัติการแจ้งปัญหาตามเงื่อนไขนี้</p>
      </div>
    `;
    return;
  }

  const statusBadges = {
    pending: '<span class="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">รอรับเรื่อง</span>',
    processing: '<span class="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 text-xs font-bold">กำลังดำเนินการ</span>',
    completed: '<span class="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 text-xs font-bold">ดำเนินการแล้ว</span>',
    failed: '<span class="px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 text-xs font-bold">ไม่สามารถทำได้</span>'
  };

  container.innerHTML = reports.map(r => `
    <div onclick="openReportDetailModal('${r.id}')" class="p-6 bg-white dark:bg-slate-800 rounded-3xl shadow-premium border border-slate-100 dark:border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:border-blue-300 transition">
      <div>
        <div class="flex items-center space-x-3 mb-2">
          <span class="text-[11px] font-extrabold text-blue-600 dark:text-blue-400 font-english">${r.id}</span>
          ${statusBadge('report', r.status)}
          <span class="text-[11px] text-slate-400 font-medium">${scEscape(safeDate(r.datetime))}</span>
        </div>
        <h4 class="font-extrabold text-base text-slate-900 dark:text-white">${scEscape(r.title)}</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">สถานที่: ${scEscape(r.location)} | หมวดหมู่: ${scEscape(r.category)}</p>
      </div>
      <button class="py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white text-xs font-bold text-slate-700 dark:text-slate-200 transition">
        ดูรายละเอียด
      </button>
    </div>
  `).join('');
}

// Modal Detail Viewer
function closeReportDetailModal() {
  closeModal('report-detail-modal');
}

async function saveReportFromAdmin() {
  if (currentRole !== 'admin') {
    showToast('ไม่มีสิทธิ์ดำเนินการ', 'error');
    return;
  }

  const saveBtn = document.getElementById('admin-save-report-btn');
  const id = saveBtn.getAttribute('data-id');
  const status = document.getElementById('admin-action-status').value;
  const resolutionDate = document.getElementById('admin-action-resdate').value || null;
  const notes = document.getElementById('admin-action-notes').value.trim();

  if (!isSupabaseReady()) {
    showToast('ยังไม่ได้ตั้งค่า Supabase', 'error');
    return;
  }

  const { data, error } = await sb
    .from('reports')
    .update({
      status,
      resolution_date: resolutionDate,
      notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    console.error('Report update failed:', error);
    showToast('บันทึกการแก้ไขไม่สำเร็จ: ' + error.message, 'error');
    return;
  }

  const index = (db.reports || []).findIndex(item => item.id === id);
  if (index >= 0) db.reports[index] = mapSupabaseReport(data);
  inMemoryDB = normalizeDB(db);

  showToast('บันทึกการแก้ไขลงฐานข้อมูลแล้ว', 'success');
  closeReportDetailModal();
  renderAdminReports();
  renderAdminDashboard();
}

// Legacy local-only song/lost-found controllers removed. Remote Supabase controllers below are authoritative.

// 8. CHAT CONTROLLER
function renderStudentChat() {
  db = loadDB();
  const sessionKey = currentUser ? currentUser.id : 'guest';
  const messages = db.chats[sessionKey] || [];

  const container = document.getElementById('student-chat-list');
  if (!container) return;

  container.innerHTML = messages.map(m => `
    <div class="flex flex-col ${m.sender === 'student' ? 'items-end' : 'items-start'}">
      <div class="max-w-[80%] p-3.5 rounded-2xl text-xs ${m.sender === 'student' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none'} shadow-sm">
        <p class="font-normal leading-relaxed">${m.text}</p>
      </div>
      <span class="text-[9px] text-slate-400 mt-1">${m.time}</span>
    </div>
  `).join('');

  container.scrollTop = container.scrollHeight;
}

function sendStudentChat() {
  db = loadDB();
  const input = document.getElementById('student-chat-input');
  const text = input.value.trim();
  if (!text) return;

  const sessionKey = currentUser ? currentUser.id : 'guest';
  if (!db.chats[sessionKey]) db.chats[sessionKey] = [];

  db.chats[sessionKey].push({
    sender: 'student',
    text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  saveDB(db);
  input.value = '';
  renderStudentChat();
}

// 9. ADMIN DASHBOARD & TABLES
function renderAdminDashboard() {
  db = loadDB();
  document.getElementById('admin-kpi-users').innerText = (db.users || []).length;
  document.getElementById('admin-kpi-reports').innerText = (db.reports || []).length;
  document.getElementById('admin-kpi-completed').innerText = (db.reports || []).filter(r => r.status === 'completed').length;
  document.getElementById('admin-kpi-processing').innerText = (db.reports || []).filter(r => r.status === 'processing' || r.status === 'pending').length;

  const ctxCat = document.getElementById('adminCategoryChart');
  if (ctxCat) {
    const cats = ['อาคารสถานที่', 'ห้องน้ำ', 'ไฟฟ้า', 'อินเทอร์เน็ต', 'ความสะอาด', 'ความปลอดภัย', 'อื่น ๆ'];
    const catCounts = cats.map(c => (db.reports || []).filter(r => r.category === c).length);

    if (window.adminChart1) window.adminChart1.destroy();
    window.adminChart1 = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: cats,
        datasets: [{ data: catCounts, backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'] }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  const recentTbody = document.getElementById('admin-recent-reports-table');
  if (recentTbody) {
    recentTbody.innerHTML = (db.reports || []).slice(0, 5).map(r => `
      <tr class="border-b border-slate-100 dark:border-slate-700/50">
        <td class="py-3 px-2 font-bold">${scEscape(r.title)}</td>
        <td class="py-3 px-2 text-slate-500">${scEscape(r.category)}</td>
        <td class="py-3 px-2">${scEscape(r.reporterName)}</td>
        <td class="py-3 px-2 font-english text-slate-400">${scEscape(safeDate(r.datetime).split(' ')[0])}</td>
        <td class="py-3 px-2 text-center">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
            ${r.status}
          </span>
        </td>
        <td class="py-3 px-2 text-right">
          <button onclick="openReportDetailModal('${r.id}')" class="text-blue-600 font-bold hover:underline">จัดการ</button>
        </td>
      </tr>
    `).join('');
  }
}

function renderAdminReports() {
  db = loadDB();
  let reports = db.reports || [];
  const status = document.getElementById('admin-report-filter-status')?.value;
  const category = document.getElementById('admin-report-filter-category')?.value;
  const query = (document.getElementById('admin-report-search')?.value || '').toLowerCase();

  if (status && status !== 'all') reports = reports.filter(r => r.status === status);
  if (category && category !== 'all') reports = reports.filter(r => r.category === category);
  if (query) reports = reports.filter(r => r.title.toLowerCase().includes(query) || r.reporterName.toLowerCase().includes(query));

  const tbody = document.getElementById('admin-all-reports-table');
  if (!tbody) return;

  tbody.innerHTML = reports.map(r => `
    <tr>
      <td class="p-4"><span class="font-bold text-blue-600 font-english">${r.id}</span><br><span class="text-slate-400">${scEscape(r.reporterName)} (${scEscape(r.classroom)})</span></td>
      <td class="p-4 font-semibold text-slate-600 dark:text-slate-300">${scEscape(r.category)}</td>
      <td class="p-4"><span class="font-bold">${scEscape(r.title)}</span><br><span class="text-slate-400">${scEscape(r.location)}</span></td>
      <td class="p-4 font-english text-slate-500">${scEscape(safeDate(r.datetime))}</td>
      <td class="p-4 text-center">
        ${statusBadge('report', r.status)}
      </td>
      <td class="p-4 text-right">
        <button onclick="openReportDetailModal('${r.id}')" class="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold">จัดการ</button>
      </td>
    </tr>
  `).join('');
}

/* ============================================================
 * FULL SUPABASE DATA LAYER
 * The website keeps UI state in memory only. Shared data lives in Supabase.
 * ============================================================ */

function scEscape(value) {
  return safeString(value).replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}

function scId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/* -------------------- shared UI helpers (unified badges + admin charts) -------------------- */
const SC_STATUS_META = {
  report: {
    pending: ['รอรับเรื่อง', 'neutral', 'fa-clock'],
    processing: ['กำลังดำเนินการ', 'warning', 'fa-spinner'],
    completed: ['ดำเนินการแล้ว', 'success', 'fa-circle-check'],
    failed: ['ไม่สามารถทำได้', 'danger', 'fa-circle-xmark']
  },
  song: {
    pending: ['รอคิว', 'neutral', 'fa-clock'],
    approved: ['เตรียมเปิด', 'info', 'fa-headphones'],
    played: ['เปิดแล้ว', 'success', 'fa-circle-check'],
    rejected: ['ปฏิเสธ', 'danger', 'fa-ban']
  },
  lf: {
    searching: ['กำลังตามหา', 'warning', 'fa-magnifying-glass'],
    found_matching: ['พบของที่ตรงกัน', 'info', 'fa-handshake'],
    returned: ['ส่งคืนแล้ว', 'success', 'fa-circle-check']
  }
};

async function refreshPublicReports() {
  if (!isSupabaseReady() || typeof sb.rpc !== 'function') return;
  const { data, error } = await sb.rpc('public_report_overview');
  if (error) {
    if (!refreshPublicReports.warned) console.info('public_report_overview is not installed yet; public stats use the signed-in user\'s own reports.');
    refreshPublicReports.warned = true;
    return;
  }
  db.publicReports = (data || []).map(r => ({
    id: r.id, title: r.title || '', category: r.category || '', location: r.location || '',
    datetime: r.datetime || '', status: r.status || 'pending', resolutionDate: r.resolution_date || ''
  }));
  inMemoryDB = normalizeDB(db);
}

function statusBadge(kind, status) {
  const meta = SC_STATUS_META[kind]?.[status] || [status || '-', 'neutral', 'fa-circle'];
  return `<span class="sc-badge sc-badge--${meta[1]}"><i class="fa-solid ${meta[2]}"></i>${scEscape(meta[0])}</span>`;
}

function typeBadge(type) {
  return type === 'lost'
    ? '<span class="sc-badge sc-badge--danger"><i class="fa-solid fa-magnifying-glass"></i>ของหาย</span>'
    : '<span class="sc-badge sc-badge--success"><i class="fa-solid fa-hand-holding-heart"></i>เก็บได้</span>';
}

function lfCategoryLabel(value) {
  const found = (typeof lostFoundCategories !== 'undefined' ? lostFoundCategories : []).find(c => c.value === value);
  return found ? found.label : (value || '-');
}

const SC_REPORT_CATEGORIES = ['อาคารสถานที่', 'ห้องน้ำ', 'ไฟฟ้า', 'อินเทอร์เน็ต', 'ความสะอาด', 'ความปลอดภัย', 'อื่น ๆ'];
const SC_CHART_PALETTE = ['#2456a6', '#3475ce', '#f1c644', '#173b78', '#7fa6de', '#d6a916', '#94a3b8'];

function renderAdminCharts(reports) {
  if (typeof Chart !== 'function') return;
  const isDark = document.documentElement.classList.contains('dark');
  const tick = isDark ? '#9cabc0' : '#68778e';
  const grid = isDark ? 'rgba(170,193,226,.12)' : 'rgba(36,67,117,.08)';

  const catCanvas = document.getElementById('adminCategoryChart');
  if (catCanvas) {
    if (window.adminChart1) window.adminChart1.destroy();
    window.adminChart1 = new Chart(catCanvas, {
      type: 'doughnut',
      data: {
        labels: SC_REPORT_CATEGORIES,
        datasets: [{ data: SC_REPORT_CATEGORIES.map(c => reports.filter(r => r.category === c).length), backgroundColor: SC_CHART_PALETTE, borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'bottom', labels: { color: tick, boxWidth: 10, usePointStyle: true } } } }
    });
  }

  const monthCanvas = document.getElementById('adminMonthlyChart');
  if (monthCanvas) {
    const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: thMonths[d.getMonth()] });
    }
    if (window.adminChart2) window.adminChart2.destroy();
    window.adminChart2 = new Chart(monthCanvas, {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [{ label: 'จำนวนเรื่อง', data: months.map(m => reports.filter(r => String(r.datetime || '').slice(0, 7) === m.key).length), backgroundColor: '#2456a6', borderRadius: 8, maxBarThickness: 36 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: tick } },
          y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, color: tick }, grid: { color: grid } }
        }
      }
    });
  }
}

function mapNews(row) {
  return { id: row.id, headline: row.headline || '', content: row.content || '', date: row.date || '', imgUrl: row.img_url || '', createdAt: row.created_at };
}
function mapLink(row) {
  return { id: row.id, name: row.name || '', url: row.url || '', category: row.category || '', createdAt: row.created_at };
}
function mapAchievement(row) {
  return { id: row.id, headline: row.headline || '', content: row.content || '', date: row.date || '', responsible: row.responsible || '', imgUrl: row.img_url || '', createdAt: row.created_at };
}
function mapSong(row) {
  return { id: row.id, userId: row.user_id, requesterName: row.requester_name || '', title: row.title || '', artist: row.artist || '', url: row.url || '', message: row.message || '', date: row.date || '', status: row.status || 'pending', feedback: row.feedback || '', createdAt: row.created_at };
}
function mapLostFound(row) {
  return {
    id: row.id, userId: row.user_id, type: row.type, category: row.category,
    itemName: row.item_name || '', location: row.location || '', datetime: row.datetime || '',
    reporterName: row.reporter_name || '', studentId: row.student_id || '', classroom: row.classroom || '',
    description: row.description || '', contact: row.contact || '', imageUrl: row.image_url || '',
    status: row.status || 'searching', resolutionDate: row.resolution_date || '',
    notes: row.notes || '', pinned: !!row.pinned, createdAt: row.created_at
  };
}
function mapChatSession(row) {
  return { id: row.id, studentAuthId: row.student_auth_id, studentId: row.student_id, studentName: row.student_name, classroom: row.classroom || '', lastMessageAt: row.last_message_at, createdAt: row.created_at };
}
function mapChatMessage(row) {
  return { id: row.id, sessionId: row.session_id, senderId: row.sender_id, sender: row.sender_role, text: row.text || '', attachments: Array.isArray(row.attachments) ? row.attachments : [], time: new Date(row.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), createdAt: row.created_at };
}

const CHAT_UNREAD_KEY = 'sc_chat_unread_map_v1';
function getChatUnreadMap() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_UNREAD_KEY) || '{}');
  } catch (e) {
    return {};
  }
}
function setChatUnreadMap(map) {
  try {
    localStorage.setItem(CHAT_UNREAD_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('Chat unread state could not be stored:', e);
  }
}
function isSessionUnread(sessionId, lastMessageAt) {
  if (!sessionId || !lastMessageAt) return false;
  const map = getChatUnreadMap();
  const lastSeen = Number(map[sessionId] || 0);
  const lastTs = new Date(lastMessageAt).getTime();
  return lastTs > lastSeen;
}
function markSessionRead(sessionId, lastMessageAt = null) {
  if (!sessionId) return;
  const map = getChatUnreadMap();
  if (lastMessageAt) map[sessionId] = new Date(lastMessageAt).getTime();
  else map[sessionId] = Date.now();
  setChatUnreadMap(map);
}

function getRemoteDBShell() {
  return normalizeDB({
    adminAuth: null,
    users: [], reports: [], achievements: [], news: [], links: [], songs: [], lostFound: [], chats: {}
  });
}

// No shared application data is persisted in localStorage anymore.
function loadDB() {
  if (!inMemoryDB) inMemoryDB = getRemoteDBShell();
  return inMemoryDB;
}
function saveDB(next) {
  inMemoryDB = normalizeDB(next || inMemoryDB || getRemoteDBShell());
  db = inMemoryDB;
  return inMemoryDB;
}

async function fetchTable(table, options = {}) {
  if (!isSupabaseReady()) return [];
  let q = sb.from(table).select('*');
  if (options.order) q = q.order(options.order.column, { ascending: options.order.ascending ?? false });
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function refreshAllRemoteData() {
  if (!isSupabaseReady()) return false;
  try {
    const [newsRows, linkRows, achievementRows] = await Promise.all([
      fetchTable('news', { order: { column: 'created_at', ascending: false } }),
      fetchTable('links', { order: { column: 'created_at', ascending: false } }),
      fetchTable('achievements', { order: { column: 'created_at', ascending: false } })
    ]);

    db = getRemoteDBShell();
    db.news = newsRows.map(mapNews);
    db.links = linkRows.map(mapLink);
    db.achievements = achievementRows.map(mapAchievement);
    try { await refreshPublicReports(); } catch (e) { console.warn('Public report overview failed:', e); }

    if (currentRole === 'student' || currentRole === 'admin') {
      await Promise.all([refreshRemoteReports(), refreshRemoteSongs(), refreshRemoteLostFound()]);
    }
    if (currentRole === 'admin') {
      await refreshRemoteUsers();
    }
    inMemoryDB = normalizeDB(db);
    return true;
  } catch (error) {
    console.error('Supabase data refresh failed:', error);
    showToast('โหลดข้อมูลจาก Supabase ไม่สำเร็จ: ' + (error.message || error), 'error');
    return false;
  }
}

async function refreshRemoteReports() {
  if (!isSupabaseReady() || !currentUser) return;
  let q = sb.from('reports').select('*').order('created_at', { ascending: false });
  if (currentRole !== 'admin') q = q.eq('user_id', currentUser.authId);
  const { data, error } = await q;
  if (error) throw error;
  db.reports = (data || []).map(mapSupabaseReport);
  inMemoryDB = normalizeDB(db);
}

async function refreshRemoteSongs() {
  if (!isSupabaseReady() || !currentUser) return;
  let q = sb.from('songs').select('*').order('created_at', { ascending: false });
  if (currentRole !== 'admin') q = q.eq('user_id', currentUser.authId);
  const { data, error } = await q;
  if (error) throw error;
  db.songs = (data || []).map(mapSong);
  inMemoryDB = normalizeDB(db);
}

async function refreshRemoteLostFound() {
  if (!isSupabaseReady() || !currentUser) return;
  const { data, error } = await sb.from('lost_found').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  db.lostFound = (data || []).map(mapLostFound);
  inMemoryDB = normalizeDB(db);
}

async function refreshRemoteUsers() {
  if (!isSupabaseReady() || currentRole !== 'admin') return;
  const { data, error } = await sb.from('profiles').select('id,student_id,name,role,classroom,email').order('created_at', { ascending: false });
  if (error) throw error;
  db.users = (data || []).map(mapSupabaseProfile);
  inMemoryDB = normalizeDB(db);
}

function setButtonBusy(buttonId, busy, text = 'กำลังบันทึก...') {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  if (busy) {
    btn.dataset.originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i>${text}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
  }
}

/* -------------------- student songs -------------------- */
async function submitSongRequest() {
  if (currentRole !== 'student' || !currentUser?.authId) {
    showToast('กรุณาเข้าสู่ระบบนักเรียนก่อนขอเพลง', 'error'); switchTab('login'); return;
  }
  const title = document.getElementById('song-title').value.trim();
  const artist = document.getElementById('song-artist').value.trim();
  const url = document.getElementById('song-url').value.trim();
  const message = document.getElementById('song-message').value.trim();
  if (!title || !artist) { showToast('กรุณากรอกชื่อเพลงและศิลปิน', 'error'); return; }
  const payload = {
    id: scId('SONG'), user_id: currentUser.authId, requester_name: currentUser.name,
    title, artist, url, message, date: new Date().toISOString().slice(0,10), status: 'pending', feedback: ''
  };
  const { data, error } = await sb.from('songs').insert(payload).select('*').single();
  if (error) { showToast('บันทึกคำขอเพลงไม่สำเร็จ: ' + error.message, 'error'); return; }
  db.songs.unshift(mapSong(data));
  document.getElementById('form-request-song').reset();
  showToast('ส่งคำขอเพลงและบันทึกลง Supabase แล้ว', 'success');
  renderStudentSongs();
}

async function renderStudentSongs() {
  if (currentRole !== 'student') return;
  try { await refreshRemoteSongs(); } catch (e) { console.error(e); }
  const songs = db.songs || [];
  const count = document.getElementById('student-songs-count'); if (count) count.innerText = songs.length;
  const container = document.getElementById('student-songs-list'); if (!container) return;
  const statusBadges = {
    pending: '<span class="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-xs font-bold">รอคิว</span>',
    approved: '<span class="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-xs font-bold">เตรียมเปิด</span>',
    played: '<span class="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 text-xs font-bold">เปิดแล้ว</span>',
    rejected: '<span class="px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 text-xs font-bold">ปฏิเสธ</span>'
  };
  container.innerHTML = songs.map(s => `
    <div class="p-5 bg-white dark:bg-slate-800 rounded-3xl shadow-premium border border-slate-100 dark:border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex items-start space-x-4"><div class="sc-icon-chip shrink-0"><i class="fa-solid fa-music"></i></div>
      <div><h4 class="font-extrabold text-base text-slate-900 dark:text-white">${scEscape(s.title)} - <span class="text-slate-500 font-medium">${scEscape(s.artist)}</span></h4>
      <p class="text-xs text-slate-400 mt-1 font-medium">ผู้ขอ: ${scEscape(s.requesterName)} | วันที่: ${scEscape(s.date)}</p>
      ${s.message ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50">"${scEscape(s.message)}"</p>` : ''}
      ${s.feedback ? `<p class="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-bold">ตอบกลับจากแอดมิน: ${scEscape(s.feedback)}</p>` : ''}</div></div>
      <div>${statusBadge('song', s.status)}</div></div>`).join('') || '<div class="p-10 text-center text-slate-400">ยังไม่มีคำขอเพลง</div>';
}

/* -------------------- lost & found -------------------- */
const lostFoundCategories = [
  { value: 'money', label: '💵 เงิน' },
  { value: 'electronics', label: '📱 อุปกรณ์อิเล็กทรอนิกส์' },
  { value: 'documents', label: '📄 เอกสาร/บัตร' },
  { value: 'keys', label: '🔑 กุญแจ/กุญแจรถ' },
  { value: 'clothing', label: '👕 เสื้อผ้า/หมวก' },
  { value: 'accessories', label: '💍 เครื่องประดับ' },
  { value: 'belongings', label: '🎒 ของใช้ทั่วไป' },
  { value: 'others', label: '🧰 อื่น ๆ' }
];
let selectedLostFoundImage = null;
let lostFoundImagePreviewUrl = '';
let lostFoundSubmissionActive = false;

function renderLostFoundCategories(selected = 'others') {
  const container = document.getElementById('lf-category-options');
  if (!container) return;

  container.replaceChildren();
  lostFoundCategories.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = category.label;
    button.className = `rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
      selected === category.value
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-yellow-400 dark:bg-blue-900/40 dark:text-yellow-300'
        : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300'
    }`;
    button.addEventListener('click', () => selectLostFoundCategory(category.value));
    container.appendChild(button);
  });
}

function selectLostFoundCategory(category) {
  const field = document.getElementById('lf-category');
  if (!lostFoundCategories.some(item => item.value === category)) return;
  if (field) field.value = category;
  renderLostFoundCategories(category);
}

function filterLostFound(status) {
  if (!['all', 'searching', 'returned'].includes(status)) return;
  activeLFStatusFilter = status;
  const selectedClass = ['border-blue-600', 'text-blue-600', 'dark:text-blue-400', 'dark:border-blue-400'];
  const idleClass = ['border-transparent', 'text-slate-400'];
  ['all', 'searching', 'returned'].forEach(value => {
    const button = document.getElementById(`lf-filter-${value}`);
    if (!button) return;
    button.classList.remove(...selectedClass, ...idleClass);
    button.classList.add(...(value === status ? selectedClass : idleClass));
  });
  renderStudentLostFound();
}

function filterLostFoundByCategory(category) {
  if (category !== 'all' && !lostFoundCategories.some(item => item.value === category)) return;
  activeLFCategoryFilter = category;
  renderStudentLostFound();
}

function resetLostFoundImage() {
  if (lostFoundImagePreviewUrl) URL.revokeObjectURL(lostFoundImagePreviewUrl);
  selectedLostFoundImage = null;
  lostFoundImagePreviewUrl = '';
  const input = document.getElementById('lf-image-input');
  const image = document.getElementById('lf-image-preview');
  const preview = document.getElementById('lf-image-preview-container');
  if (input) input.value = '';
  if (image) image.removeAttribute('src');
  preview?.classList.add('hidden');
}

function handleLostFoundImage(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showToast('รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP', 'error');
    return;
  }
  if (file.size > MAX_SCHOOL_IMAGE_BYTES) {
    showToast('รูปภาพต้องมีขนาดไม่เกิน 8MB', 'error');
    return;
  }

  resetLostFoundImage();
  selectedLostFoundImage = file;
  lostFoundImagePreviewUrl = URL.createObjectURL(file);
  const image = document.getElementById('lf-image-preview');
  if (image) image.src = lostFoundImagePreviewUrl;
  document.getElementById('lf-image-preview-container')?.classList.remove('hidden');
}

function initLostFoundImageUploader() {
  const input = document.getElementById('lf-image-input');
  const area = document.getElementById('lf-drag-area');
  if (!input || !area || area.dataset.bound === '1') return;
  area.dataset.bound = '1';

  area.addEventListener('click', event => {
    if (event.target !== input) input.click();
  });
  input.addEventListener('change', () => {
    handleLostFoundImage(input.files?.[0]);
    input.value = '';
  });
  ['dragenter', 'dragover'].forEach(eventName => {
    area.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      area.classList.add('ring-2', 'ring-blue-500');
    });
  });
  ['dragleave', 'drop'].forEach(eventName => {
    area.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      area.classList.remove('ring-2', 'ring-blue-500');
    });
  });
  area.addEventListener('drop', event => handleLostFoundImage(event.dataTransfer?.files?.[0]));
}

function openLostFoundModal(type = 'lost') {
  if (currentRole !== 'student' || !currentUser?.authId) {
    showToast('กรุณาเข้าสู่ระบบนักเรียนก่อนแจ้งของหาย / เก็บของได้', 'error');
    switchTab('login');
    return;
  }

  const form = document.getElementById('form-lostfound-report');
  form?.reset();
  resetLostFoundImage();
  const isMoney = type === 'money';
  const typeField = document.getElementById('lf-type');
  const moneySection = document.getElementById('lf-money-type-section');
  const nameLabel = document.getElementById('lf-item-name-label');
  const itemName = document.getElementById('lf-item-name');
  if (typeField) typeField.value = isMoney ? '' : (type === 'found' ? 'found' : 'lost');
  moneySection?.classList.toggle('hidden', !isMoney);
  if (nameLabel) nameLabel.firstChild.textContent = isMoney ? 'จำนวนเงินหรือรายละเอียด ' : 'ชื่อสิ่งของ / รายการ ';
  if (itemName) itemName.placeholder = isMoney ? 'เช่น จำนวนเงินโดยประมาณ / ลักษณะธนบัตร' : 'เช่น กระเป๋านักเรียน, โทรศัพท์, สมุด';

  document.querySelectorAll('input[name="money-type"]').forEach(radio => { radio.checked = false; });
  safeValue('lf-reporter-name', currentUser.name || '');
  safeValue('lf-student-id', currentUser.id || '');
  safeValue('lf-classroom', currentUser.class || '');
  safeValue('lf-category', 'others');
  renderLostFoundCategories('others');
  const activeLFType = isMoney ? 'money' : (type === 'found' ? 'found' : 'lost');
  document.querySelectorAll('[data-lf-type]').forEach(btn => {
    const on = btn.dataset.lfType === activeLFType;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  safeText('lf-modal-title', activeLFType === 'money' ? 'แจ้งเงินหาย / เก็บเงินได้' : activeLFType === 'found' ? 'แจ้งเก็บของได้' : 'แจ้งของหาย');
  openModal('student-lostfound-modal');
}

function closeLostFoundModal() {
  closeModal('student-lostfound-modal');
  document.getElementById('form-lostfound-report')?.reset();
  resetLostFoundImage();
}

async function submitLostFoundReport() {
  if (lostFoundSubmissionActive) return;
  lostFoundSubmissionActive = true;
  showLoadingOverlay();
  let uploadedImagePath = '';

  try {
    if (!isSupabaseReady()) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
    const { data: sessionData, error: sessionError } = await sb.auth.getSession();
    if (sessionError) throw sessionError;
    const authUserId = sessionData?.session?.user?.id;
    if (!authUserId) {
      showToast('เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', 'error');
      switchTab('login');
      return;
    }

    if (currentRole !== 'student' || currentUser?.authId !== authUserId) {
      const { data: profile, error: profileError } = await sb
        .from('profiles')
        .select('id,student_id,name,role,classroom,email')
        .eq('id', authUserId)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile || profile.role !== 'student') {
        showToast('บัญชีนี้ไม่มีสิทธิ์นักเรียน', 'error');
        return;
      }
      currentUser = mapSupabaseProfile(profile);
      currentRole = 'student';
      updateUIAuth();
    }

    const typeValue = document.getElementById('lf-type')?.value || '';
    if (!['lost', 'found', 'money_lost', 'money_found'].includes(typeValue)) {
      showToast('กรุณาเลือกประเภทเงินที่ต้องการแจ้ง', 'error');
      return;
    }
    const payload = {
      id: scId('LF'),
      user_id: authUserId,
      type: typeValue.endsWith('lost') ? 'lost' : 'found',
      category: document.getElementById('lf-category').value,
      item_name: document.getElementById('lf-item-name').value.trim(),
      location: document.getElementById('lf-room-location').value.trim(),
      datetime: document.getElementById('lf-datetime').value,
      reporter_name: document.getElementById('lf-reporter-name').value.trim(),
      student_id: document.getElementById('lf-student-id').value.trim(),
      classroom: document.getElementById('lf-classroom').value.trim(),
      description: document.getElementById('lf-description').value.trim(),
      contact: document.getElementById('lf-contact').value.trim(),
      image_url: '',
      status: 'searching',
      resolution_date: null,
      notes: '',
      pinned: false
    };
    if (!payload.reporter_name || !payload.student_id || !payload.classroom || !payload.item_name || !payload.location || !payload.datetime || !payload.contact) {
      showToast('กรุณากรอกข้อมูลที่มีเครื่องหมาย * ให้ครบ', 'error');
      return;
    }

    if (selectedLostFoundImage) {
      const extension = selectedLostFoundImage.type === 'image/png' ? 'png' : selectedLostFoundImage.type === 'image/webp' ? 'webp' : 'jpg';
      uploadedImagePath = `lost-found/${authUserId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await sb.storage.from('school-images').upload(uploadedImagePath, selectedLostFoundImage, {
        cacheControl: '3600',
        upsert: false,
        contentType: selectedLostFoundImage.type
      });
      if (uploadError) throw uploadError;
      payload.image_url = sb.storage.from('school-images').getPublicUrl(uploadedImagePath).data.publicUrl;
    }

    const { data, error } = await sb.from('lost_found').insert(payload).select('*').single();
    if (error) throw error;

    db.lostFound = db.lostFound || [];
    db.lostFound.unshift(mapLostFound(data));
    uploadedImagePath = '';
    closeLostFoundModal();
    showToast('บันทึกข้อมูลลง Supabase แล้ว', 'success');
    await renderStudentLostFound();
  } catch (error) {
    console.error('Lost and found submission failed:', error);
    if (uploadedImagePath) {
      try {
        const { error: cleanupError } = await sb.storage.from('school-images').remove([uploadedImagePath]);
        if (cleanupError) console.warn('Uploaded lost-and-found image cleanup failed:', cleanupError);
      } catch (cleanupError) {
        console.warn('Uploaded lost-and-found image cleanup failed:', cleanupError);
      }
    }
    showToast('บันทึกข้อมูลของหายไม่สำเร็จ: ' + (error?.message || error), 'error');
  } finally {
    lostFoundSubmissionActive = false;
    hideLoadingOverlay();
  }
}

async function renderStudentLostFound() {
  if (currentRole !== 'student') return;
  try { await refreshRemoteLostFound(); } catch (e) { console.error(e); }
  let items = [...(db.lostFound || [])];
  const query = (document.getElementById('lf-search')?.value || '').toLowerCase();
  if (query) items = items.filter(i => `${i.itemName} ${i.description} ${i.reporterName}`.toLowerCase().includes(query));
  if (activeLFCategoryFilter !== 'all') items = items.filter(i => i.category === activeLFCategoryFilter);
  if (activeLFStatusFilter === 'searching') items = items.filter(i => i.status === 'searching' || i.status === 'found_matching');
  else if (activeLFStatusFilter !== 'all') items = items.filter(i => i.status === activeLFStatusFilter);
  const lostList = items.filter(i => i.type === 'lost'); const foundList = items.filter(i => i.type === 'found');
  const lc = document.getElementById('lost-count'); if (lc) lc.innerText = lostList.length;
  const fc = document.getElementById('found-count'); if (fc) fc.innerText = foundList.length;
  const renderCard = i => `<div class="p-5 bg-white dark:bg-slate-800 rounded-3xl shadow-premium border border-slate-100 dark:border-slate-700/50 flex flex-col justify-between ${i.pinned ? 'ring-2 ring-yellow-400' : ''}">
    <div><div class="flex items-center justify-between mb-2"><span class="flex flex-wrap gap-1.5">${typeBadge(i.type)}${statusBadge('lf', i.status)}</span><span class="text-[10px] text-slate-400">${scEscape((i.datetime||'').replace('T',' '))}</span></div>
    <h4 class="font-extrabold text-base text-slate-900 dark:text-white">${scEscape(i.itemName)}</h4><p class="text-xs text-slate-500 mt-1">สถานที่: ${scEscape(i.location)}</p><p class="text-xs text-slate-600 dark:text-slate-300 mt-2">${scEscape(i.description||'ไม่มีรายละเอียดเพิ่มเติม')}</p>
    ${i.notes ? `<p class="text-xs text-blue-600 mt-2 font-bold">หมายเหตุแอดมิน: ${scEscape(i.notes)}</p>` : ''}</div>
    <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-xs"><span class="text-slate-400">ผู้แจ้ง: ${scEscape(i.reporterName)}</span><span class="font-extrabold text-blue-600">${scEscape(i.contact)}</span></div></div>`;
  const lost = document.getElementById('lost-items-list'); const found = document.getElementById('found-items-list');
  if (lost) lost.innerHTML = lostList.map(renderCard).join('') || '<div class="p-8 text-center text-slate-400">ไม่มีรายการ</div>';
  if (found) found.innerHTML = foundList.map(renderCard).join('') || '<div class="p-8 text-center text-slate-400">ไม่มีรายการ</div>';
}

/* -------------------- chat -------------------- */
async function ensureChatSession() {
  if (!currentUser?.authId || currentRole !== 'student') return null;
  const sessionId = currentUser.authId;
  const { data, error } = await sb.from('chat_sessions').upsert({
    id: sessionId, student_auth_id: currentUser.authId, student_id: currentUser.id,
    student_name: currentUser.name, classroom: currentUser.class || '', last_message_at: new Date().toISOString()
  }, { onConflict: 'id' }).select('*').single();
  if (error) throw error;
  return mapChatSession(data);
}

async function fetchChatMessages(sessionId) {
  const { data, error } = await sb.from('chat_messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapChatMessage);
}

async function renderStudentChat() {
  if (currentRole !== 'student' || !currentUser?.authId) return;
  const container = document.getElementById('student-chat-list'); if (!container) return;
  try {
    await ensureChatSession();
    const messages = await fetchChatMessages(currentUser.authId);
    container.innerHTML = messages.map(m => `<div class="flex flex-col ${m.sender==='student'?'items-end':'items-start'}"><div class="max-w-[80%] p-3.5 rounded-2xl text-xs ${m.sender==='student'?'bg-blue-600 text-white rounded-br-none':'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none'} shadow-sm">${m.text ? `<p class="leading-relaxed">${scEscape(m.text)}</p>` : ''}${(m.attachments||[]).map(a=>`<img src="${scEscape(a.dataUrl||a.url||'')}" class="mt-2 max-w-full max-h-48 rounded-xl object-cover">`).join('')}</div><span class="text-[9px] text-slate-400 mt-1">${scEscape(m.time)}</span></div>`).join('') || '<div class="text-center text-slate-400 py-12">เริ่มต้นแชทกับแอดมินได้เลย</div>';
    container.scrollTop = container.scrollHeight;
  } catch (e) { console.error(e); showToast('โหลดแชทไม่สำเร็จ: ' + e.message, 'error'); }
}

async function sendStudentChat() {
  if (currentRole !== 'student' || !currentUser?.authId) { showToast('กรุณาเข้าสู่ระบบ', 'error'); return; }
  const input = document.getElementById('student-chat-input'); const text = input?.value.trim() || ''; if (!text && !pendingStudentChatAttachments.length) return;
  try {
    await ensureChatSession();
    const { error } = await sb.from('chat_messages').insert({ session_id: currentUser.authId, sender_id: currentUser.authId, sender_role: 'student', text, attachments: await uploadChatAttachments(pendingStudentChatAttachments) });
    if (error) throw error;
    await sb.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', currentUser.authId);
    input.value = ''; pendingStudentChatAttachments.forEach(a => a.previewUrl && URL.revokeObjectURL(a.previewUrl)); pendingStudentChatAttachments = []; const a=document.getElementById('student-chat-attachments'); if(a)a.innerHTML=''; await renderStudentChat();
  } catch (e) { console.error(e); showToast('ส่งข้อความไม่สำเร็จ: ' + e.message, 'error'); }
}

async function renderAdminChat() {
  if (currentRole !== 'admin') return;
  const list = document.getElementById('admin-chat-session-list'); if (!list) return;
  try {
    const { data, error } = await sb.from('chat_sessions').select('*').order('last_message_at', { ascending: false });
    if (error) throw error;
    const sessions = (data || []).map(mapChatSession);
    list.innerHTML = sessions.map(s => {
      const unread = currentChatSessionId !== s.id && isSessionUnread(s.id, s.lastMessageAt);
      const active = currentChatSessionId === s.id;
      return `<button type="button" onclick="selectAdminChatSession('${s.id}')" class="w-full text-left p-3 rounded-2xl border ${active ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'} hover:border-blue-400 transition relative">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="font-extrabold text-xs text-slate-800 dark:text-white truncate">${scEscape(s.studentName)}</div>
            <div class="text-[10px] text-slate-400 mt-1 truncate">${scEscape(s.studentId)} · ${scEscape(s.classroom)}</div>
            <div class="text-[9px] text-slate-400 mt-1">${scEscape(new Date(s.lastMessageAt).toLocaleString())}</div>
          </div>
          ${unread ? '<span class="inline-flex items-center justify-center min-w-[1.35rem] h-5 px-1.5 rounded-full bg-rose-500 text-[9px] font-bold text-white">ใหม่</span>' : ''}
        </div>
      </button>`;
    }).join('') || '<div class="text-xs text-slate-400 p-4">ยังไม่มีห้องแชท</div>';
    if (!currentChatSessionId && sessions[0]) currentChatSessionId = sessions[0].id;
    if (currentChatSessionId) await renderAdminChatMessages(currentChatSessionId);
  } catch (e) { console.error(e); showToast('โหลดห้องแชทไม่สำเร็จ: ' + e.message, 'error'); }
}

async function selectAdminChatSession(sessionId) {
  currentChatSessionId = sessionId;
  markSessionRead(sessionId, new Date().toISOString());
  await renderAdminChat();
}

async function renderAdminChatMessages(sessionId) {
  const container = document.getElementById('admin-chat-list'); if (!container) return;
  try {
    const { data: session } = await sb.from('chat_sessions').select('*').eq('id', sessionId).maybeSingle();
    const caption = document.getElementById('admin-chat-session-caption');
    if (caption && session) caption.innerText = `${session.student_name} · ${session.student_id} · ${session.classroom || ''}`;
    const messages = await fetchChatMessages(sessionId);
    container.innerHTML = messages.map(m => `<div class="flex flex-col ${m.sender==='admin'?'items-end':'items-start'}"><div class="max-w-[80%] p-3.5 rounded-2xl text-xs ${m.sender==='admin'?'bg-emerald-600 text-white rounded-br-none':'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none'} shadow-sm">${m.text ? `<p class="leading-relaxed">${scEscape(m.text)}</p>` : ''}${(m.attachments||[]).map(a=>`<img src="${scEscape(a.dataUrl||a.url||'')}" class="mt-2 max-w-full max-h-48 rounded-xl object-cover">`).join('')}</div><span class="text-[9px] text-slate-400 mt-1">${scEscape(m.time)}</span></div>`).join('') || '<div class="text-center text-slate-400 py-12">ยังไม่มีข้อความ</div>';
    if (sessionId === currentChatSessionId) markSessionRead(sessionId, session?.last_message_at || new Date().toISOString());
    container.scrollTop = container.scrollHeight;
  } catch (e) { console.error(e); }
}

async function sendAdminChat() {
  if (currentRole !== 'admin' || !currentUser?.authId || !currentChatSessionId) { showToast('เลือกห้องแชทก่อน', 'error'); return; }
  const input = document.getElementById('admin-chat-input'); const text = input?.value.trim() || ''; if (!text && !pendingAdminChatAttachments.length) return;
  try {
    const { error } = await sb.from('chat_messages').insert({ session_id: currentChatSessionId, sender_id: currentUser.authId, sender_role: 'admin', text, attachments: await uploadChatAttachments(pendingAdminChatAttachments) });
    if (error) throw error;
    await sb.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', currentChatSessionId);
    input.value = ''; pendingAdminChatAttachments.forEach(a => a.previewUrl && URL.revokeObjectURL(a.previewUrl)); pendingAdminChatAttachments = []; const a=document.getElementById('admin-chat-attachments'); if(a)a.innerHTML=''; await renderAdminChat();
  } catch (e) { console.error(e); showToast('ส่งข้อความไม่สำเร็จ: ' + e.message, 'error'); }
}

/* -------------------- admin content CRUD -------------------- */
async function requireAdmin() {
  if (currentRole !== 'admin' || !currentUser?.authId) { showToast('ไม่มีสิทธิ์ผู้ดูแลระบบ', 'error'); return false; }
  return true;
}

function openNewsModal(id = '') {
  document.getElementById('form-news-editor')?.reset();
  document.getElementById('news-editor-id').value = id || '';
  const item = (db.news || []).find(x => x.id === id);
  if (item) { safeValue('news-editor-headline', item.headline); safeValue('news-editor-date', item.date); safeValue('news-editor-content', item.content); safeValue('news-editor-img-url', item.imgUrl); }
  else safeValue('news-editor-date', new Date().toISOString().slice(0,10));
  openModal('admin-news-modal');
}
function closeNewsModal(){ closeModal('admin-news-modal'); }

async function saveNewsItem() {
  if (!(await requireAdmin())) return;
  const id = document.getElementById('news-editor-id').value || scId('NEWS');
  const payload = { id, headline: document.getElementById('news-editor-headline').value.trim(), date: document.getElementById('news-editor-date').value, content: document.getElementById('news-editor-content').value.trim(), img_url: document.getElementById('news-editor-img-url').value.trim() };
  const result = document.getElementById('news-editor-id').value ? await sb.from('news').update(payload).eq('id', id).select('*').single() : await sb.from('news').insert(payload).select('*').single();
  if (result.error) { showToast('บันทึกข่าวไม่สำเร็จ: ' + result.error.message, 'error'); return; }
  await refreshAllRemoteData(); closeNewsModal(); renderAdminNews(); renderStudentNews(); showToast('บันทึกข่าวลง Supabase แล้ว', 'success');
}
async function deleteNewsItem(id){ if(!(await requireAdmin()))return; if(!confirm('ลบข่าวนี้หรือไม่?'))return; const {error}=await sb.from('news').delete().eq('id',id); if(error){showToast('ลบข่าวไม่สำเร็จ: '+error.message,'error');return;} await refreshAllRemoteData(); renderAdminNews(); renderStudentNews(); showToast('ลบข่าวแล้ว','success'); }
function renderAdminNews(){ const tbody=document.getElementById('admin-news-table-body'); if(!tbody)return; tbody.innerHTML=(db.news||[]).map(n=>`<tr><td class="p-4"><img src="${scEscape(n.imgUrl||'https://placehold.co/120x70')}" class="w-24 h-14 object-cover rounded-xl"></td><td class="p-4 font-bold">${scEscape(n.headline)}</td><td class="p-4">${scEscape(n.date)}</td><td class="p-4 max-w-sm truncate">${scEscape(n.content)}</td><td class="p-4 text-right"><button onclick="openNewsModal('${n.id}')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg mr-2">แก้ไข</button><button onclick="deleteNewsItem('${n.id}')" class="px-3 py-1.5 bg-rose-600 text-white rounded-lg">ลบ</button></td></tr>`).join('') || '<tr><td colspan="5" class="p-10 text-center text-slate-400">ยังไม่มีข่าว</td></tr>'; }

function openLinkModal(id=''){ document.getElementById('form-link-editor')?.reset(); document.getElementById('link-editor-id').value=id||''; const item=(db.links||[]).find(x=>x.id===id); if(item){safeValue('link-editor-category',item.category);safeValue('link-editor-name',item.name);safeValue('link-editor-url',item.url);} openModal('admin-link-modal'); }
function closeLinkModal(){closeModal('admin-link-modal');}
async function saveLinkItem(){if(!(await requireAdmin()))return;const id=document.getElementById('link-editor-id').value||scId('LINK');const payload={id,category:document.getElementById('link-editor-category').value,name:document.getElementById('link-editor-name').value.trim(),url:document.getElementById('link-editor-url').value.trim()};const result=document.getElementById('link-editor-id').value?await sb.from('links').update(payload).eq('id',id).select('*').single():await sb.from('links').insert(payload).select('*').single();if(result.error){showToast('บันทึกลิงก์ไม่สำเร็จ: '+result.error.message,'error');return;}await refreshAllRemoteData();closeLinkModal();renderAdminLinks();renderStudentLinks();showToast('บันทึกลิงก์แล้ว','success');}
async function deleteLinkItem(id){if(!(await requireAdmin()))return;if(!confirm('ลบลิงก์นี้หรือไม่?'))return;const {error}=await sb.from('links').delete().eq('id',id);if(error){showToast('ลบลิงก์ไม่สำเร็จ: '+error.message,'error');return;}await refreshAllRemoteData();renderAdminLinks();renderStudentLinks();showToast('ลบลิงก์แล้ว','success');}
function renderAdminLinks(){const tbody=document.getElementById('admin-links-table-body');if(!tbody)return;tbody.innerHTML=(db.links||[]).map(l=>`<tr><td class="p-4">${scEscape(l.category)}</td><td class="p-4 font-bold">${scEscape(l.name)}</td><td class="p-4"><a href="${scEscape(l.url)}" target="_blank" rel="noopener" class="text-blue-600 underline break-all">${scEscape(l.url)}</a></td><td class="p-4 text-right"><button onclick="openLinkModal('${l.id}')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg mr-2">แก้ไข</button><button onclick="deleteLinkItem('${l.id}')" class="px-3 py-1.5 bg-rose-600 text-white rounded-lg">ลบ</button></td></tr>`).join('')||'<tr><td colspan="4" class="p-10 text-center text-slate-400">ยังไม่มีลิงก์</td></tr>';}

function openAchievementModal(id=''){document.getElementById('form-achievement-editor')?.reset();document.getElementById('achievement-editor-id').value=id||'';const item=(db.achievements||[]).find(x=>x.id===id);if(item){safeValue('achievement-editor-headline',item.headline);safeValue('achievement-editor-date',item.date);safeValue('achievement-editor-responsible',item.responsible);safeValue('achievement-editor-content',item.content);safeValue('achievement-editor-img-url',item.imgUrl);}else safeValue('achievement-editor-date',new Date().toISOString().slice(0,10));openModal('admin-achievement-modal');}
function closeAchievementModal(){closeModal('admin-achievement-modal');}
async function saveAchievementItem(){if(!(await requireAdmin()))return;const id=document.getElementById('achievement-editor-id').value||scId('ACH');const payload={id,headline:document.getElementById('achievement-editor-headline').value.trim(),date:document.getElementById('achievement-editor-date').value,responsible:document.getElementById('achievement-editor-responsible').value.trim(),content:document.getElementById('achievement-editor-content').value.trim(),img_url:document.getElementById('achievement-editor-img-url').value.trim()};const result=document.getElementById('achievement-editor-id').value?await sb.from('achievements').update(payload).eq('id',id).select('*').single():await sb.from('achievements').insert(payload).select('*').single();if(result.error){showToast('บันทึกผลงานไม่สำเร็จ: '+result.error.message,'error');return;}await refreshAllRemoteData();closeAchievementModal();renderAdminAchievements();renderPublicAchievements();showToast('บันทึกผลงานแล้ว','success');}
async function deleteAchievementItem(id){if(!(await requireAdmin()))return;if(!confirm('ลบผลงานนี้หรือไม่?'))return;const {error}=await sb.from('achievements').delete().eq('id',id);if(error){showToast('ลบผลงานไม่สำเร็จ: '+error.message,'error');return;}await refreshAllRemoteData();renderAdminAchievements();renderPublicAchievements();showToast('ลบผลงานแล้ว','success');}
function renderAdminAchievements(){const tbody=document.getElementById('admin-achievements-table-body');if(!tbody)return;tbody.innerHTML=(db.achievements||[]).map(a=>`<tr><td class="p-4"><img src="${scEscape(a.imgUrl||'https://placehold.co/120x70')}" class="w-24 h-14 object-cover rounded-xl"></td><td class="p-4 font-bold">${scEscape(a.headline)}</td><td class="p-4">${scEscape(a.responsible)}</td><td class="p-4">${scEscape(a.date)}</td><td class="p-4 text-right"><button onclick="openAchievementModal('${a.id}')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg mr-2">แก้ไข</button><button onclick="deleteAchievementItem('${a.id}')" class="px-3 py-1.5 bg-rose-600 text-white rounded-lg">ลบ</button></td></tr>`).join('')||'<tr><td colspan="5" class="p-10 text-center text-slate-400">ยังไม่มีผลงาน</td></tr>';}

/* -------------------- admin songs -------------------- */
async function renderAdminSongs(){if(!(await requireAdmin()))return;try{await refreshRemoteSongs();}catch(e){console.error(e);}let songs=[...(db.songs||[])];const status=document.getElementById('admin-song-filter-status')?.value||'all';const q=(document.getElementById('admin-song-search')?.value||'').toLowerCase();if(status!=='all')songs=songs.filter(s=>s.status===status);if(q)songs=songs.filter(s=>`${s.title} ${s.artist} ${s.requesterName}`.toLowerCase().includes(q));const tbody=document.getElementById('admin-songs-table-body');if(!tbody)return;tbody.innerHTML=songs.map(s=>`<tr><td class="p-4"><b>${scEscape(s.title)}</b><br><span class="text-slate-400">${scEscape(s.artist)}</span></td><td class="p-4">${scEscape(s.requesterName)}<br><span class="text-slate-400">${scEscape(s.date)}</span></td><td class="p-4 max-w-xs">${scEscape(s.message||'-')}</td><td class="p-4">${statusBadge('song', s.status)}</td><td class="p-4 text-right"><button onclick="openAdminSongModal('${s.id}')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg">จัดการ</button></td></tr>`).join('')||'<tr><td colspan="5" class="p-10 text-center text-slate-400">ไม่พบคำขอเพลง</td></tr>';}
function openAdminSongModal(id){const s=(db.songs||[]).find(x=>x.id===id);if(!s)return;safeValue('admin-song-id',s.id);safeText('admin-song-lbl-title',s.title);safeText('admin-song-lbl-artist',s.artist);safeValue('admin-song-status',s.status);safeValue('admin-song-feedback',s.feedback||'');openModal('admin-song-modal');}
function closeAdminSongModal(){closeModal('admin-song-modal');}
async function saveSongStatus(){if(!(await requireAdmin()))return;const id=document.getElementById('admin-song-id').value;const status=document.getElementById('admin-song-status').value;const feedback=document.getElementById('admin-song-feedback').value.trim();const {data,error}=await sb.from('songs').update({status,feedback,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();if(error){showToast('บันทึกคิวเพลงไม่สำเร็จ: '+error.message,'error');return;}const i=db.songs.findIndex(x=>x.id===id);if(i>=0)db.songs[i]=mapSong(data);closeAdminSongModal();renderAdminSongs();showToast('อัปเดตสถานะเพลงแล้ว','success');}
async function clearPlayedSongs(){if(!(await requireAdmin()))return;if(!confirm('ล้างเพลงที่เปิดแล้วทั้งหมดหรือไม่?'))return;const {error}=await sb.from('songs').delete().eq('status','played');if(error){showToast('ล้างเพลงไม่สำเร็จ: '+error.message,'error');return;}await refreshRemoteSongs();renderAdminSongs();showToast('ล้างเพลงที่เปิดแล้วแล้ว','success');}

/* -------------------- admin lost & found -------------------- */
async function renderAdminLostFound(){if(!(await requireAdmin()))return;try{await refreshRemoteLostFound();}catch(e){console.error(e);}let items=[...(db.lostFound||[])];const status=document.getElementById('admin-lf-filter-status')?.value||'all';const type=document.getElementById('admin-lf-filter-type')?.value||'all';const cat=document.getElementById('admin-lf-filter-category')?.value||'all';const q=(document.getElementById('admin-lf-search')?.value||'').toLowerCase();if(status!=='all')items=items.filter(x=>x.status===status);if(type!=='all')items=items.filter(x=>x.type===type);if(cat!=='all')items=items.filter(x=>x.category===cat);if(q)items=items.filter(x=>`${x.itemName} ${x.reporterName} ${x.location}`.toLowerCase().includes(q));const tbody=document.getElementById('admin-lf-table-body');if(!tbody)return;tbody.innerHTML=items.map(i=>`<tr><td class="p-4">${i.imageUrl?`<img src="${scEscape(i.imageUrl)}" class="w-16 h-12 object-cover rounded-lg">`:'-'}</td><td class="p-4">${typeBadge(i.type)}</td><td class="p-4">${scEscape(lfCategoryLabel(i.category))}</td><td class="p-4 font-bold">${scEscape(i.itemName)}</td><td class="p-4">${scEscape(i.classroom)}<br><span class="text-slate-400">${scEscape(i.location)}</span></td><td class="p-4">${scEscape(i.reporterName)}<br><span class="text-slate-400">${scEscape(i.datetime)}</span></td><td class="p-4">${statusBadge('lf', i.status)}</td><td class="p-4">${i.pinned?'📌':'-'}</td><td class="p-4 text-right"><button onclick="openAdminLostFoundModal('${i.id}')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg">จัดการ</button></td></tr>`).join('')||'<tr><td colspan="9" class="p-10 text-center text-slate-400">ไม่พบรายการ</td></tr>';}
function openAdminLostFoundModal(id){const i=(db.lostFound||[]).find(x=>x.id===id);if(!i)return;safeValue('admin-lf-id',i.id);safeText('admin-lf-lbl-type',i.type==='lost'?'ของหาย':'เก็บได้');safeText('admin-lf-lbl-name',i.itemName);safeText('admin-lf-lbl-location',i.location);safeText('admin-lf-lbl-category',lfCategoryLabel(i.category));safeText('admin-lf-lbl-datetime',i.datetime);safeText('admin-lf-lbl-reporter',`${i.reporterName} (${i.studentId})`);safeText('admin-lf-lbl-desc',i.description||'-');safeText('admin-lf-lbl-contact',i.contact);safeValue('admin-lf-status',i.status);safeValue('admin-lf-resdate',i.resolutionDate||'');safeValue('admin-lf-notes',i.notes||'');const pin=document.getElementById('admin-lf-pinned');if(pin)pin.checked=!!i.pinned;const img=document.getElementById('admin-lf-img');const box=document.getElementById('admin-lf-img-container');if(img&&box){if(i.imageUrl){img.src=i.imageUrl;box.classList.remove('hidden');}else{box.classList.add('hidden');}}openModal('admin-lostfound-modal');}
function closeAdminLostFoundModal(){closeModal('admin-lostfound-modal');}
async function saveAdminLostFoundStatus(){if(!(await requireAdmin()))return;const id=document.getElementById('admin-lf-id').value;const payload={status:document.getElementById('admin-lf-status').value,resolution_date:document.getElementById('admin-lf-resdate').value||null,notes:document.getElementById('admin-lf-notes').value.trim(),pinned:document.getElementById('admin-lf-pinned').checked,updated_at:new Date().toISOString()};const {data,error}=await sb.from('lost_found').update(payload).eq('id',id).select('*').single();if(error){showToast('บันทึกของหายไม่สำเร็จ: '+error.message,'error');return;}const idx=db.lostFound.findIndex(x=>x.id===id);if(idx>=0)db.lostFound[idx]=mapLostFound(data);closeAdminLostFoundModal();renderAdminLostFound();renderStudentLostFound();showToast('อัปเดตของหายแล้ว','success');}

/* -------------------- admin dashboard -------------------- */
async function renderAdminDashboard(){if(!(await requireAdmin()))return;try{await Promise.all([refreshRemoteReports(),refreshRemoteSongs(),refreshRemoteLostFound(),refreshRemoteUsers()]);}catch(e){console.error(e);}const r=db.reports||[];safeText('admin-kpi-users',(db.users||[]).filter(u=>u.role==='student').length);safeText('admin-kpi-reports',r.length);safeText('admin-kpi-completed',r.filter(x=>x.status==='completed').length);safeText('admin-kpi-processing',r.filter(x=>x.status==='processing'||x.status==='pending').length);renderAdminCharts(r);const tbody=document.getElementById('admin-recent-reports-table');if(tbody)tbody.innerHTML=r.slice(0,5).map(x=>`<tr><td class="p-3">${scEscape(x.title)}</td><td class="p-3">${scEscape(x.reporterName)}</td><td class="p-3">${statusBadge('report',x.status)}</td><td class="p-3 text-right"><button onclick="openReportDetailModal('${x.id}')" class="px-3 py-1 bg-blue-600 text-white rounded-lg">ดู</button></td></tr>`).join('');}

function debounce(fn, delay = 180) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const renderStudentChatDebounced = debounce(() => {
  if (currentRole === 'student') renderStudentChat();
}, 180);
const renderAdminChatDebounced = debounce(() => {
  if (currentRole === 'admin') renderAdminChat();
}, 180);

/* -------------------- admin report save/open using remote state -------------------- */
function openReportDetailModal(id){const r=(db.reports||[]).find(item=>item.id===id);if(!r)return;safeText('report-detail-title',r.title);safeText('report-detail-classroom',r.classroom);safeText('report-detail-category',r.category);safeText('report-detail-location',r.location);safeText('report-detail-datetime',(r.datetime||'').replace('T',' '));safeText('report-detail-desc',r.description||'-');safeText('report-detail-resdate',r.resolutionDate||'-');safeText('report-detail-notes',r.notes||'- ไม่มีข้อมูลบันทึกเพิ่มเติม -');renderReportDetailPhotos(r.photos);const badge=document.getElementById('report-detail-badge');if(badge){badge.className='';badge.innerHTML=statusBadge('report',r.status);}const adminSec=document.getElementById('admin-actions-section');const saveBtn=document.getElementById('admin-save-report-btn');if(currentRole==='admin'){adminSec?.classList.remove('hidden');saveBtn?.classList.remove('hidden');safeValue('admin-action-status',r.status);safeValue('admin-action-resdate',r.resolutionDate||'');safeValue('admin-action-notes',r.notes||'');saveBtn?.setAttribute('data-id',r.id);}else{adminSec?.classList.add('hidden');saveBtn?.classList.add('hidden');}openModal('report-detail-modal');}

/* -------------------- init + realtime -------------------- */
let scRealtimeChannel = null;
async function setupSupabaseRealtime(){
  if(!isSupabaseReady() || scRealtimeChannel) return;
  scRealtimeChannel = sb.channel('school-council-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'news'},()=>{refreshAllRemoteData().then(()=>{renderStudentNews();if(currentRole==='admin')renderAdminNews();});})
    .on('postgres_changes',{event:'*',schema:'public',table:'achievements'},()=>{refreshAllRemoteData().then(()=>{renderPublicAchievements();if(currentRole==='admin')renderAdminAchievements();});})
    .on('postgres_changes',{event:'*',schema:'public',table:'chat_messages'},()=>{
      renderStudentChatDebounced();
      if(currentRole==='admin'){ renderAdminChatDebounced(); if(currentChatSessionId) setTimeout(() => renderAdminChatMessages(currentChatSessionId), 120); }
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'chat_sessions'},()=>{if(currentRole==='admin')renderAdminChatDebounced();})
    .on('postgres_changes',{event:'*',schema:'public',table:'songs'},()=>{if(currentRole==='student')renderStudentSongs();if(currentRole==='admin')renderAdminSongs();})
    .on('postgres_changes',{event:'*',schema:'public',table:'lost_found'},()=>{if(currentRole==='student')renderStudentLostFound();if(currentRole==='admin')renderAdminLostFound();})
    .on('postgres_changes',{event:'*',schema:'public',table:'reports'},()=>{
      Promise.all([refreshRemoteReports(), refreshPublicReports()]).catch(err => console.error('Report refresh failed:', err)).then(() => {
        renderPublicAchievements();
        if (currentRole === 'student') renderStudentTrack();
        if (currentRole === 'admin') {
          renderAdminReports();
          renderAdminDashboard();
        }
      });
    })
    .subscribe();
}

async function initApp(){
  if(appInitialized) return; appInitialized=true; showLoadingOverlay();
  try{
    db=getRemoteDBShell();

    const restored = await restoreSupabaseSession();
    updateUIAuth();

    if (restored && currentRole !== 'guest' && currentUser) {
      switchTab(currentRole === 'admin' ? 'admin-dashboard' : 'student-news');
    } else {
      switchTab('login');
    }

    const initialTab = currentTab;
    refreshAllRemoteData().then(loaded => {
      if (loaded && currentTab === initialTab && currentTab !== 'login') {
        switchTab(currentTab);
      }
    }).catch(error => console.error('Initial data refresh failed:', error));
    setupSupabaseRealtime().catch(error => console.error('Realtime setup failed:', error));
  }catch(e){console.error('App init failed:',e);updateUIAuth();switchTab('login');showToast('เริ่มระบบไม่สำเร็จ: '+(e.message||e),'error');}
  finally{window.setTimeout(hideLoadingOverlay,400);}
}

/* -------------------- optional chat attachments -------------------- */
let pendingStudentChatAttachments = [];
let pendingAdminChatAttachments = [];

const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function chatAttachmentList(role) {
  return role === 'student' ? pendingStudentChatAttachments : pendingAdminChatAttachments;
}

function renderChatAttachmentPreviews(role) {
  const target = document.getElementById(role === 'student' ? 'student-chat-attachments' : 'admin-chat-attachments');
  if (!target) return;
  target.innerHTML = chatAttachmentList(role).map((a, i) => `<div class="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"><img src="${scEscape(a.previewUrl || a.url || '')}" class="w-full h-20 object-cover" alt=""><button type="button" onclick="removeChatAttachment('${role}',${i})" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white" aria-label="ลบรูป">×</button></div>`).join('');
}

function handleChatFileChange(role) {
  const input = document.getElementById(role === 'student' ? 'student-chat-file-input' : 'admin-chat-file-input');
  if (!input) return;
  const list = chatAttachmentList(role);
  let warnedLimit = false;
  Array.from(input.files || []).forEach(file => {
    if (list.length >= 3) {
      if (!warnedLimit) showToast('แนบรูปได้สูงสุด 3 รูปต่อข้อความ', 'error');
      warnedLimit = true;
      return;
    }
    if (!CHAT_IMAGE_TYPES.includes(file.type)) { showToast(`${file.name}: รองรับเฉพาะไฟล์ JPG, PNG, WEBP`, 'error'); return; }
    if (file.size > MAX_SCHOOL_IMAGE_BYTES) { showToast(`${file.name} ใหญ่เกิน 8MB`, 'error'); return; }
    list.push({ file, name: file.name, type: file.type, previewUrl: URL.createObjectURL(file) });
  });
  input.value = '';
  renderChatAttachmentPreviews(role);
}

function removeChatAttachment(role, index) {
  const [removed] = chatAttachmentList(role).splice(index, 1);
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  renderChatAttachmentPreviews(role);
}

async function uploadChatAttachments(list) {
  const uploaded = [];
  for (const a of list) {
    if (!a.file) { if (a.url) uploaded.push({ name: a.name, type: a.type, url: a.url }); continue; }
    const ext = a.type === 'image/png' ? 'png' : a.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `chat/${currentUser.authId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('school-images').upload(path, a.file, { cacheControl: '3600', upsert: false, contentType: a.type });
    if (error) throw error;
    uploaded.push({ name: a.name, type: a.type, url: sb.storage.from('school-images').getPublicUrl(path).data.publicUrl });
  }
  return uploaded;
}


// The Supabase session is authoritative; cached profile hints never grant access.
if (isSupabaseReady()) {
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      clearAuthHint();
      currentUser = null;
      currentRole = 'guest';
      updateUIAuth();
      if (document.readyState !== 'loading') switchTab('login');
    }
  });
}

// The original project did not invoke initApp(), which left every view hidden.
// Start the app deterministically after the DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initReportImageUploader(); initLostFoundImageUploader(); initApp(); }, { once: true });
} else {
  initReportImageUploader();
  initLostFoundImageUploader();
  initApp();
}


/**
 * SCLRP Motion Layer — โหลดต่อจาก app.js
 * เพิ่ม animation / micro-interaction โดยไม่แก้ logic เดิมของระบบ
 */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const main = document.querySelector('main');
  let lastSwitchAt = 0;

  /* ---------- 1. แถบความคืบหน้าการเลื่อนหน้า ---------- */
  const progressBar = document.createElement('div');
  progressBar.id = 'sc-scroll-progress';
  progressBar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progressBar);

  let progressTicking = false;
  function updateProgress() {
    progressTicking = false;
    if (!main) return;
    const max = main.scrollHeight - main.clientHeight;
    progressBar.style.transform = `scaleX(${max > 0 ? main.scrollTop / max : 0})`;
  }
  main?.addEventListener('scroll', () => {
    if (!progressTicking) {
      progressTicking = true;
      requestAnimationFrame(updateProgress);
    }
  }, { passive: true });

  /* ---------- 2. ตัวเลขนับขึ้น ---------- */
  const COUNT_IDS = [
    'pub-stat-total', 'pub-stat-completed', 'pub-stat-processing', 'pub-stat-failed',
    'pub-success-percent', 'pub-success-count', 'pub-failed-count',
    'admin-kpi-users', 'admin-kpi-reports', 'admin-kpi-completed', 'admin-kpi-processing',
    'student-news-count', 'student-songs-count', 'lost-count', 'found-count'
  ];

  function animateCount(el, force = false) {
    const finalText = el.textContent.trim();
    if (!force && finalText === el._scWritten) return;
    const match = finalText.match(/^(-?\d+(?:\.\d+)?)([\s\S]*)$/);
    if (!match) { el._scValue = 0; return; }

    const to = parseFloat(match[1]);
    const suffix = match[2];
    const from = typeof el._scValue === 'number' ? el._scValue : 0;
    el._scValue = to;
    cancelAnimationFrame(el._scRaf);

    if (reduceMotion || from === to || !el.offsetParent) {
      el._scWritten = finalText;
      return;
    }

    const isInt = Number.isInteger(to) && Number.isInteger(from);
    const format = value => (isInt ? Math.round(value) : value.toFixed(1)) + suffix;
    const write = text => { el._scWritten = text; el.textContent = text; };
    const duration = 900;
    const start = performance.now();

    write(format(from));
    const step = now => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        write(format(from + (to - from) * eased));
        el._scRaf = requestAnimationFrame(step);
      } else {
        write(finalText);
        el.classList.remove('hx-count-pop');
        void el.offsetWidth;
        el.classList.add('hx-count-pop');
      }
    };
    el._scRaf = requestAnimationFrame(step);
  }

  COUNT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    new MutationObserver(() => animateCount(el)).observe(el, { childList: true, characterData: true, subtree: true });
  });

  function replayCounts(section) {
    COUNT_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (!el || !section.contains(el)) return;
      el._scValue = 0;
      animateCount(el, true);
    });
  }

  /* ---------- 3. รายการ dynamic: ไล่ขึ้นทีละรายการ + การ์ดยกตัว ---------- */
  const LIST_IDS = [
    'pub-achievements-grid', 'pub-recent-reports', 'student-news-grid', 'student-links-container',
    'student-track-list', 'student-songs-list', 'lost-items-list', 'found-items-list',
    'student-chat-list', 'admin-chat-list', 'admin-chat-session-list', 'image-previews',
    'admin-all-reports-table', 'admin-recent-reports-table', 'admin-news-table-body',
    'admin-links-table-body', 'admin-achievements-table-body', 'admin-songs-table-body', 'admin-lf-table-body'
  ];
  const LIFT_IDS = new Set([
    'pub-achievements-grid', 'student-news-grid', 'student-track-list',
    'student-songs-list', 'lost-items-list', 'found-items-list'
  ]);

  const keyOf = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 140);

  function clearStaggerWhenDone(el) {
    const onEnd = event => {
      if (event.target !== el) return;
      el.classList.remove('sc-stagger');
      el.removeEventListener('animationend', onEnd);
    };
    el.addEventListener('animationend', onEnd);
  }

  function processList(container) {
    const previousKeys = container._scKeys || null;
    const animateAll = !previousKeys || Date.now() - lastSwitchAt < 1200;
    const nextKeys = new Set();
    let order = 0;

    Array.from(container.children).forEach(child => {
      const key = keyOf(child);
      nextKeys.add(key);
      if (LIFT_IDS.has(container.id)) child.classList.add('sc-lift');
      if (reduceMotion) return;
      if (animateAll || !previousKeys.has(key)) {
        child.style.setProperty('--sc-i', Math.min(order++, 12));
        child.classList.add('sc-stagger');
        clearStaggerWhenDone(child);
      }
    });
    container._scKeys = nextKeys;
  }

  LIST_IDS.forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;
    new MutationObserver(() => processList(container)).observe(container, { childList: true });
    if (container.children.length) processList(container);
  });

  document.querySelectorAll(
    '#view-public-achievements > .grid.grid-cols-2 > div, #view-admin-dashboard > .grid.grid-cols-2 > div, .public-mini-card, .public-welcome-card'
  ).forEach(card => card.classList.add('sc-lift'));

  /* ---------- 4. ไฟส่องตามเมาส์บนการ์ด ---------- */
  if (finePointer && !reduceMotion) {
    document.addEventListener('pointermove', event => {
      const card = event.target.closest?.('.sc-lift');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      card.style.setProperty('--my', `${event.clientY - rect.top}px`);
    }, { passive: true });
  }

  /* ---------- 5. Ripple เวลากดปุ่ม ---------- */
  document.addEventListener('pointerdown', event => {
    if (reduceMotion || event.button !== 0) return;
    const host = event.target.closest?.('button, .sidebar-link');
    if (!host || host.disabled || host.classList.contains('no-ripple')) return;

    const style = getComputedStyle(host);
    if (style.position === 'static') host.style.position = 'relative';
    if (style.overflow === 'visible') host.style.overflow = 'hidden';

    const rect = host.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2.2;
    const ripple = document.createElement('sc-ripple');
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    host.appendChild(ripple);
    const remove = () => ripple.remove();
    ripple.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 900);
  }, { passive: true });

  /* ---------- 6. Toast ค่อย ๆ หายไป ---------- */
  const toastHost = document.getElementById('app-toast');
  if (toastHost) {
    new MutationObserver(mutations => {
      mutations.forEach(m => m.addedNodes.forEach(node => {
        if (node.nodeType === 1 && node.classList.contains('toast-item')) {
          setTimeout(() => node.classList.add('is-leaving'), 3650);
        }
      }));
    }).observe(toastHost, { childList: true });
  }

  /* ---------- 7. รูปภาพ fade-in เมื่อโหลดเสร็จ ---------- */
  function prepareImage(img) {
    if (img._scImg || reduceMotion) return;
    img._scImg = true;
    if (img.complete && img.naturalWidth) return;
    img.classList.add('sc-img');
    const done = () => img.classList.add('is-loaded');
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  }

  if (main) {
    new MutationObserver(mutations => {
      mutations.forEach(m => m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'IMG') prepareImage(node);
        node.querySelectorAll?.('img').forEach(prepareImage);
      }));
    }).observe(main, { childList: true, subtree: true });
  }

  /* ---------- 8. หัวข้อหน้าเปลี่ยนแบบนุ่ม ---------- */
  const headerTitle = document.getElementById('page-header-title');
  function replayClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  if (headerTitle && !reduceMotion) {
    new MutationObserver(() => replayClass(headerTitle, 'sc-title-in'))
      .observe(headerTitle, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 9. กล่อง error หน้า login สั่น ---------- */
  const loginError = document.getElementById('login-error');
  if (loginError && !reduceMotion) {
    // The observer must stop watching while it changes the box's own class,
    // otherwise every shake triggers another shake and the page freezes.
    const shakeOpts = { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true };
    const shakeObserver = new MutationObserver(() => {
      if (loginError.classList.contains('hidden')) return;
      shakeObserver.disconnect();
      replayClass(loginError, 'sc-shake');
      shakeObserver.observe(loginError, shakeOpts);
    });
    shakeObserver.observe(loginError, shakeOpts);
  }

  /* ---------- 10. ลำดับเมนู (ใช้ไล่ animation ในเมนูมือถือ) ---------- */
  document.querySelectorAll('#sidebar nav .sidebar-link').forEach((link, index) => {
    link.style.setProperty('--sc-n', index);
  });

  /* ---------- 11. ห่อ switchTab: เล่น transition ทุกครั้งที่เปลี่ยนหน้า ---------- */
  const originalSwitchTab = window.switchTab;
  if (typeof originalSwitchTab === 'function') {
    window.switchTab = function (tabId) {
      lastSwitchAt = Date.now();
      const result = originalSwitchTab.apply(this, arguments);
      const section = document.getElementById(`view-${tabId}`);

      if (section && !reduceMotion) {
        Array.from(section.children).forEach((child, index) => child.style.setProperty('--sc-c', Math.min(index, 8)));
        replayClass(section, 'sc-entering');
        clearTimeout(section._scEnterTimer);
        section._scEnterTimer = setTimeout(() => section.classList.remove('sc-entering'), 1400);
        replayCounts(section);
        document.querySelectorAll('#sidebar .sidebar-link.active').forEach(link => replayClass(link, 'sc-pop'));
      }

      progressBar.style.transform = 'scaleX(0)';
      return result;
    };
  }

  /* ---------- 12. เปลี่ยนธีมแบบนุ่ม + จำธีมไว้ ---------- */
  const originalToggleDark = window.toggleDarkMode;
  if (typeof originalToggleDark === 'function') {
    window.toggleDarkMode = function () {
      const html = document.documentElement;
      html.classList.add('sc-theme-fade');
      const result = originalToggleDark.apply(this, arguments);
      try { localStorage.setItem('sc_theme', html.classList.contains('dark') ? 'dark' : 'light'); } catch (e) {}
      clearTimeout(html._scThemeTimer);
      html._scThemeTimer = setTimeout(() => html.classList.remove('sc-theme-fade'), 500);
      return result;
    };
    try {
      if (localStorage.getItem('sc_theme') === 'dark' && !document.documentElement.classList.contains('dark')) {
        originalToggleDark();
      }
    } catch (e) {}
  }

  /* ---------- 13. กราฟ Chart.js ให้เข้ากับธีม ---------- */
  if (window.Chart?.defaults) {
    const d = window.Chart.defaults;
    d.font.family = "'Kanit', sans-serif";
    d.animation = Object.assign({}, d.animation, { duration: reduceMotion ? 0 : 1100, easing: 'easeOutQuart' });
    if (d.plugins?.tooltip) {
      Object.assign(d.plugins.tooltip, {
        backgroundColor: 'rgba(16,37,77,.92)',
        titleColor: '#f7d96d',
        bodyColor: '#ffffff',
        padding: 10,
        cornerRadius: 10,
        displayColors: false
      });
    }
  }
})();


/**
 * SCLRP Hyper Motion — intro, ม่านเปลี่ยนหน้า, อนุภาคพื้นหลัง, แสงตามเมาส์,
 * การ์ดเอียง 3 มิติ, ปุ่มแม่เหล็ก, ประกายเวลาคลิก, พลุกระดาษเมื่อทำสำเร็จ
 * ทั้งหมดปิดเองเมื่อผู้ใช้ตั้งค่า "ลดการเคลื่อนไหว"
 */
(() => {
  'use strict';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const body = document.body;
  const logoSrc = document.querySelector('#sidebar-brand-toggle img, .login-brand-mark img')?.src || '';
  const GOLD = '#f1c644';
  const COLORS = ['#f1c644', '#f7d96d', '#ffffff', '#3475ce', '#2456a6', '#d6a916'];
  const isDarkScene = () => body.classList.contains('login-shell') || document.documentElement.classList.contains('dark');

  function el(tag, attrs = {}, html = '') {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (html) node.innerHTML = html;
    return node;
  }

  /* ---------- 1. พื้นหลังอนุภาคเชื่อมเส้น ---------- */
  const bg = el('canvas', { id: 'hx-bg', 'aria-hidden': 'true' });
  body.prepend(bg);
  const bctx = bg.getContext('2d');
  const pointer = { x: -9999, y: -9999, active: false };
  let dots = [];
  let dpr = 1;

  function resizeBg() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    bg.width = innerWidth * dpr;
    bg.height = innerHeight * dpr;
    const count = Math.round(Math.min(finePointer ? 80 : 38, (innerWidth * innerHeight) / 16000) * (lowPower ? .5 : 1));
    dots = Array.from({ length: count }, () => ({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      vx: (Math.random() - .5) * .35,
      vy: (Math.random() - .5) * .35,
      r: Math.random() * 1.6 + .8,
      gold: Math.random() < .35
    }));
  }

  function drawBg() {
    if (document.hidden) { requestAnimationFrame(drawBg); return; }
    const dark = isDarkScene();
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, innerWidth, innerHeight);
    const linkDist = 130;

    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < -10) d.x = innerWidth + 10; else if (d.x > innerWidth + 10) d.x = -10;
      if (d.y < -10) d.y = innerHeight + 10; else if (d.y > innerHeight + 10) d.y = -10;
      if (pointer.active) {
        const dx = pointer.x - d.x, dy = pointer.y - d.y, dist = Math.hypot(dx, dy);
        if (dist < 180 && dist > 1) { d.x -= (dx / dist) * .6; d.y -= (dy / dist) * .6; }
      }
    }

    for (let i = 0; i < dots.length; i++) {
      const a = dots[i];
      for (let j = i + 1; j < dots.length; j++) {
        const b = dots[j];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < linkDist) {
          const alpha = (1 - dist / linkDist) * (dark ? .28 : .16);
          bctx.strokeStyle = dark ? `rgba(170,193,226,${alpha})` : `rgba(36,86,166,${alpha})`;
          bctx.lineWidth = 1;
          bctx.beginPath(); bctx.moveTo(a.x, a.y); bctx.lineTo(b.x, b.y); bctx.stroke();
        }
      }
      if (pointer.active) {
        const dist = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (dist < 200) {
          bctx.strokeStyle = `rgba(241,198,68,${(1 - dist / 200) * (dark ? .55 : .4)})`;
          bctx.beginPath(); bctx.moveTo(a.x, a.y); bctx.lineTo(pointer.x, pointer.y); bctx.stroke();
        }
      }
      bctx.fillStyle = a.gold ? `rgba(241,198,68,${dark ? .8 : .55})` : (dark ? 'rgba(220,232,250,.55)' : 'rgba(36,86,166,.35)');
      bctx.beginPath(); bctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); bctx.fill();
    }
    requestAnimationFrame(drawBg);
  }

  resizeBg();
  addEventListener('resize', resizeBg, { passive: true });
  requestAnimationFrame(drawBg);

  /* ---------- 2. แสงตามเมาส์ ---------- */
  const glow = el('div', { id: 'hx-glow', 'aria-hidden': 'true' });
  body.prepend(glow);
  let gx = innerWidth / 2, gy = innerHeight / 2;
  if (finePointer) {
    (function followGlow() {
      gx += (pointer.x - gx) * .12;
      gy += (pointer.y - gy) * .12;
      glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      requestAnimationFrame(followGlow);
    })();
  }

  addEventListener('pointermove', e => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    if (finePointer) glow.classList.add('is-on');
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; glow.classList.remove('is-on'); });

  /* ---------- 3. เลเยอร์เอฟเฟกต์: ประกาย + พลุกระดาษ ---------- */
  const fx = el('canvas', { id: 'hx-fx', 'aria-hidden': 'true' });
  body.appendChild(fx);
  const fctx = fx.getContext('2d');
  let parts = [];
  let fxRunning = false;

  function resizeFx() { fx.width = innerWidth * dpr; fx.height = innerHeight * dpr; }
  resizeFx();
  addEventListener('resize', resizeFx, { passive: true });

  function runFx() {
    fxRunning = true;
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.life--;
      p.vy += p.g; p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      const alpha = Math.min(1, p.life / 25);
      fctx.save();
      fctx.globalAlpha = alpha;
      fctx.translate(p.x, p.y);
      if (p.kind === 'spark') {
        fctx.strokeStyle = p.color; fctx.lineWidth = 2; fctx.lineCap = 'round';
        fctx.beginPath(); fctx.moveTo(0, 0); fctx.lineTo(-p.vx * 3, -p.vy * 3); fctx.stroke();
      } else {
        fctx.rotate(p.rot);
        fctx.scale(1, Math.cos(p.rot * 2));
        fctx.fillStyle = p.color;
        fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      fctx.restore();
    }
    if (parts.length) requestAnimationFrame(runFx);
    else { fctx.clearRect(0, 0, innerWidth, innerHeight); fxRunning = false; }
  }

  function startFx() { if (!fxRunning) requestAnimationFrame(runFx); }

  function sparks(x, y, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 4 + 2;
      parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: .05, drag: .9, life: 26 + Math.random() * 10, rot: 0, vr: 0, color: Math.random() < .7 ? GOLD : '#ffffff' });
    }
    startFx();
  }

  function cannon(x, y, angle, n) {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - .5) * .9, s = Math.random() * 11 + 8;
      parts.push({ kind: 'confetti', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: .28, drag: .975, life: 110 + Math.random() * 50, rot: Math.random() * 6, vr: (Math.random() - .5) * .35, w: Math.random() * 7 + 5, h: Math.random() * 5 + 3, color: COLORS[(Math.random() * COLORS.length) | 0] });
    }
    startFx();
  }

  function celebrate() {
    cannon(-10, innerHeight + 10, -Math.PI / 3, 80);
    cannon(innerWidth + 10, innerHeight + 10, -Math.PI * 2 / 3, 80);
    setTimeout(() => cannon(innerWidth / 2, innerHeight * .35, -Math.PI / 2, 50), 180);
  }
  window.sclrpCelebrate = celebrate;

  let lastDown = { x: innerWidth / 2, y: innerHeight / 2, t: 0 };
  document.addEventListener('pointerdown', e => {
    lastDown = { x: e.clientX, y: e.clientY, t: performance.now() };
    const interactive = e.target.closest?.('button, a, .sidebar-link, label[for], .sc-lift');
    sparks(e.clientX, e.clientY, interactive ? 14 : 6);
  }, { passive: true });

  const toastHost = document.getElementById('app-toast');
  if (toastHost) {
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType === 1 && n.classList.contains('bg-emerald-600')) celebrate();
    }))).observe(toastHost, { childList: true });
  }

  /* ---------- 4. Intro ตอนเปิดเว็บ ---------- */
  let introSeen = false;
  try { introSeen = sessionStorage.getItem('sclrp_intro') === '1'; sessionStorage.setItem('sclrp_intro', '1'); } catch (e) {}

  if (!introSeen) {
    const intro = el('div', { id: 'hx-intro', role: 'presentation', title: 'คลิกเพื่อข้าม' }, `
      <div class="hx-half top"></div><div class="hx-half bottom"></div>
      <div class="hx-core">
        <div class="hx-emblem">
          <svg viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="70" transform="rotate(-90 75 75)"></circle></svg>
          ${logoSrc ? `<img src="${logoSrc}" alt="">` : ''}
        </div>
        <div class="hx-name">LRP STUDENT COUNCIL</div>
        <div class="hx-line"></div>
        <div class="hx-sub">สภานักเรียน · เสียงของคุณเปลี่ยนโรงเรียนได้</div>
      </div>`);
    body.appendChild(intro);

    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      intro.classList.add('is-leaving');
      const cx = innerWidth / 2, cy = innerHeight / 2;
      setTimeout(() => { sparks(cx, cy, 40); cannon(cx, cy, -Math.PI / 2, 60); }, 200);
      setTimeout(replayCurrentView, 260);
      setTimeout(() => intro.remove(), 1100);
    };
    intro.addEventListener('click', leave);
    setTimeout(leave, 1900);
  }

  function replayCurrentView() {
    try {
      if (typeof currentTab === 'undefined') return;
      if (currentTab === 'login') {
        const view = document.getElementById('view-login');
        if (view) { view.classList.add('hidden'); void view.offsetWidth; view.classList.remove('hidden'); }
      } else if (typeof window.switchTab === 'function') {
        window.switchTab(currentTab);
      }
    } catch (e) { console.error(e); }
  }

  /* ---------- 5. ม่านเปลี่ยนหน้าเวลาคลิกเมนู ---------- */
  const curtain = el('div', { id: 'hx-curtain', 'aria-hidden': 'true' }, `<i></i><i>${logoSrc ? `<img src="${logoSrc}" alt="">` : ''}</i>`);
  body.appendChild(curtain);

  function runCurtain() {
    curtain.classList.remove('run');
    void curtain.offsetWidth;
    curtain.classList.add('run');
    clearTimeout(curtain._t);
    curtain._t = setTimeout(() => curtain.classList.remove('run'), 820);
  }

  const innerSwitch = window.switchTab;
  if (typeof innerSwitch === 'function') {
    let pendingArgs = null, timer = null, busyUntil = 0;
    window.switchTab = function (tabId) {
      const ev = window.event;
      const navTarget = ev && ev.type === 'click' && ev.target?.closest?.('#topnav [data-tab], .sidebar-link, #sidebar-brand-toggle');
      const same = typeof currentTab !== 'undefined' && tabId === currentTab;
      if (!navTarget || same || tabId === 'login') {
        // Any direct switch wins over a curtain switch that is still waiting.
        if (timer) { clearTimeout(timer); timer = null; curtain.classList.remove('run'); }
        return innerSwitch.apply(this, arguments);
      }

      pendingArgs = arguments;
      if (timer) return;
      if (performance.now() < busyUntil) return innerSwitch.apply(this, arguments);

      runCurtain();
      busyUntil = performance.now() + 760;
      timer = setTimeout(() => {
        timer = null;
        innerSwitch.apply(window, pendingArgs);
        window.dispatchEvent(new Event('hx:switched'));
      }, 310);
    };
  }

  /* ---------- 6. โผล่ขึ้นตอนเลื่อนมาเห็น ---------- */
  const main = document.querySelector('main');
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const t = entry.target;
      io.unobserve(t);
      t.classList.remove('hx-pending');
      t.classList.add('hx-in');
      const done = e => { if (e.target === t) { t.classList.remove('hx-in'); t.removeEventListener('animationend', done); } };
      t.addEventListener('animationend', done);
    });
  }, { root: main, rootMargin: '0px 0px -8% 0px', threshold: .08 }) : null;

  function scanReveal() {
    if (!io || !main || body.classList.contains('login-shell')) return;
    const limit = main.getBoundingClientRect().bottom;
    main.querySelectorAll(':scope > section:not(.hidden) > * :is(.shadow-premium, .public-report-card, .sc-lift)').forEach(node => {
      if (node._hxSeen) return;
      node._hxSeen = true;
      if (node.getBoundingClientRect().top > limit - 10) {
        node.classList.add('hx-pending');
        io.observe(node);
      }
    });
  }

  let scanTimer = null;
  const queueScan = () => { clearTimeout(scanTimer); scanTimer = setTimeout(scanReveal, 140); };
  if (main) new MutationObserver(queueScan).observe(main, { childList: true, subtree: true });
  addEventListener('hx:switched', queueScan);
  setInterval(() => { if (!document.hidden) queueScan(); }, 3000);
  setTimeout(() => document.querySelectorAll('.hx-pending').forEach(n => {
    const r = n.getBoundingClientRect();
    if (r.top < innerHeight) { n.classList.remove('hx-pending'); n.classList.add('hx-in'); }
  }), 5000);

  /* ---------- 7. การ์ดเอียง 3 มิติ + ปุ่มแม่เหล็ก ---------- */
  if (finePointer) {
    document.addEventListener('pointermove', e => {
      const card = e.target.closest?.('.sc-lift');
      if (card) {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        card.style.setProperty('--rx', `${(-py * 9).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${(px * 11).toFixed(2)}deg`);
        card.classList.add('hx-tilting');
      }

      const btn = e.target.closest?.('button');
      if (btn && !btn.closest('table, #demo-bar, #sidebar nav, #topnav .tn-center, #topnav .tn-sheet, .tn-burger') && !btn.disabled) {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.translate = `${(dx * 10).toFixed(1)}px ${(dy * 8).toFixed(1)}px`;
        btn._hxMag = true;
      }
    }, { passive: true });

    document.addEventListener('pointerout', e => {
      const card = e.target.closest?.('.sc-lift');
      if (card && !card.contains(e.relatedTarget)) {
        card.classList.remove('hx-tilting');
        card.style.removeProperty('--rx');
        card.style.removeProperty('--ry');
      }
      const btn = e.target.closest?.('button');
      if (btn && btn._hxMag && !btn.contains(e.relatedTarget)) {
        btn.style.translate = '';
        btn._hxMag = false;
      }
    }, { passive: true });

    /* หน้า Login: ภาพเคลื่อนตามเมาส์ */
    const showcase = document.querySelector('.login-showcase');
    if (showcase) {
      document.addEventListener('pointermove', e => {
        if (!body.classList.contains('login-shell')) return;
        showcase.style.setProperty('--px', ((e.clientX / innerWidth) - .5).toFixed(3));
        showcase.style.setProperty('--py', ((e.clientY / innerHeight) - .5).toFixed(3));
      }, { passive: true });
    }
  }

  /* ---------- 8. popup เด้งออกจากจุดที่กด ---------- */
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    const panel = backdrop.querySelector('.modal-panel');
    if (!panel) return;
    new MutationObserver(() => {
      if (backdrop.classList.contains('hidden') || backdrop.classList.contains('is-closing')) return;
      const recent = performance.now() - lastDown.t < 800;
      panel.style.transformOrigin = recent
        ? `${lastDown.x - panel.offsetLeft}px ${lastDown.y - panel.offsetTop}px`
        : 'center';
    }).observe(backdrop, { attributes: true, attributeFilter: ['class'] });
  });
})();


/**
 * SCLRP Top Navigation — สร้างเมนูตามสิทธิ์ผู้ใช้, แสงเลื่อนตามเมาส์, เมนูย่อย, เมนูมือถือ
 */
(() => {
  'use strict';
  const nav = document.getElementById('topnav');
  if (!nav) return;

  const body = document.body;
  const center = nav.querySelector('.tn-center');
  const right = nav.querySelector('.tn-right');
  const sheet = nav.querySelector('.tn-sheet-inner');
  const scrim = document.getElementById('tn-scrim');
  const main = document.querySelector('main');

  const NAV = {
    guest: [
      { tab: 'public-achievements', label: 'หน้าหลัก', icon: 'fa-house', desc: 'สรุปผลงานและการแก้ไขปัญหา' }
    ],
    student: [
      { tab: 'public-achievements', label: 'หน้าหลัก', icon: 'fa-house', desc: 'สรุปผลงานและการแก้ไขปัญหา' },
      { label: 'ข่าวสาร', items: [
        { tab: 'student-news', label: 'ข่าวสารและประกาศ', icon: 'fa-bullhorn', desc: 'ประกาศล่าสุดจากสภานักเรียน' },
        { tab: 'student-links', label: 'ศูนย์รวมลิงก์สำคัญ', icon: 'fa-link', desc: 'แบบสำรวจ ลงทะเบียน เว็บโรงเรียน' }
      ] },
      { label: 'แจ้งปัญหา', items: [
        { tab: 'student-report', label: 'แจ้งปัญหาใหม่', icon: 'fa-circle-exclamation', desc: 'ส่งเรื่องพร้อมรูปถึงทีมสภาฯ' },
        { tab: 'student-track', label: 'ติดตามสถานะ', icon: 'fa-clock-rotate-left', desc: 'ดูความคืบหน้าเรื่องที่คุณแจ้ง' }
      ] },
      { label: 'บริการ', items: [
        { tab: 'student-songs', label: 'ขอเพลง', icon: 'fa-music', desc: 'ส่งเพลงให้เปิดช่วงพักเที่ยง' },
        { tab: 'student-lostfound', label: 'ของหายได้คืน', icon: 'fa-box-open', desc: 'แจ้งของหายหรือของที่เก็บได้' }
      ] },
      { tab: 'student-chat', label: 'แชท', icon: 'fa-comments', desc: 'คุยกับแอดมินโดยตรง' }
    ],
    admin: [
      { tab: 'admin-dashboard', label: 'Dashboard', icon: 'fa-chart-pie', desc: 'ภาพรวมทั้งระบบ' },
      { tab: 'admin-reports', label: 'เรื่องร้องเรียน', icon: 'fa-list-check', desc: 'จัดการปัญหาที่แจ้งเข้ามา' },
      { label: 'เนื้อหา', items: [
        { tab: 'admin-news', label: 'ข่าวสาร', icon: 'fa-bullhorn', desc: 'เพิ่ม แก้ไข ลบประกาศ' },
        { tab: 'admin-links', label: 'ลิงก์สำคัญ', icon: 'fa-link', desc: 'จัดการลิงก์ที่นักเรียนเห็น' },
        { tab: 'admin-achievements', label: 'ผลงานสภาฯ', icon: 'fa-trophy', desc: 'บันทึกโครงการที่ทำเสร็จ' },
        { tab: 'public-achievements', label: 'หน้าสาธารณะ', icon: 'fa-globe', desc: 'ดูหน้าที่ทุกคนเห็น' }
      ] },
      { label: 'บริการ', items: [
        { tab: 'admin-songs', label: 'คิวขอเพลง', icon: 'fa-radio', desc: 'อนุมัติและจัดลำดับเพลง' },
        { tab: 'admin-lostfound', label: 'ของหายได้คืน', icon: 'fa-boxes-stacked', desc: 'อัปเดตสถานะและปักหมุด' }
      ] },
      { tab: 'admin-chat', label: 'แชท', icon: 'fa-comments', desc: 'ตอบข้อความนักเรียน' }
    ]
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const role = () => (typeof currentRole !== 'undefined' && NAV[currentRole]) ? currentRole : 'guest';
  const user = () => (typeof currentUser !== 'undefined' ? currentUser : null);
  const tabNow = () => (typeof currentTab !== 'undefined' ? currentTab : 'public-achievements');
  const isDark = () => document.documentElement.classList.contains('dark');

  const subLink = (s, i = 0) => `<a class="tn-sub" role="menuitem" href="#${s.tab}" data-tab="${s.tab}" style="--i:${i}"><span class="tn-ic"><i class="fa-solid ${s.icon}"></i></span><span><strong>${esc(s.label)}</strong><small>${esc(s.desc)}</small></span></a>`;

  function userChip() {
    const u = user();
    if (!u) return '';
    const sub = role() === 'admin' ? 'ผู้ดูแลระบบ' : `นักเรียน · ${u.class || '-'}`;
    const initial = (u.name || '?').trim().charAt(0);
    return `<div class="tn-user"><span class="tn-avatar">${esc(initial)}</span><span><strong>${esc(u.name || 'ผู้ใช้')}</strong><small>${esc(sub)}</small></span></div>`;
  }

  const themeIcon = () => `<i class="fa-solid ${isDark() ? 'fa-sun' : 'fa-moon'}"></i>`;

  function render() {
    const r = role();
    const entries = NAV[r];

    center.innerHTML = '<span class="tn-indicator" aria-hidden="true"></span>' + entries.map(e => e.items
      ? `<div class="tn-dd"><button type="button" class="tn-item no-ripple" aria-haspopup="true" aria-expanded="false">${esc(e.label)}<i class="fa-solid fa-chevron-down tn-chev"></i></button><div class="tn-panel" role="menu">${e.items.map(s => subLink(s)).join('')}</div></div>`
      : `<a class="tn-item" href="#${e.tab}" data-tab="${e.tab}">${esc(e.label)}</a>`).join('');

    const loggedIn = r !== 'guest';
    right.innerHTML = `
      <button type="button" class="tn-icon tn-theme" data-act="theme" aria-label="สลับโหมดสว่าง/มืด">${themeIcon()}</button>
      ${loggedIn
        ? `${userChip()}<button type="button" class="tn-icon tn-logout" data-act="logout" aria-label="ออกจากระบบ" title="ออกจากระบบ"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>`
        : `<button type="button" class="tn-ghost" data-act="register">สมัครสมาชิก</button><button type="button" class="tn-cta" data-act="login">เข้าสู่ระบบ</button>`}
      <button type="button" class="tn-burger no-ripple" data-act="menu" aria-label="เปิดเมนู" aria-expanded="false" aria-controls="tn-sheet"><span></span><span></span></button>`;

    const singles = entries.filter(e => !e.items);
    const groups = entries.filter(e => e.items);
    let i = 0;
    sheet.innerHTML = [
      loggedIn ? userChip().replace('class="tn-user"', `class="tn-user" style="--i:${i++}"`) : '',
      `<div class="tn-sheet-label" style="--i:${i++}">เมนูหลัก</div>`,
      singles.map(s => subLink(s, i++)).join(''),
      groups.map(g => `<div class="tn-sheet-label" style="--i:${i++}">${esc(g.label)}</div>${g.items.map(s => subLink(s, i++)).join('')}`).join(''),
      `<div class="tn-sheet-actions" style="--i:${i++}">
        <button type="button" class="tn-ghost" data-act="theme">${themeIcon()}<span>${isDark() ? 'โหมดสว่าง' : 'โหมดมืด'}</span></button>
        ${loggedIn
          ? '<button type="button" class="tn-ghost" data-act="logout"><i class="fa-solid fa-arrow-right-from-bracket"></i><span>ออกจากระบบ</span></button>'
          : '<button type="button" class="tn-cta" data-act="login">เข้าสู่ระบบ</button>'}
      </div>`
    ].join('');

    nav.dataset.role = r;
    syncActive(tabNow(), true);
  }

  /* ---------- แสงเลื่อนตามเมนู ---------- */
  function visibleActive() {
    return center.querySelector(':scope > .tn-item.is-active, :scope > .tn-dd > .tn-item.is-active');
  }

  function moveIndicator(target, instant = false) {
    const ind = center.querySelector('.tn-indicator');
    if (!ind) return;
    if (!target || !target.getClientRects().length) { ind.style.opacity = '0'; return; }
    if (instant) center.classList.add('tn-noanim');
    const c = center.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    ind.style.width = `${t.width}px`;
    ind.style.transform = `translateX(${t.left - c.left}px)`;
    ind.style.opacity = '1';
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => center.classList.remove('tn-noanim')));
  }

  function syncActive(tab, instant = false) {
    nav.querySelectorAll('[data-tab]').forEach(a => {
      const on = a.dataset.tab === tab;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    center.querySelectorAll('.tn-dd').forEach(dd => {
      dd.querySelector('.tn-item').classList.toggle('is-active', !!dd.querySelector(`.tn-sub[data-tab="${tab}"]`));
    });
    requestAnimationFrame(() => moveIndicator(visibleActive(), instant));
  }

  center.addEventListener('pointerover', e => {
    const item = e.target.closest('.tn-item');
    if (item && center.contains(item)) moveIndicator(item);
  });
  center.addEventListener('pointerleave', () => {
    if (!center.querySelector('.tn-dd.is-open')) moveIndicator(visibleActive());
  });

  /* ---------- เมนูย่อย ---------- */
  let closeTimer = null;
  function openDd(dd) {
    clearTimeout(closeTimer);
    center.querySelectorAll('.tn-dd.is-open').forEach(o => { if (o !== dd) closeDd(o); });
    dd.classList.add('is-open');
    dd.querySelector('.tn-item').setAttribute('aria-expanded', 'true');
    moveIndicator(dd.querySelector('.tn-item'));
  }
  function closeDd(dd) {
    dd.classList.remove('is-open');
    dd.querySelector('.tn-item')?.setAttribute('aria-expanded', 'false');
  }
  function closeAllDd() {
    center.querySelectorAll('.tn-dd.is-open').forEach(closeDd);
    moveIndicator(visibleActive());
  }

  center.addEventListener('pointerover', e => {
    const dd = e.target.closest('.tn-dd');
    if (dd && e.pointerType === 'mouse') openDd(dd);
  });
  center.addEventListener('pointerout', e => {
    const dd = e.target.closest('.tn-dd');
    if (!dd || e.pointerType !== 'mouse' || dd.contains(e.relatedTarget)) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => { closeDd(dd); if (!center.matches(':hover')) moveIndicator(visibleActive()); }, 160);
  });
  center.addEventListener('click', e => {
    const trigger = e.target.closest('.tn-dd > .tn-item');
    if (!trigger) return;
    const dd = trigger.parentElement;
    if (dd.classList.contains('is-open') && e.pointerType !== 'mouse') closeDd(dd);
    else openDd(dd);
  });
  center.addEventListener('focusin', e => {
    const dd = e.target.closest('.tn-dd');
    if (dd) openDd(dd);
  });
  center.addEventListener('focusout', e => {
    const dd = e.target.closest('.tn-dd');
    if (dd && !dd.contains(e.relatedTarget)) closeDd(dd);
  });

  /* ---------- เมนูมือถือ ---------- */
  function setSheet(open) {
    nav.classList.toggle('is-open', open);
    const burger = nav.querySelector('.tn-burger');
    burger?.setAttribute('aria-expanded', String(open));
    burger?.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
    if (!scrim) return;
    clearTimeout(scrim._t);
    if (open) {
      scrim.hidden = false;
      requestAnimationFrame(() => scrim.classList.add('is-on'));
    } else {
      scrim.classList.remove('is-on');
      scrim._t = setTimeout(() => { scrim.hidden = true; }, 450);
    }
  }
  scrim?.addEventListener('click', () => setSheet(false));

  /* ---------- คลิกในแถบเมนู ---------- */
  nav.addEventListener('click', e => {
    const link = e.target.closest('[data-tab]');
    if (link) {
      e.preventDefault();
      closeAllDd();
      setSheet(false);
      if (typeof window.switchTab === 'function') window.switchTab(link.dataset.tab);
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'menu') setSheet(!nav.classList.contains('is-open'));
    if (act === 'theme' && typeof window.toggleDarkMode === 'function') window.toggleDarkMode();
    if (act === 'logout' || act === 'login') { setSheet(false); if (typeof window.handleAuthAction === 'function') window.handleAuthAction(); }
    if (act === 'register') {
      setSheet(false);
      window.switchTab?.('login');
      setTimeout(() => { window.setLoginRole?.('student'); window.toggleLoginRegister?.('register'); }, 360);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    closeAllDd();
    setSheet(false);
  });
  document.addEventListener('pointerdown', e => {
    if (!nav.contains(e.target)) closeAllDd();
  });

  /* ---------- ย่อแถบเมื่อเลื่อนหน้า ---------- */
  main?.addEventListener('scroll', () => nav.classList.toggle('is-scrolled', main.scrollTop > 12), { passive: true });

  let resizeTimer = null;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (innerWidth > 1100) setSheet(false);
      moveIndicator(visibleActive(), true);
    }, 120);
  }, { passive: true });

  /* ---------- ผูกกับระบบเดิม ---------- */
  const prevSwitch = window.switchTab;
  if (typeof prevSwitch === 'function') {
    window.switchTab = function (tabId) {
      syncActive(tabId);
      return prevSwitch.apply(this, arguments);
    };
  }

  const prevAuth = window.updateUIAuth;
  if (typeof prevAuth === 'function') {
    window.updateUIAuth = function () {
      const result = prevAuth.apply(this, arguments);
      render();
      return result;
    };
  }

  const prevTheme = window.toggleDarkMode;
  if (typeof prevTheme === 'function') {
    window.toggleDarkMode = function () {
      const result = prevTheme.apply(this, arguments);
      nav.querySelectorAll('[data-act="theme"]').forEach(btn => {
        const icon = btn.querySelector('i');
        if (icon) icon.className = `fa-solid ${isDark() ? 'fa-sun' : 'fa-moon'}`;
        const label = btn.querySelector('span');
        if (label) label.textContent = isDark() ? 'โหมดสว่าง' : 'โหมดมืด';
      });
      return result;
    };
  }

  render();
  document.fonts?.ready?.then(() => moveIndicator(visibleActive(), true));
})();


/**
 * SCLRP Stability Layer
 * - กันกดซ้ำทุกปุ่มบันทึก/ส่ง และแสดงสถานะกำลังทำงาน
 * - แจ้งเตือนเมื่อเน็ตหลุด/กลับมา และโหลดข้อมูลใหม่เมื่อกลับมาที่แท็บหลังหายไปนาน
 * - ดักข้อผิดพลาดที่ไม่คาดคิดแล้วบอกผู้ใช้แบบเข้าใจง่าย
 * - กด Enter เพื่อส่งแชท (รองรับการพิมพ์ภาษาไทย)
 * - อัปโหลดรูปปกข่าว/ผลงานได้จริง
 * - สลับประเภทในฟอร์มของหายโดยข้อมูลที่พิมพ์ไว้ไม่หาย
 * - ช่องว่างระหว่างโหลดแสดงโครงร่าง และแสดงข้อความเมื่อไม่มีข้อมูล
 */
(() => {
  'use strict';

  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const toast = (msg, type = 'info') => { try { showToast(msg, type); } catch (e) { console.warn(msg); } };
  let dataLoaded = false;

  /* ---------- 1. ข้อมูลโหลดครั้งแรกเสร็จหรือยัง (ใช้ตัดสินว่าจะแสดงโครงร่างหรือข้อความว่าง) ---------- */
  const prevRefreshAll = window.refreshAllRemoteData;
  if (typeof prevRefreshAll === 'function') {
    window.refreshAllRemoteData = async function () {
      const ok = await prevRefreshAll.apply(this, arguments);
      if (ok) {
        dataLoaded = true;
        document.documentElement.classList.add('sc-data-ready');
        applyEmptyStates();
      }
      return ok;
    };
  }

  /* ---------- 2. ข้อความเมื่อไม่มีข้อมูล ---------- */
  const EMPTY = {
    'student-news-grid': ['fa-regular fa-newspaper', 'ยังไม่มีข่าวสาร', 'เมื่อสภานักเรียนลงประกาศ จะแสดงที่นี่'],
    'pub-achievements-grid': ['fa-solid fa-trophy', 'ยังไม่มีผลงาน', 'ผลงานของสภานักเรียนจะแสดงที่นี่'],
    'student-links-container': ['fa-solid fa-link', 'ยังไม่มีลิงก์', 'ลิงก์สำคัญจากสภานักเรียนจะแสดงที่นี่']
  };

  function applyEmptyStates() {
    if (!dataLoaded) return;
    Object.entries(EMPTY).forEach(([id, [icon, title, text]]) => {
      const box = document.getElementById(id);
      if (!box || box.children.length) return;
      box.innerHTML = `<div class="sc-empty"><i class="${icon}"></i><strong>${title}</strong><span>${text}</span></div>`;
    });
    const tbody = document.getElementById('admin-all-reports-table');
    const empty = document.getElementById('admin-reports-empty');
    if (tbody && empty) empty.classList.toggle('hidden', tbody.children.length > 0);
  }

  ['renderStudentNews', 'renderPublicAchievements', 'renderStudentLinks', 'renderAdminReports'].forEach(name => {
    const fn = window[name];
    if (typeof fn !== 'function') return;
    window[name] = function () {
      const result = fn.apply(this, arguments);
      applyEmptyStates();
      return result;
    };
  });

  /* ---------- 3. อัปโหลดรูปปกข่าว / ผลงาน ---------- */
  const pendingCover = { news: null, achievement: null };

  async function uploadContentImage(file, folder) {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('school-images').upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (error) throw error;
    return sb.storage.from('school-images').getPublicUrl(path).data.publicUrl;
  }

  function showCoverPreview(kind, src) {
    const wrap = document.getElementById(`${kind}-editor-img-preview`);
    const img = document.getElementById(`${kind}-preview-element`);
    if (!wrap || !img) return;
    if (src) { img.src = src; wrap.classList.remove('hidden'); }
    else { img.removeAttribute('src'); wrap.classList.add('hidden'); }
  }

  function resetCover(kind) {
    if (pendingCover[kind]?.preview) URL.revokeObjectURL(pendingCover[kind].preview);
    pendingCover[kind] = null;
    const fileInput = document.getElementById(`${kind}-editor-img-file`);
    if (fileInput) fileInput.value = '';
    showCoverPreview(kind, document.getElementById(`${kind}-editor-img-url`)?.value.trim() || '');
  }

  ['news', 'achievement'].forEach(kind => {
    const fileInput = document.getElementById(`${kind}-editor-img-file`);
    const urlInput = document.getElementById(`${kind}-editor-img-url`);
    fileInput?.setAttribute('accept', IMAGE_TYPES.join(','));
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!IMAGE_TYPES.includes(file.type)) { toast('รองรับเฉพาะไฟล์ JPG, PNG, WEBP', 'error'); fileInput.value = ''; return; }
      if (file.size > MAX_SCHOOL_IMAGE_BYTES) { toast('รูปภาพต้องมีขนาดไม่เกิน 8MB', 'error'); fileInput.value = ''; return; }
      if (pendingCover[kind]?.preview) URL.revokeObjectURL(pendingCover[kind].preview);
      pendingCover[kind] = { file, preview: URL.createObjectURL(file) };
      showCoverPreview(kind, pendingCover[kind].preview);
    });
    urlInput?.addEventListener('input', () => { if (!pendingCover[kind]) showCoverPreview(kind, urlInput.value.trim()); });

    const openName = kind === 'news' ? 'openNewsModal' : 'openAchievementModal';
    const saveName = kind === 'news' ? 'saveNewsItem' : 'saveAchievementItem';
    const open = window[openName];
    if (typeof open === 'function') {
      window[openName] = function () { const r = open.apply(this, arguments); resetCover(kind); return r; };
    }
    const save = window[saveName];
    if (typeof save === 'function') {
      window[saveName] = async function () {
        if (pendingCover[kind]) {
          try {
            urlInput.value = await uploadContentImage(pendingCover[kind].file, kind === 'news' ? 'news' : 'achievements');
            pendingCover[kind] = null;
          } catch (err) {
            console.error('Cover upload failed:', err);
            toast('อัปโหลดรูปไม่สำเร็จ: ' + (err?.message || err), 'error');
            return;
          }
        }
        return save.apply(this, arguments);
      };
    }
  });

  /* ---------- 4. กันกดซ้ำ + แสดงสถานะกำลังทำงานบนปุ่ม ---------- */
  function buttonFor(ev) {
    if (ev?.type === 'submit') return ev.target?.querySelector?.('button[type="submit"]') || null;
    const fromEvent = ev?.target?.closest?.('button');
    if (fromEvent) return fromEvent;
    const active = document.activeElement;
    return active?.tagName === 'BUTTON' ? active : null;
  }

  const GUARDED = [
    'submitProblemReport', 'submitSongRequest', 'submitLostFoundReport',
    'saveNewsItem', 'saveLinkItem', 'saveAchievementItem', 'saveSongStatus',
    'saveAdminLostFoundStatus', 'saveReportFromAdmin', 'sendStudentChat', 'sendAdminChat',
    'deleteNewsItem', 'deleteLinkItem', 'deleteAchievementItem', 'clearPlayedSongs'
  ];

  GUARDED.forEach(name => {
    const fn = window[name];
    if (typeof fn !== 'function') return;
    let busy = false;
    window[name] = async function () {
      if (busy) return;
      busy = true;
      const btn = buttonFor(window.event);
      const wasDisabled = btn?.disabled;
      if (btn) { btn.disabled = true; btn.classList.add('sc-busy'); btn.setAttribute('aria-busy', 'true'); }
      try {
        return await fn.apply(this, arguments);
      } catch (err) {
        console.error(`${name} failed:`, err);
        toast('ทำรายการไม่สำเร็จ: ' + (err?.message || 'กรุณาลองอีกครั้ง'), 'error');
      } finally {
        busy = false;
        if (btn) { btn.disabled = !!wasDisabled; btn.classList.remove('sc-busy'); btn.removeAttribute('aria-busy'); }
      }
    };
  });

  /* ---------- 5. Enter เพื่อส่งแชท ---------- */
  [['student-chat-input', 'sendStudentChat'], ['admin-chat-input', 'sendAdminChat']].forEach(([id, fnName]) => {
    const input = document.getElementById(id);
    input?.setAttribute('enterkeyhint', 'send');
    input?.setAttribute('autocomplete', 'off');
    input?.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      window[fnName]?.();
    });
  });

  /* ---------- 6. สลับประเภทในฟอร์มของหาย โดยไม่ล้างข้อมูลที่พิมพ์ไว้ ---------- */
  document.addEventListener('click', e => {
    const btn = e.target.closest?.('[data-lf-type]');
    if (!btn) return;
    const modal = document.getElementById('student-lostfound-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    e.preventDefault();
    e.stopPropagation();

    const type = btn.dataset.lfType;
    const isMoney = type === 'money';
    const typeField = document.getElementById('lf-type');
    const label = document.getElementById('lf-item-name-label');
    const itemName = document.getElementById('lf-item-name');
    if (typeField) {
      if (isMoney) {
        const checked = document.querySelector('input[name="money-type"]:checked');
        typeField.value = checked ? `money_${checked.value}` : '';
      } else {
        typeField.value = type;
        document.querySelectorAll('input[name="money-type"]').forEach(r => { r.checked = false; });
      }
    }
    document.getElementById('lf-money-type-section')?.classList.toggle('hidden', !isMoney);
    if (label?.firstChild) label.firstChild.textContent = isMoney ? 'จำนวนเงินหรือรายละเอียด ' : 'ชื่อสิ่งของ / รายการ ';
    if (itemName) itemName.placeholder = isMoney ? 'เช่น จำนวนเงินโดยประมาณ / ลักษณะธนบัตร' : 'เช่น กระเป๋านักเรียน, โทรศัพท์, สมุด';
    if (isMoney && typeof selectLostFoundCategory === 'function') selectLostFoundCategory('money');
    document.querySelectorAll('[data-lf-type]').forEach(b => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const title = document.getElementById('lf-modal-title');
    if (title) title.textContent = isMoney ? 'แจ้งเงินหาย / เก็บเงินได้' : type === 'found' ? 'แจ้งเก็บของได้' : 'แจ้งของหาย';
  }, true);

  /* ---------- 7. หัวข้อหน้า: บอกว่าอยู่ส่วนไหนของเว็บ ---------- */
  const SECTION_OF = {
    'public-achievements': 'สภานักเรียน LRP',
    'student-news': 'ข่าวสาร', 'student-links': 'ข่าวสาร',
    'student-report': 'แจ้งปัญหา', 'student-track': 'แจ้งปัญหา',
    'student-songs': 'บริการ', 'student-lostfound': 'บริการ',
    'student-chat': 'ติดต่อสภานักเรียน',
    'admin-dashboard': 'ผู้ดูแลระบบ', 'admin-reports': 'ผู้ดูแลระบบ', 'admin-chat': 'ผู้ดูแลระบบ',
    'admin-news': 'จัดการเนื้อหา', 'admin-links': 'จัดการเนื้อหา', 'admin-achievements': 'จัดการเนื้อหา',
    'admin-songs': 'จัดการบริการ', 'admin-lostfound': 'จัดการบริการ',
    'login': 'ยินดีต้อนรับ'
  };
  const title = document.getElementById('page-header-title');
  const prevSwitch = window.switchTab;
  if (typeof prevSwitch === 'function') {
    window.switchTab = function (tabId) {
      if (title) title.dataset.eyebrow = SECTION_OF[tabId] || 'สภานักเรียน LRP';
      return prevSwitch.apply(this, arguments);
    };
  }
  if (title) title.dataset.eyebrow = 'สภานักเรียน LRP';

  /* ---------- 8. เน็ตหลุด / กลับมา ---------- */
  addEventListener('offline', () => toast('ไม่มีการเชื่อมต่ออินเทอร์เน็ต ข้อมูลอาจไม่อัปเดตจนกว่าจะกลับมาออนไลน์', 'error'));
  addEventListener('online', () => {
    toast('กลับมาออนไลน์แล้ว กำลังโหลดข้อมูลล่าสุด', 'success');
    refreshCurrentView();
  });

  /* ---------- 9. กลับมาที่แท็บหลังหายไปนาน: โหลดข้อมูลใหม่แบบเงียบ ๆ ---------- */
  const RENDER_OF = {
    'public-achievements': 'renderPublicAchievements', 'student-news': 'renderStudentNews', 'student-links': 'renderStudentLinks',
    'student-track': 'renderStudentTrack', 'student-songs': 'renderStudentSongs', 'student-lostfound': 'renderStudentLostFound',
    'student-chat': 'renderStudentChat', 'admin-dashboard': 'renderAdminDashboard', 'admin-reports': 'renderAdminReports',
    'admin-news': 'renderAdminNews', 'admin-links': 'renderAdminLinks', 'admin-achievements': 'renderAdminAchievements',
    'admin-songs': 'renderAdminSongs', 'admin-lostfound': 'renderAdminLostFound', 'admin-chat': 'renderAdminChat'
  };

  let refreshing = false;
  async function refreshCurrentView() {
    if (refreshing || typeof window.refreshAllRemoteData !== 'function') return;
    refreshing = true;
    try {
      await window.refreshAllRemoteData();
      const fn = window[RENDER_OF[typeof currentTab !== 'undefined' ? currentTab : '']];
      if (typeof fn === 'function') await fn();
    } catch (err) {
      console.error('Background refresh failed:', err);
    } finally {
      refreshing = false;
    }
  }

  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 60000 && navigator.onLine !== false) refreshCurrentView();
  });

  /* ---------- 10. ข้อผิดพลาดที่ไม่คาดคิด ---------- */
  let lastErrorToast = 0;
  function reportUnexpected(err) {
    const msg = String(err?.message || err || '');
    if (/ResizeObserver loop|Script error\.?$|AbortError/i.test(msg)) return;
    console.error('Unexpected error:', err);
    if (Date.now() - lastErrorToast < 8000) return;
    lastErrorToast = Date.now();
    toast(navigator.onLine === false
      ? 'ไม่มีการเชื่อมต่ออินเทอร์เน็ต กรุณาตรวจสอบแล้วลองอีกครั้ง'
      : 'มีบางอย่างไม่เป็นไปตามที่ควร ลองอีกครั้ง หรือรีเฟรชหน้า', 'error');
  }
  addEventListener('error', e => { if (e.error) reportUnexpected(e.error); });
  addEventListener('unhandledrejection', e => reportUnexpected(e.reason));
})();
