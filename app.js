/**
 * Student Council Management System - Core Logic Controller
 */

// Local Storage Helper
const DB_KEY = 'LRP_STUDENT_COUNCIL_DB';
// Supabase-backed core data/auth.
// The browser only uses the Supabase publishable key. Never put a service_role/secret key here.
const sb = window.schoolSupabase || null;

function isSupabaseReady() {
  return !!(sb && typeof sb.auth?.signInWithPassword === 'function');
}

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
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) return false;

    const { data: profile, error } = await sb
      .from('profiles')
      .select('id,student_id,name,role,classroom,email')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!profile) {
      await sb.auth.signOut();
      return false;
    }

    currentUser = mapSupabaseProfile(profile);
    currentRole = currentUser.role === 'admin' ? 'admin' : 'student';
    await refreshRemoteReports();
    await refreshRemoteUsers();
    return true;
  } catch (error) {
    console.error('Supabase session restore failed:', error);
    return false;
  }
}

async function signOutSupabase() {
  if (isSupabaseReady()) {
    const { error } = await sb.auth.signOut();
    if (error) console.error('Supabase sign out failed:', error);
  }
  currentUser = null;
  currentRole = 'guest';
}


function getDefaultDB() {
  const fallback = window.DEFAULT_DATA || {
    adminAuth: { username: 'admin', password: '123456' },
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
    adminAuth: { username: 'admin', password: '123456', ...(fallback.adminAuth || {}) },
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

// Navigation & Tab Switching
function switchTab(tabId) {
  currentTab = tabId;
  const sections = document.querySelectorAll('main > section');
  sections.forEach(sec => sec.classList.add('hidden'));

  const targetView = document.getElementById(`view-${tabId}`);
  if (targetView) {
    targetView.classList.remove('hidden');
  }

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

  // Close mobile sidebar
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar && !sidebar.classList.contains('-translate-x-full')) {
    sidebar.classList.add('-translate-x-full');
    if (overlay) overlay.classList.add('hidden');
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
  if (sidebar) sidebar.classList.toggle('-translate-x-full');
  if (overlay) overlay.classList.toggle('hidden');
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
    signOutSupabase().finally(() => {
      updateUIAuth();
      showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
      switchTab('public-achievements');
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

function schoolAuthEmail(identifier) {
  // Internal Auth identifier only. Users NEVER type or see this value.
  // Supabase Auth requires an email-shaped identifier for password auth,
  // so the website keeps the real login UI as Student ID + Password.
  const clean = String(identifier).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `account-${clean}@school-auth.invalid`;
}

function showLoginError(message) {
  const errorBox = document.getElementById('login-error');
  const errorMsg = document.getElementById('login-error-msg');
  if (errorBox) errorBox.classList.remove('hidden');
  if (errorMsg) errorMsg.innerText = message;
}

async function submitLogin(role) {
  const errorBox = document.getElementById('login-error');
  if (errorBox) errorBox.classList.add('hidden');

  if (!isSupabaseReady()) {
    showLoginError('ยังไม่ได้ตั้งค่า Supabase กรุณาใส่ Project URL และ Publishable Key ใน supabase-config.js');
    return;
  }

  if (role === 'student') {
    const studentId = document.getElementById('login-student-id').value.trim();
    const studentPass = document.getElementById('login-student-pass').value;

    if (!studentId || !studentPass) {
      showLoginError('กรุณากรอกรหัสนักเรียนและรหัสผ่าน');
      return;
    }

    const { data, error } = await sb.auth.signInWithPassword({
      email: schoolAuthEmail(studentId),
      password: studentPass
    });

    if (error || !data.user) {
      showLoginError(error?.message?.toLowerCase().includes('rate limit') ? 'ระบบจำกัดการเข้าสู่ระบบชั่วคราว กรุณารอสักครู่แล้วลองใหม่' : 'รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง');
      return;
    }

    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id,student_id,name,role,classroom,email')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.role !== 'student') {
      await sb.auth.signOut();
      showLoginError('ไม่พบบัญชีนักเรียนในระบบ');
      return;
    }

    currentUser = mapSupabaseProfile(profile);
    currentRole = 'student';
    await refreshRemoteReports();
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

    const { data, error } = await sb.auth.signInWithPassword({
      email: schoolAuthEmail(username),
      password: pass
    });

    if (error || !data.user) {
      showLoginError(error?.message?.toLowerCase().includes('rate limit') ? 'ระบบจำกัดการเข้าสู่ระบบชั่วคราว กรุณารอสักครู่แล้วลองใหม่' : 'ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง');
      return;
    }

    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('id,student_id,name,role,classroom,email')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError || !profile || profile.role !== 'admin') {
      await sb.auth.signOut();
      showLoginError('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ');
      return;
    }

    currentUser = mapSupabaseProfile(profile);
    currentRole = 'admin';
    await refreshRemoteReports();
    await refreshRemoteUsers();
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
    await refreshRemoteReports();
    await refreshRemoteUsers();
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
  const studentId = document.getElementById('register-student-id')?.value.trim();
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
    await refreshRemoteReports();
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

    if (headerUserName) headerUserName.innerText = safeUserName;
    if (headerUserClass) headerUserClass.innerText = 'สภานักเรียน';
    if (sidebarUserName) sidebarUserName.innerText = safeUserName;
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
  const reports = Array.isArray(db.reports) ? db.reports : [];

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
            backgroundColor: ['#10b981', '#f43f5e', '#f59e0b'],
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
            backgroundColor: '#3b82f6',
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

  const grid = document.getElementById('pub-achievements-grid');
  if (grid) {
    const achievements = Array.isArray(db.achievements) ? db.achievements : [];
    grid.innerHTML = achievements.map(item => `
      <div class="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-premium border border-slate-100 dark:border-slate-700/50 flex flex-col justify-between">
        <div>
          <div class="h-44 bg-slate-100 dark:bg-slate-900 relative overflow-hidden">
            <img src="${safeString(item?.imgUrl, 'https://images.unsplash.com/photo-1541829070764-84a7d30dd3f3?w=800')}" class="w-full h-full object-cover" alt="achievement">
            <span class="absolute bottom-3 left-3 px-3 py-1 bg-slate-950/80 backdrop-blur-md text-yellow-400 rounded-full text-[10px] font-extrabold font-english border border-yellow-400/30">
              <i class="fa-solid fa-trophy mr-1"></i>${safeString(item?.date, 'ไม่ระบุ')}</span>
          </div>
          <div class="p-6">
            <h4 class="font-extrabold text-base text-slate-900 dark:text-white leading-snug">${safeString(item?.headline, 'หัวข้อผลงาน')}</h4>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">โดย: ${safeString(item?.responsible, 'ไม่ระบุ')}</p>
            <p class="text-xs text-slate-600 dark:text-slate-300 mt-3 leading-relaxed">${safeString(item?.content, 'ไม่มีรายละเอียด')}</p>
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
    <div onclick="openStudentNewsModal('${safeString(item?.id, 'news')}')" class="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-premium border border-slate-100 dark:border-slate-700/50 cursor-pointer hover:-translate-y-1.5 transition-all duration-200">
      <div class="h-48 bg-slate-100 dark:bg-slate-900 relative">
        <img src="${safeString(item?.imgUrl, 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800')}" class="w-full h-full object-cover" alt="news">
      </div>
      <div class="p-6">
        <span class="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider font-english">${safeString(item?.date, 'ไม่ระบุ')}</span>
        <h4 class="font-extrabold text-base text-slate-900 dark:text-white mt-1 line-clamp-2">${safeString(item?.headline, 'ข่าวสาร')}</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-3 leading-relaxed">${safeString(item?.content, 'ไม่มีรายละเอียด')}</p>
      </div>
    </div>
  `).join('');
}

function openStudentNewsModal(id) {
  db = loadDB();
  const item = (Array.isArray(db.news) ? db.news : []).find(n => n?.id === id);
  if (!item) return;

  const img = document.getElementById('news-modal-image');
  if (img) img.src = safeString(item?.imgUrl, 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800');
  safeText('news-modal-date', safeString(item?.date, 'ไม่ระบุ'));
  safeText('news-modal-title', safeString(item?.headline, 'ข่าวสาร'));
  safeText('news-modal-content', safeString(item?.content, 'ไม่มีรายละเอียด'));

  const modal = document.getElementById('student-news-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeStudentNewsModal() {
  document.getElementById('student-news-modal').classList.add('hidden');
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
        <i class="fa-solid fa-folder-open text-blue-500 mr-2.5"></i>${cat}
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${links.filter(l => l.category === cat).map(link => `
          <a href="${link.url}" target="_blank" class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-700/50 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:border-blue-300 dark:hover:border-blue-700 transition flex items-center justify-between group">
            <span class="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400">${link.name}</span>
            <i class="fa-solid fa-arrow-up-right-from-square text-xs text-slate-400 group-hover:text-blue-500 transition"></i>
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// 4. STUDENT REPORT CONTROLLER
let uploadedReportImages = [];

function initStudentReportForm() {
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
      <button type="button" onclick="uploadedReportImages.splice(${idx}, 1); renderReportImagePreviews();" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center opacity-90 hover:opacity-100">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');
}

async function submitProblemReport() {
  if (currentRole !== 'student' || !currentUser?.authId) {
    showToast('กรุณาเข้าสู่ระบบนักเรียนก่อนแจ้งปัญหา', 'error');
    switchTab('login');
    return;
  }

  const name = document.getElementById('report-form-name').value.trim();
  const studentId = document.getElementById('report-form-id').value.trim();
  const classroom = document.getElementById('report-form-class').value.trim();
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
    user_id: currentUser.authId,
    reporter_name: name,
    reporter_id: studentId,
    classroom,
    title,
    category,
    location,
    datetime,
    description,
    photos: Array.isArray(uploadedReportImages) ? uploadedReportImages : [],
    status: 'pending',
    resolution_date: null,
    notes: ''
  };

  const { data, error } = await sb.from('reports').insert(payload).select('*').single();

  if (error) {
    console.error('Report insert failed:', error);
    showToast('บันทึกเรื่องร้องเรียนไม่สำเร็จ: ' + error.message, 'error');
    return;
  }

  db.reports.unshift(mapSupabaseReport(data));
  inMemoryDB = normalizeDB(db);

  showToast('ส่งเรื่องร้องเรียนและบันทึกลงฐานข้อมูลแล้ว', 'success');
  switchTab('student-track');
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
          ${statusBadges[r.status] || ''}
          <span class="text-[11px] text-slate-400 font-medium">${r.datetime.replace('T', ' ')}</span>
        </div>
        <h4 class="font-extrabold text-base text-slate-900 dark:text-white">${r.title}</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">สถานที่: ${r.location} | หมวดหมู่: ${r.category}</p>
      </div>
      <button class="py-2 px-4 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 hover:text-white text-xs font-bold text-slate-700 dark:text-slate-200 transition">
        ดูรายละเอียด
      </button>
    </div>
  `).join('');
}

// Modal Detail Viewer
function openReportDetailModal(id) {
  db = loadDB();
  const r = db.reports.find(item => item.id === id);
  if (!r) return;

  document.getElementById('report-detail-title').innerText = r.title;
  document.getElementById('report-detail-classroom').innerText = r.classroom;
  document.getElementById('report-detail-category').innerText = r.category;
  document.getElementById('report-detail-location').innerText = r.location;
  document.getElementById('report-detail-datetime').innerText = r.datetime.replace('T', ' ');
  document.getElementById('report-detail-desc').innerText = r.description || '-';
  document.getElementById('report-detail-resdate').innerText = r.resolutionDate || '-';
  document.getElementById('report-detail-notes').innerText = r.notes || '- ไม่มีข้อมูลบันทึกเพิ่มเติม -';

  const badge = document.getElementById('report-detail-badge');
  badge.innerText = r.status.toUpperCase();
  badge.className = `px-3 py-1 rounded-full text-[10px] font-extrabold uppercase ${
    r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
    r.status === 'processing' ? 'bg-amber-100 text-amber-700' :
    r.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
  }`;

  // Admin Section Toggle
  const adminSec = document.getElementById('admin-actions-section');
  const saveBtn = document.getElementById('admin-save-report-btn');
  if (currentRole === 'admin') {
    adminSec.classList.remove('hidden');
    saveBtn.classList.remove('hidden');
    document.getElementById('admin-action-status').value = r.status;
    document.getElementById('admin-action-resdate').value = r.resolutionDate || '';
    document.getElementById('admin-action-notes').value = r.notes || '';
    saveBtn.setAttribute('data-id', r.id);
  } else {
    adminSec.classList.add('hidden');
    saveBtn.classList.add('hidden');
  }

  document.getElementById('report-detail-modal').classList.remove('hidden');
}

function closeReportDetailModal() {
  document.getElementById('report-detail-modal').classList.add('hidden');
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
        <td class="py-3 px-2 font-bold">${r.title}</td>
        <td class="py-3 px-2 text-slate-500">${r.category}</td>
        <td class="py-3 px-2">${r.reporterName}</td>
        <td class="py-3 px-2 font-english text-slate-400">${r.datetime.split('T')[0]}</td>
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
      <td class="p-4"><span class="font-bold text-blue-600 font-english">${r.id}</span><br><span class="text-slate-400">${r.reporterName} (${r.classroom})</span></td>
      <td class="p-4 font-semibold text-slate-600 dark:text-slate-300">${r.category}</td>
      <td class="p-4"><span class="font-bold">${r.title}</span><br><span class="text-slate-400">${r.location}</span></td>
      <td class="p-4 font-english text-slate-500">${r.datetime.replace('T', ' ')}</td>
      <td class="p-4 text-center">
        <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">
          ${r.status}
        </span>
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

    if (currentRole === 'student' || currentRole === 'admin') {
      await Promise.all([refreshRemoteReports(), refreshRemoteSongs(), refreshRemoteLostFound()]);
    }
    if (currentRole === 'admin') {
      await refreshRemoteUsers();
    }
    inMemoryDB = db;
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
}

async function refreshRemoteSongs() {
  if (!isSupabaseReady() || !currentUser) return;
  let q = sb.from('songs').select('*').order('created_at', { ascending: false });
  if (currentRole !== 'admin') q = q.eq('user_id', currentUser.authId);
  const { data, error } = await q;
  if (error) throw error;
  db.songs = (data || []).map(mapSong);
}

async function refreshRemoteLostFound() {
  if (!isSupabaseReady() || !currentUser) return;
  const { data, error } = await sb.from('lost_found').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error;
  db.lostFound = (data || []).map(mapLostFound);
}

async function refreshRemoteUsers() {
  if (!isSupabaseReady() || currentRole !== 'admin') return;
  const { data, error } = await sb.from('profiles').select('id,student_id,name,role,classroom,email').order('created_at', { ascending: false });
  if (error) throw error;
  db.users = (data || []).map(mapSupabaseProfile);
}

async function restoreSupabaseSession() {
  if (!isSupabaseReady()) return false;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) return false;
    const { data: profile, error } = await sb.from('profiles')
      .select('id,student_id,name,role,classroom,email').eq('id', session.user.id).maybeSingle();
    if (error || !profile) {
      await sb.auth.signOut();
      return false;
    }
    currentUser = mapSupabaseProfile(profile);
    currentRole = profile.role === 'admin' ? 'admin' : 'student';
    return true;
  } catch (error) {
    console.error('Supabase session restore failed:', error);
    return false;
  }
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
      <div class="flex items-start space-x-4"><div class="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center text-xl shrink-0"><i class="fa-solid fa-music"></i></div>
      <div><h4 class="font-extrabold text-base text-slate-900 dark:text-white">${scEscape(s.title)} - <span class="text-slate-500 font-medium">${scEscape(s.artist)}</span></h4>
      <p class="text-xs text-slate-400 mt-1 font-medium">ผู้ขอ: ${scEscape(s.requesterName)} | วันที่: ${scEscape(s.date)}</p>
      ${s.message ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50">"${scEscape(s.message)}"</p>` : ''}
      ${s.feedback ? `<p class="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-bold">ตอบกลับจากแอดมิน: ${scEscape(s.feedback)}</p>` : ''}</div></div>
      <div>${statusBadges[s.status] || ''}</div></div>`).join('') || '<div class="p-10 text-center text-slate-400">ยังไม่มีคำขอเพลง</div>';
}

/* -------------------- lost & found -------------------- */
async function submitLostFoundReport() {
  if (currentRole !== 'student' || !currentUser?.authId) { showToast('กรุณาเข้าสู่ระบบก่อนแจ้งของหาย/เก็บของได้', 'error'); switchTab('login'); return; }
  const typeValue = document.getElementById('lf-type').value;
  if (!typeValue) { showToast('กรุณาเลือกประเภทข้อมูล', 'error'); return; }
  const payload = {
    id: scId('LF'), user_id: currentUser.authId,
    type: typeValue.includes('lost') ? 'lost' : 'found',
    category: document.getElementById('lf-category').value,
    item_name: document.getElementById('lf-item-name').value.trim(),
    location: document.getElementById('lf-room-location').value.trim(),
    datetime: document.getElementById('lf-datetime').value,
    reporter_name: document.getElementById('lf-reporter-name').value.trim(),
    student_id: document.getElementById('lf-student-id').value.trim(),
    classroom: document.getElementById('lf-classroom').value.trim(),
    description: document.getElementById('lf-description').value.trim(),
    contact: document.getElementById('lf-contact').value.trim(),
    image_url: document.getElementById('lf-image-preview')?.src?.startsWith('http') ? document.getElementById('lf-image-preview').src : '',
    status: 'searching', resolution_date: null, notes: '', pinned: false
  };
  if (!payload.item_name || !payload.location || !payload.datetime || !payload.contact) { showToast('กรุณากรอกข้อมูลให้ครบ', 'error'); return; }
  const { data, error } = await sb.from('lost_found').insert(payload).select('*').single();
  if (error) { showToast('บันทึกของหายไม่สำเร็จ: ' + error.message, 'error'); return; }
  db.lostFound.unshift(mapLostFound(data));
  closeLostFoundModal(); showToast('บันทึกข้อมูลลง Supabase แล้ว', 'success'); renderStudentLostFound();
}

async function renderStudentLostFound() {
  if (currentRole !== 'student') return;
  try { await refreshRemoteLostFound(); } catch (e) { console.error(e); }
  let items = [...(db.lostFound || [])];
  const query = (document.getElementById('lf-search')?.value || '').toLowerCase();
  if (query) items = items.filter(i => `${i.itemName} ${i.description} ${i.reporterName}`.toLowerCase().includes(query));
  if (activeLFCategoryFilter !== 'all') items = items.filter(i => i.category === activeLFCategoryFilter);
  if (activeLFStatusFilter !== 'all') items = items.filter(i => i.status === activeLFStatusFilter);
  const lostList = items.filter(i => i.type === 'lost'); const foundList = items.filter(i => i.type === 'found');
  const lc = document.getElementById('lost-count'); if (lc) lc.innerText = lostList.length;
  const fc = document.getElementById('found-count'); if (fc) fc.innerText = foundList.length;
  const renderCard = i => `<div class="p-5 bg-white dark:bg-slate-800 rounded-3xl shadow-premium border border-slate-100 dark:border-slate-700/50 flex flex-col justify-between ${i.pinned ? 'ring-2 ring-yellow-400' : ''}">
    <div><div class="flex items-center justify-between mb-2"><span class="px-3 py-1 rounded-full ${i.type==='lost'?'bg-rose-100 text-rose-700':'bg-emerald-100 text-emerald-700'} text-[10px] font-extrabold">${i.type==='lost'?'ของหาย':'เก็บได้'}</span><span class="text-[10px] text-slate-400">${scEscape((i.datetime||'').replace('T',' '))}</span></div>
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
    container.innerHTML = messages.map(m => `<div class="flex flex-col ${m.sender==='student'?'items-end':'items-start'}"><div class="max-w-[80%] p-3.5 rounded-2xl text-xs ${m.sender==='student'?'bg-blue-600 text-white rounded-br-none':'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none'} shadow-sm"><p class="leading-relaxed">${scEscape(m.text)}</p>${(m.attachments||[]).map(a=>`<img src="${scEscape(a.dataUrl||a.url||'')}" class="mt-2 max-w-full max-h-48 rounded-xl object-cover">`).join('')}</div><span class="text-[9px] text-slate-400 mt-1">${scEscape(m.time)}</span></div>`).join('') || '<div class="text-center text-slate-400 py-12">เริ่มต้นแชทกับแอดมินได้เลย</div>';
    container.scrollTop = container.scrollHeight;
  } catch (e) { console.error(e); showToast('โหลดแชทไม่สำเร็จ: ' + e.message, 'error'); }
}

async function sendStudentChat() {
  if (currentRole !== 'student' || !currentUser?.authId) { showToast('กรุณาเข้าสู่ระบบ', 'error'); return; }
  const input = document.getElementById('student-chat-input'); const text = input?.value.trim(); if (!text) return;
  try {
    await ensureChatSession();
    const { error } = await sb.from('chat_messages').insert({ session_id: currentUser.authId, sender_id: currentUser.authId, sender_role: 'student', text, attachments: pendingStudentChatAttachments });
    if (error) throw error;
    await sb.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', currentUser.authId);
    input.value = ''; pendingStudentChatAttachments = []; const a=document.getElementById('student-chat-attachments'); if(a)a.innerHTML=''; await renderStudentChat();
  } catch (e) { console.error(e); showToast('ส่งข้อความไม่สำเร็จ: ' + e.message, 'error'); }
}

async function renderAdminChat() {
  if (currentRole !== 'admin') return;
  const list = document.getElementById('admin-chat-session-list'); if (!list) return;
  try {
    const { data, error } = await sb.from('chat_sessions').select('*').order('last_message_at', { ascending: false });
    if (error) throw error;
    const sessions = (data || []).map(mapChatSession);
    list.innerHTML = sessions.map(s => `<button type="button" onclick="selectAdminChatSession('${s.id}')" class="w-full text-left p-3 rounded-2xl border ${currentChatSessionId===s.id?'border-blue-500 bg-blue-50 dark:bg-blue-950/40':'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'} hover:border-blue-400 transition"><div class="font-extrabold text-xs text-slate-800 dark:text-white">${scEscape(s.studentName)}</div><div class="text-[10px] text-slate-400 mt-1">${scEscape(s.studentId)} · ${scEscape(s.classroom)}</div><div class="text-[9px] text-slate-400 mt-1">${scEscape(new Date(s.lastMessageAt).toLocaleString())}</div></button>`).join('') || '<div class="text-xs text-slate-400 p-4">ยังไม่มีห้องแชท</div>';
    if (!currentChatSessionId && sessions[0]) currentChatSessionId = sessions[0].id;
    if (currentChatSessionId) await renderAdminChatMessages(currentChatSessionId);
  } catch (e) { console.error(e); showToast('โหลดห้องแชทไม่สำเร็จ: ' + e.message, 'error'); }
}

async function selectAdminChatSession(sessionId) {
  currentChatSessionId = sessionId;
  await renderAdminChat();
}

async function renderAdminChatMessages(sessionId) {
  const container = document.getElementById('admin-chat-list'); if (!container) return;
  try {
    const { data: session } = await sb.from('chat_sessions').select('*').eq('id', sessionId).maybeSingle();
    const caption = document.getElementById('admin-chat-session-caption');
    if (caption && session) caption.innerText = `${session.student_name} · ${session.student_id} · ${session.classroom || ''}`;
    const messages = await fetchChatMessages(sessionId);
    container.innerHTML = messages.map(m => `<div class="flex flex-col ${m.sender==='admin'?'items-end':'items-start'}"><div class="max-w-[80%] p-3.5 rounded-2xl text-xs ${m.sender==='admin'?'bg-emerald-600 text-white rounded-br-none':'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none'} shadow-sm"><p class="leading-relaxed">${scEscape(m.text)}</p>${(m.attachments||[]).map(a=>`<img src="${scEscape(a.dataUrl||a.url||'')}" class="mt-2 max-w-full max-h-48 rounded-xl object-cover">`).join('')}</div><span class="text-[9px] text-slate-400 mt-1">${scEscape(m.time)}</span></div>`).join('') || '<div class="text-center text-slate-400 py-12">ยังไม่มีข้อความ</div>';
    container.scrollTop = container.scrollHeight;
  } catch (e) { console.error(e); }
}

async function sendAdminChat() {
  if (currentRole !== 'admin' || !currentUser?.authId || !currentChatSessionId) { showToast('เลือกห้องแชทก่อน', 'error'); return; }
  const input = document.getElementById('admin-chat-input'); const text = input?.value.trim(); if (!text) return;
  try {
    const { error } = await sb.from('chat_messages').insert({ session_id: currentChatSessionId, sender_id: currentUser.authId, sender_role: 'admin', text, attachments: pendingAdminChatAttachments });
    if (error) throw error;
    await sb.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', currentChatSessionId);
    input.value = ''; pendingAdminChatAttachments = []; const a=document.getElementById('admin-chat-attachments'); if(a)a.innerHTML=''; await renderAdminChat();
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
  document.getElementById('admin-news-modal')?.classList.remove('hidden');
}
function closeNewsModal(){ document.getElementById('admin-news-modal')?.classList.add('hidden'); }

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

function openLinkModal(id=''){ document.getElementById('form-link-editor')?.reset(); document.getElementById('link-editor-id').value=id||''; const item=(db.links||[]).find(x=>x.id===id); if(item){safeValue('link-editor-category',item.category);safeValue('link-editor-name',item.name);safeValue('link-editor-url',item.url);} document.getElementById('admin-link-modal')?.classList.remove('hidden'); }
function closeLinkModal(){document.getElementById('admin-link-modal')?.classList.add('hidden');}
async function saveLinkItem(){if(!(await requireAdmin()))return;const id=document.getElementById('link-editor-id').value||scId('LINK');const payload={id,category:document.getElementById('link-editor-category').value,name:document.getElementById('link-editor-name').value.trim(),url:document.getElementById('link-editor-url').value.trim()};const result=document.getElementById('link-editor-id').value?await sb.from('links').update(payload).eq('id',id).select('*').single():await sb.from('links').insert(payload).select('*').single();if(result.error){showToast('บันทึกลิงก์ไม่สำเร็จ: '+result.error.message,'error');return;}await refreshAllRemoteData();closeLinkModal();renderAdminLinks();renderStudentLinks();showToast('บันทึกลิงก์แล้ว','success');}
async function deleteLinkItem(id){if(!(await requireAdmin()))return;if(!confirm('ลบลิงก์นี้หรือไม่?'))return;const {error}=await sb.from('links').delete().eq('id',id);if(error){showToast('ลบลิงก์ไม่สำเร็จ: '+error.message,'error');return;}await refreshAllRemoteData();renderAdminLinks();renderStudentLinks();showToast('ลบลิงก์แล้ว','success');}
function renderAdminLinks(){const tbody=document.getElementById('admin-links-table-body');if(!tbody)return;tbody.innerHTML=(db.links||[]).map(l=>`<tr><td class="p-4">${scEscape(l.category)}</td><td class="p-4 font-bold">${scEscape(l.name)}</td><td class="p-4"><a href="${scEscape(l.url)}" target="_blank" rel="noopener" class="text-blue-600 underline break-all">${scEscape(l.url)}</a></td><td class="p-4 text-right"><button onclick="openLinkModal('${l.id}')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg mr-2">แก้ไข</button><button onclick="deleteLinkItem('${l.id}')" class="px-3 py-1.5 bg-rose-600 text-white rounded-lg">ลบ</button></td></tr>`).join('')||'<tr><td colspan="4" class="p-10 text-center text-slate-400">ยังไม่มีลิงก์</td></tr>';}

function openAchievementModal(id=''){document.getElementById('form-achievement-editor')?.reset();document.getElementById('achievement-editor-id').value=id||'';const item=(db.achievements||[]).find(x=>x.id===id);if(item){safeValue('achievement-editor-headline',item.headline);safeValue('achievement-editor-date',item.date);safeValue('achievement-editor-responsible',item.responsible);safeValue('achievement-editor-content',item.content);safeValue('achievement-editor-img-url',item.imgUrl);}else safeValue('achievement-editor-date',new Date().toISOString().slice(0,10));document.getElementById('admin-achievement-modal')?.classList.remove('hidden');}
function closeAchievementModal(){document.getElementById('admin-achievement-modal')?.classList.add('hidden');}
async function saveAchievementItem(){if(!(await requireAdmin()))return;const id=document.getElementById('achievement-editor-id').value||scId('ACH');const payload={id,headline:document.getElementById('achievement-editor-headline').value.trim(),date:document.getElementById('achievement-editor-date').value,responsible:document.getElementById('achievement-editor-responsible').value.trim(),content:document.getElementById('achievement-editor-content').value.trim(),img_url:document.getElementById('achievement-editor-img-url').value.trim()};const result=document.getElementById('achievement-editor-id').value?await sb.from('achievements').update(payload).eq('id',id).select('*').single():await sb.from('achievements').insert(payload).select('*').single();if(result.error){showToast('บันทึกผลงานไม่สำเร็จ: '+result.error.message,'error');return;}await refreshAllRemoteData();closeAchievementModal();renderAdminAchievements();renderPublicAchievements();showToast('บันทึกผลงานแล้ว','success');}
async function deleteAchievementItem(id){if(!(await requireAdmin()))return;if(!confirm('ลบผลงานนี้หรือไม่?'))return;const {error}=await sb.from('achievements').delete().eq('id',id);if(error){showToast('ลบผลงานไม่สำเร็จ: '+error.message,'error');return;}await refreshAllRemoteData();renderAdminAchievements();renderPublicAchievements();showToast('ลบผลงานแล้ว','success');}
function renderAdminAchievements(){const tbody=document.getElementById('admin-achievements-table-body');if(!tbody)return;tbody.innerHTML=(db.achievements||[]).map(a=>`<tr><td class="p-4"><img src="${scEscape(a.imgUrl||'https://placehold.co/120x70')}" class="w-24 h-14 object-cover rounded-xl"></td><td class="p-4 font-bold">${scEscape(a.headline)}</td><td class="p-4">${scEscape(a.responsible)}</td><td class="p-4">${scEscape(a.date)}</td><td class="p-4 text-right"><button onclick="openAchievementModal('${a.id}')" class="px-3 py-1.5 bg-blue-600 text-white rounded-lg mr-2">แก้ไข</button><button onclick="deleteAchievementItem('${a.id}')" class="px-3 py-1.5 bg-rose-600 text-white rounded-lg">ลบ</button></td></tr>`).join('')||'<tr><td colspan="5" class="p-10 text-center text-slate-400">ยังไม่มีผลงาน</td></tr>';}

/* -------------------- admin songs -------------------- */
async function renderAdminSongs(){if(!(await requireAdmin()))return;try{await refreshRemoteSongs();}catch(e){console.error(e);}let songs=[...(db.songs||[])];const status=document.getElementById('admin-song-filter-status')?.value||'all';const q=(document.getElementById('admin-song-search')?.value||'').toLowerCase();if(status!=='all')songs=songs.filter(s=>s.status===status);if(q)songs=songs.filter(s=>`${s.title} ${s.artist} ${s.requesterName}`.toLowerCase().includes(q));const tbody=document.getElementById('admin-songs-table-body');if(!tbody)return;tbody.innerHTML=songs.map(s=>`<tr><td class="p-4"><b>${scEscape(s.title)}</b><br><span class="text-slate-400">${scEscape(s.artist)}</span></td><td class="p-4">${scEscape(s.requesterName)}<br><span class="text-slate-400">${scEscape(s.date)}</span></td><td class="p-4 max-w-xs">${scEscape(s.message||'-')}</td><td class="p-4"><span class="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700">${scEscape(s.status)}</span></td><td class="p-4 text-right"><button onclick="openAdminSongModal('${s.id}')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg">จัดการ</button></td></tr>`).join('')||'<tr><td colspan="5" class="p-10 text-center text-slate-400">ไม่พบคำขอเพลง</td></tr>';}
function openAdminSongModal(id){const s=(db.songs||[]).find(x=>x.id===id);if(!s)return;safeValue('admin-song-id',s.id);safeText('admin-song-lbl-title',s.title);safeText('admin-song-lbl-artist',s.artist);safeValue('admin-song-status',s.status);safeValue('admin-song-feedback',s.feedback||'');document.getElementById('admin-song-modal')?.classList.remove('hidden');}
function closeAdminSongModal(){document.getElementById('admin-song-modal')?.classList.add('hidden');}
async function saveSongStatus(){if(!(await requireAdmin()))return;const id=document.getElementById('admin-song-id').value;const status=document.getElementById('admin-song-status').value;const feedback=document.getElementById('admin-song-feedback').value.trim();const {data,error}=await sb.from('songs').update({status,feedback,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();if(error){showToast('บันทึกคิวเพลงไม่สำเร็จ: '+error.message,'error');return;}const i=db.songs.findIndex(x=>x.id===id);if(i>=0)db.songs[i]=mapSong(data);closeAdminSongModal();renderAdminSongs();showToast('อัปเดตสถานะเพลงแล้ว','success');}
async function clearPlayedSongs(){if(!(await requireAdmin()))return;if(!confirm('ล้างเพลงที่เปิดแล้วทั้งหมดหรือไม่?'))return;const {error}=await sb.from('songs').delete().eq('status','played');if(error){showToast('ล้างเพลงไม่สำเร็จ: '+error.message,'error');return;}await refreshRemoteSongs();renderAdminSongs();showToast('ล้างเพลงที่เปิดแล้วแล้ว','success');}

/* -------------------- admin lost & found -------------------- */
async function renderAdminLostFound(){if(!(await requireAdmin()))return;try{await refreshRemoteLostFound();}catch(e){console.error(e);}let items=[...(db.lostFound||[])];const status=document.getElementById('admin-lf-filter-status')?.value||'all';const type=document.getElementById('admin-lf-filter-type')?.value||'all';const cat=document.getElementById('admin-lf-filter-category')?.value||'all';const q=(document.getElementById('admin-lf-search')?.value||'').toLowerCase();if(status!=='all')items=items.filter(x=>x.status===status);if(type!=='all')items=items.filter(x=>x.type===type);if(cat!=='all')items=items.filter(x=>x.category===cat);if(q)items=items.filter(x=>`${x.itemName} ${x.reporterName} ${x.location}`.toLowerCase().includes(q));const tbody=document.getElementById('admin-lf-table-body');if(!tbody)return;tbody.innerHTML=items.map(i=>`<tr><td class="p-4">${i.imageUrl?`<img src="${scEscape(i.imageUrl)}" class="w-16 h-12 object-cover rounded-lg">`:'-'}</td><td class="p-4">${i.type==='lost'?'ของหาย':'เก็บได้'}</td><td class="p-4">${scEscape(i.category)}</td><td class="p-4 font-bold">${scEscape(i.itemName)}</td><td class="p-4">${scEscape(i.classroom)}<br><span class="text-slate-400">${scEscape(i.location)}</span></td><td class="p-4">${scEscape(i.reporterName)}<br><span class="text-slate-400">${scEscape(i.datetime)}</span></td><td class="p-4">${scEscape(i.status)}</td><td class="p-4">${i.pinned?'📌':'-'}</td><td class="p-4 text-right"><button onclick="openAdminLostFoundModal('${i.id}')" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg">จัดการ</button></td></tr>`).join('')||'<tr><td colspan="9" class="p-10 text-center text-slate-400">ไม่พบรายการ</td></tr>';}
function openAdminLostFoundModal(id){const i=(db.lostFound||[]).find(x=>x.id===id);if(!i)return;safeValue('admin-lf-id',i.id);safeText('admin-lf-lbl-type',i.type==='lost'?'ของหาย':'เก็บได้');safeText('admin-lf-lbl-name',i.itemName);safeText('admin-lf-lbl-location',i.location);safeText('admin-lf-lbl-category',i.category);safeText('admin-lf-lbl-datetime',i.datetime);safeText('admin-lf-lbl-reporter',`${i.reporterName} (${i.studentId})`);safeText('admin-lf-lbl-desc',i.description||'-');safeText('admin-lf-lbl-contact',i.contact);safeValue('admin-lf-status',i.status);safeValue('admin-lf-resdate',i.resolutionDate||'');safeValue('admin-lf-notes',i.notes||'');const pin=document.getElementById('admin-lf-pinned');if(pin)pin.checked=!!i.pinned;const img=document.getElementById('admin-lf-img');const box=document.getElementById('admin-lf-img-container');if(img&&box){if(i.imageUrl){img.src=i.imageUrl;box.classList.remove('hidden');}else{box.classList.add('hidden');}}document.getElementById('admin-lostfound-modal')?.classList.remove('hidden');}
function closeAdminLostFoundModal(){document.getElementById('admin-lostfound-modal')?.classList.add('hidden');}
async function saveAdminLostFoundStatus(){if(!(await requireAdmin()))return;const id=document.getElementById('admin-lf-id').value;const payload={status:document.getElementById('admin-lf-status').value,resolution_date:document.getElementById('admin-lf-resdate').value||null,notes:document.getElementById('admin-lf-notes').value.trim(),pinned:document.getElementById('admin-lf-pinned').checked,updated_at:new Date().toISOString()};const {data,error}=await sb.from('lost_found').update(payload).eq('id',id).select('*').single();if(error){showToast('บันทึกของหายไม่สำเร็จ: '+error.message,'error');return;}const idx=db.lostFound.findIndex(x=>x.id===id);if(idx>=0)db.lostFound[idx]=mapLostFound(data);closeAdminLostFoundModal();renderAdminLostFound();renderStudentLostFound();showToast('อัปเดตของหายแล้ว','success');}

/* -------------------- admin dashboard -------------------- */
async function renderAdminDashboard(){if(!(await requireAdmin()))return;try{await Promise.all([refreshRemoteReports(),refreshRemoteSongs(),refreshRemoteLostFound()]);}catch(e){console.error(e);}const r=db.reports||[];safeText('admin-kpi-reports',r.length);safeText('admin-kpi-completed',r.filter(x=>x.status==='completed').length);safeText('admin-kpi-processing',r.filter(x=>x.status==='processing'||x.status==='pending').length);const tbody=document.getElementById('admin-recent-reports-table');if(tbody)tbody.innerHTML=r.slice(0,5).map(x=>`<tr><td class="p-3">${scEscape(x.title)}</td><td class="p-3">${scEscape(x.reporterName)}</td><td class="p-3">${scEscape(x.status)}</td><td class="p-3 text-right"><button onclick="openReportDetailModal('${x.id}')" class="px-3 py-1 bg-blue-600 text-white rounded-lg">ดู</button></td></tr>`).join('');}

/* -------------------- admin report save/open using remote state -------------------- */
function openReportDetailModal(id){const r=(db.reports||[]).find(item=>item.id===id);if(!r)return;safeText('report-detail-title',r.title);safeText('report-detail-classroom',r.classroom);safeText('report-detail-category',r.category);safeText('report-detail-location',r.location);safeText('report-detail-datetime',(r.datetime||'').replace('T',' '));safeText('report-detail-desc',r.description||'-');safeText('report-detail-resdate',r.resolutionDate||'-');safeText('report-detail-notes',r.notes||'- ไม่มีข้อมูลบันทึกเพิ่มเติม -');const badge=document.getElementById('report-detail-badge');if(badge){badge.innerText=(r.status||'').toUpperCase();}const adminSec=document.getElementById('admin-actions-section');const saveBtn=document.getElementById('admin-save-report-btn');if(currentRole==='admin'){adminSec?.classList.remove('hidden');saveBtn?.classList.remove('hidden');safeValue('admin-action-status',r.status);safeValue('admin-action-resdate',r.resolutionDate||'');safeValue('admin-action-notes',r.notes||'');saveBtn?.setAttribute('data-id',r.id);}else{adminSec?.classList.add('hidden');saveBtn?.classList.add('hidden');}document.getElementById('report-detail-modal')?.classList.remove('hidden');}

/* -------------------- init + realtime -------------------- */
let scRealtimeChannel = null;
async function setupSupabaseRealtime(){
  if(!isSupabaseReady() || scRealtimeChannel) return;
  scRealtimeChannel = sb.channel('school-council-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'news'},()=>{refreshAllRemoteData().then(()=>{renderStudentNews();if(currentRole==='admin')renderAdminNews();});})
    .on('postgres_changes',{event:'*',schema:'public',table:'achievements'},()=>{refreshAllRemoteData().then(()=>{renderPublicAchievements();if(currentRole==='admin')renderAdminAchievements();});})
    .on('postgres_changes',{event:'*',schema:'public',table:'chat_messages'},()=>{if(currentRole==='student')renderStudentChat();if(currentRole==='admin'){renderAdminChat();if(currentChatSessionId)renderAdminChatMessages(currentChatSessionId);}})
    .on('postgres_changes',{event:'*',schema:'public',table:'chat_sessions'},()=>{if(currentRole==='admin')renderAdminChat();})
    .on('postgres_changes',{event:'*',schema:'public',table:'songs'},()=>{if(currentRole==='student')renderStudentSongs();if(currentRole==='admin')renderAdminSongs();})
    .on('postgres_changes',{event:'*',schema:'public',table:'lost_found'},()=>{if(currentRole==='student')renderStudentLostFound();if(currentRole==='admin')renderAdminLostFound();})
    .on('postgres_changes',{event:'*',schema:'public',table:'reports'},()=>{if(currentRole==='student'){refreshRemoteReports().then(()=>renderStudentTrack());}if(currentRole==='admin'){refreshRemoteReports().then(()=>{renderAdminReports();renderAdminDashboard();});}})
    .subscribe();
}

async function initApp(){
  if(appInitialized) return; appInitialized=true; showLoadingOverlay();
  try{
    db=getRemoteDBShell();
    const restored=await restoreSupabaseSession();
    await refreshAllRemoteData();
    updateUIAuth();
    if(restored) switchTab(currentRole==='admin'?'admin-dashboard':'student-news'); else switchTab('public-achievements');
    await setupSupabaseRealtime();
  }catch(e){console.error('App init failed:',e);updateUIAuth();switchTab('public-achievements');showToast('เริ่มระบบไม่สำเร็จ: '+(e.message||e),'error');}
  finally{window.setTimeout(hideLoadingOverlay,400);}
}

/* -------------------- optional chat attachments -------------------- */
let pendingStudentChatAttachments = [];
let pendingAdminChatAttachments = [];

function handleChatFileChange(role) {
  const input = document.getElementById(role === 'student' ? 'student-chat-file-input' : 'admin-chat-file-input');
  const target = document.getElementById(role === 'student' ? 'student-chat-attachments' : 'admin-chat-attachments');
  if (!input || !target) return;
  const files = Array.from(input.files || []).slice(0, 3);
  const pending = [];
  Promise.all(files.map(file => new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return resolve(null);
    if (file.size > 2 * 1024 * 1024) { showToast(`${file.name} ใหญ่เกิน 2MB`, 'error'); return resolve(null); }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  }))).then(items => {
    items.filter(Boolean).forEach(x => pending.push(x));
    if (role === 'student') pendingStudentChatAttachments = pending; else pendingAdminChatAttachments = pending;
    target.innerHTML = pending.map((a, i) => `<div class="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"><img src="${scEscape(a.dataUrl)}" class="w-full h-20 object-cover"><button type="button" onclick="removeChatAttachment('${role}',${i})" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white">×</button></div>`).join('');
  }).catch(console.error);
}
function removeChatAttachment(role, index) {
  const list = role === 'student' ? pendingStudentChatAttachments : pendingAdminChatAttachments;
  list.splice(index, 1);
  const target = document.getElementById(role === 'student' ? 'student-chat-attachments' : 'admin-chat-attachments');
  if (target) target.innerHTML = list.map((a,i) => `<div class="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"><img src="${scEscape(a.dataUrl)}" class="w-full h-20 object-cover"><button type="button" onclick="removeChatAttachment('${role}',${i})" class="absolute top-1 right-1 w-6 h-6 rounded-full bg-rose-600 text-white">×</button></div>`).join('');
}


// Restore the Supabase session automatically when the page is reopened.
// The user stays logged in until they explicitly press Logout or clear site data.
sb.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    try {
      await loadCurrentUser?.();
    } catch (e) {
      console.warn('Session restored, but profile refresh failed:', e);
    }
  }
});
