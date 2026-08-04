/**
 * Student Council Management System - Core Logic Controller
 */

// Local Storage Helper
const DB_KEY = 'LRP_STUDENT_COUNCIL_DB';

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
    // Logout
    currentRole = 'guest';
    currentUser = null;
    updateUIAuth();
    showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
    switchTab('public-achievements');
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

  if (role === 'student') {
    if (tabStudent) tabStudent.className = 'flex-1 py-3.5 text-xs font-bold border-b-2 border-school-blue text-school-blue dark:text-school-yellow dark:border-school-yellow transition-all';
    if (tabAdmin) tabAdmin.className = 'flex-1 py-3.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all';
    if (formStudent) formStudent.classList.remove('hidden');
    if (formAdmin) formAdmin.classList.add('hidden');
    if (formRegister) formRegister.classList.add('hidden');
  } else {
    if (tabAdmin) tabAdmin.className = 'flex-1 py-3.5 text-xs font-bold border-b-2 border-slate-800 text-slate-900 dark:text-white dark:border-white transition-all';
    if (tabStudent) tabStudent.className = 'flex-1 py-3.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all';
    if (formAdmin) formAdmin.classList.remove('hidden');
    if (formStudent) formStudent.classList.add('hidden');
    if (formRegister) formRegister.classList.add('hidden');
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

function submitLogin(role) {
  db = loadDB();
  const errorBox = document.getElementById('login-error');
  if (errorBox) errorBox.classList.add('hidden');

  if (role === 'student') {
    const studentId = document.getElementById('login-student-id').value.trim();
    const studentPass = document.getElementById('login-student-pass').value.trim();
    const user = db.users.find(u => u.id === studentId);

    if (!user) {
      if (errorBox) errorBox.classList.remove('hidden');
      const errorMsg = document.getElementById('login-error-msg');
      if (errorMsg) errorMsg.innerText = 'ไม่พบรหัสนักเรียนนี้ในระบบ กรุณาลงทะเบียนก่อน';
      return;
    }

    // Validate password (supports legacy registered users defaulting password to '123' if not set)
    const userPass = user.password || '123';
    if (userPass !== studentPass) {
      if (errorBox) errorBox.classList.remove('hidden');
      const errorMsg = document.getElementById('login-error-msg');
      if (errorMsg) errorMsg.innerText = 'รหัสนักเรียนหรือรหัสผ่านไม่ถูกต้อง';
      return;
    }

    currentUser = user;
    currentRole = 'student';
    updateUIAuth();
    showToast(`ยินดีต้อนรับ ${user.name}`, 'success');
    switchTab('student-news');
  } else if (role === 'admin') {
    const user = document.getElementById('login-admin-user').value.trim();
    const pass = document.getElementById('login-admin-pass').value.trim();

    if (user === db.adminAuth.username && pass === db.adminAuth.password) {
      currentUser = { name: 'ผู้ดูแลระบบ (Admin)', role: 'admin', class: 'สภานักเรียน' };
      currentRole = 'admin';
      updateUIAuth();
      showToast('เข้าสู่ระบบผู้ดูแลเรียบร้อย', 'success');
      switchTab('admin-dashboard');
    } else {
      if (errorBox) errorBox.classList.remove('hidden');
      const errorMsg = document.getElementById('login-error-msg');
      if (errorMsg) errorMsg.innerText = 'ชื่อผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง';
    }
  }
}

function submitRegister() {
  db = loadDB();
  const name = document.getElementById('register-student-name').value.trim();
  const id = document.getElementById('register-student-id').value.trim();
  const sClass = document.getElementById('register-student-class').value.trim();
  const pass = document.getElementById('register-student-pass').value.trim();
  const passConfirm = document.getElementById('register-student-pass-confirm').value.trim();

  if (db.users.some(u => u.id === id)) {
    showToast('รหัสนักเรียนนี้ถูกลงทะเบียนไว้แล้ว', 'error');
    return;
  }

  if (pass !== passConfirm) {
    showToast('รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน', 'error');
    return;
  }

  const newUser = { id, name, password: pass, role: 'student', class: sClass };
  db.users.push(newUser);
  saveDB(db);

  currentUser = newUser;
  currentRole = 'student';
  updateUIAuth();
  showToast('ลงทะเบียนนักเรียนและกำหนดรหัสผ่านสำเร็จ', 'success');
  switchTab('student-news');
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

function submitProblemReport() {
  db = loadDB();
  const name = document.getElementById('report-form-name').value.trim();
  const studentId = document.getElementById('report-form-id').value.trim();
  const classroom = document.getElementById('report-form-class').value.trim();
  const title = document.getElementById('report-title').value.trim();
  const category = document.getElementById('report-category').value;
  const location = document.getElementById('report-location').value.trim();
  const datetime = document.getElementById('report-datetime').value;
  const description = document.getElementById('report-desc').value.trim();

  const newReport = {
    id: `REP-${String((db.reports || []).length + 1).padStart(3, '0')}`,
    reporterName: name,
    reporterId: studentId,
    classroom,
    title,
    category,
    location,
    datetime,
    description,
    photos: uploadedReportImages,
    status: 'pending',
    resolutionDate: '',
    notes: ''
  };

  db.reports.unshift(newReport);
  saveDB(db);

  showToast('ส่งเรื่องร้องเรียนสำเร็จแล้ว', 'success');
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

function saveReportFromAdmin() {
  const saveBtn = document.getElementById('admin-save-report-btn');
  const id = saveBtn.getAttribute('data-id');
  db = loadDB();
  const r = db.reports.find(item => item.id === id);
  if (!r) return;

  r.status = document.getElementById('admin-action-status').value;
  r.resolutionDate = document.getElementById('admin-action-resdate').value;
  r.notes = document.getElementById('admin-action-notes').value.trim();

  saveDB(db);
  showToast('บันทึกการแก้ไขเรียบร้อย', 'success');
  closeReportDetailModal();
  renderAdminReports();
  renderAdminDashboard();
}

// 6. SONG REQUEST CONTROLLER
function submitSongRequest() {
  db = loadDB();
  const title = document.getElementById('song-title').value.trim();
  const artist = document.getElementById('song-artist').value.trim();
  const url = document.getElementById('song-url').value.trim();
  const message = document.getElementById('song-message').value.trim();

  const newSong = {
    id: `SONG-${String((db.songs || []).length + 1).padStart(3, '0')}`,
    title,
    artist,
    url,
    message,
    requesterName: currentUser ? currentUser.name : 'นักเรียนไม่ระบุนาม',
    date: new Date().toISOString().split('T')[0],
    status: 'pending',
    feedback: ''
  };

  db.songs.unshift(newSong);
  saveDB(db);

  document.getElementById('form-request-song').reset();
  showToast('ส่งคำขอเพลงสำเร็จแล้ว', 'success');
  renderStudentSongs();
}

function renderStudentSongs() {
  db = loadDB();
  const songs = db.songs || [];
  document.getElementById('student-songs-count').innerText = songs.length;

  const container = document.getElementById('student-songs-list');
  if (!container) return;

  const statusBadges = {
    pending: '<span class="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 text-xs font-bold">รอคิว</span>',
    approved: '<span class="px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-xs font-bold">เตรียมเปิด</span>',
    played: '<span class="px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 text-xs font-bold">เปิดแล้ว</span>',
    rejected: '<span class="px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 text-xs font-bold">ปฏิเสธ</span>'
  };

  container.innerHTML = songs.map(s => `
    <div class="p-5 bg-white dark:bg-slate-800 rounded-3xl shadow-premium border border-slate-100 dark:border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div class="flex items-start space-x-4">
        <div class="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center text-xl shrink-0 border border-amber-500/30">
          <i class="fa-solid fa-music"></i>
        </div>
        <div>
          <h4 class="font-extrabold text-base text-slate-900 dark:text-white">${s.title} - <span class="text-slate-500 font-medium">${s.artist}</span></h4>
          <p class="text-xs text-slate-400 mt-1 font-medium">ผู้ขอ: ${s.requesterName} | วันที่: ${s.date}</p>
          ${s.message ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/40 font-light">"${s.message}"</p>` : ''}
        </div>
      </div>
      <div>
        ${statusBadges[s.status] || ''}
      </div>
    </div>
  `).join('');
}

// 7. LOST & FOUND CONTROLLER
function openLostFoundModal(type) {
  document.getElementById('form-lostfound-report').reset();
  document.getElementById('lf-type').value = type;
  document.getElementById('lf-money-type-section').classList.add('hidden');

  if (type === 'money') {
    document.getElementById('lf-money-type-section').classList.remove('hidden');
    document.getElementById('lf-type').value = 'money_lost';
  }

  if (currentUser) {
    document.getElementById('lf-reporter-name').value = currentUser.name;
    document.getElementById('lf-student-id').value = currentUser.id;
    document.getElementById('lf-classroom').value = currentUser.class || '';
  }

  const catContainer = document.getElementById('lf-category-options');
  const categories = [
    { id: 'money', label: '💵 เงิน' },
    { id: 'electronics', label: '📱 อิเล็กทรอนิกส์' },
    { id: 'documents', label: '📄 บัตร/เอกสาร' },
    { id: 'keys', label: '🔑 กุญแจ' },
    { id: 'clothing', label: '👕 เสื้อผ้า' },
    { id: 'accessories', label: '💍 เครื่องประดับ' },
    { id: 'belongings', label: '🎒 ของใช้ทั่วไป' },
    { id: 'others', label: '🧰 อื่น ๆ' }
  ];

  catContainer.innerHTML = categories.map(c => `
    <button type="button" onclick="setLFCategory('${c.id}')" id="lf-cat-btn-${c.id}" class="py-2.5 px-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all flex items-center justify-center space-x-1.5 shadow-sm">
      <span>${c.label}</span>
    </button>
  `).join('');

  setLFCategory('others');
  document.getElementById('student-lostfound-modal').classList.remove('hidden');
}

function setLFCategory(cat) {
  document.getElementById('lf-category').value = cat;
  const btns = document.querySelectorAll('#lf-category-options button');
  btns.forEach(btn => {
    if (btn.id === `lf-cat-btn-${cat}`) {
      btn.className = 'py-2.5 px-3.5 rounded-2xl border-2 border-yellow-400 bg-gradient-to-r from-yellow-400 to-amber-400 text-slate-950 text-xs font-extrabold shadow-lg shadow-yellow-400/30 transform scale-[1.03] transition-all';
    } else {
      btn.className = 'py-2.5 px-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all';
    }
  });
}

function closeLostFoundModal() {
  document.getElementById('student-lostfound-modal').classList.add('hidden');
}

function submitLostFoundReport() {
  db = loadDB();
  const type = document.getElementById('lf-type').value;
  const name = document.getElementById('lf-reporter-name').value.trim();
  const studentId = document.getElementById('lf-student-id').value.trim();
  const classroom = document.getElementById('lf-classroom').value.trim();
  const itemName = document.getElementById('lf-item-name').value.trim();
  const location = document.getElementById('lf-room-location').value.trim();
  const datetime = document.getElementById('lf-datetime').value;
  const category = document.getElementById('lf-category').value;
  const description = document.getElementById('lf-description').value.trim();
  const contact = document.getElementById('lf-contact').value.trim();

  const newLF = {
    id: `LF-${String((db.lostFound || []).length + 1).padStart(3, '0')}`,
    type: type.includes('lost') ? 'lost' : 'found',
    category,
    itemName,
    location,
    datetime,
    reporterName: name,
    studentId,
    classroom,
    description,
    contact,
    imageUrl: '',
    status: 'searching',
    pinned: false
  };

  db.lostFound.unshift(newLF);
  saveDB(db);

  closeLostFoundModal();
  showToast('แจ้งข้อมูลเรียบร้อยแล้ว', 'success');
  renderStudentLostFound();
}

function filterLostFound(status) {
  activeLFStatusFilter = status;
  ['all', 'searching', 'returned'].forEach(s => {
    const btn = document.getElementById(`lf-filter-${s}`);
    if (btn) {
      if (s === status) {
        btn.className = 'px-5 py-2.5 text-xs font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400';
      } else {
        btn.className = 'px-5 py-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
      }
    }
  });
  renderStudentLostFound();
}

function filterLostFoundByCategory(cat) {
  activeLFCategoryFilter = cat;
  renderStudentLostFound();
}

function renderStudentLostFound() {
  db = loadDB();
  let items = db.lostFound || [];
  const query = (document.getElementById('lf-search')?.value || '').toLowerCase();

  if (query) {
    items = items.filter(i => i.itemName.toLowerCase().includes(query) || i.description.toLowerCase().includes(query));
  }

  if (activeLFCategoryFilter !== 'all') {
    items = items.filter(i => i.category === activeLFCategoryFilter);
  }

  if (activeLFStatusFilter !== 'all') {
    items = items.filter(i => i.status === activeLFStatusFilter);
  }

  const lostList = items.filter(i => i.type === 'lost');
  const foundList = items.filter(i => i.type === 'found');

  document.getElementById('lost-count').innerText = lostList.length;
  document.getElementById('found-count').innerText = foundList.length;

  const renderCard = (i) => `
    <div class="p-5 bg-white dark:bg-slate-800 rounded-3xl shadow-premium border border-slate-100 dark:border-slate-700/50 flex flex-col justify-between">
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="px-3 py-1 rounded-full ${i.type === 'lost' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'} text-[10px] font-extrabold uppercase">
            ${i.type === 'lost' ? 'ของหาย' : 'เก็บได้'}
          </span>
          <span class="text-[10px] text-slate-400 font-medium">${i.datetime.replace('T', ' ')}</span>
        </div>
        <h4 class="font-extrabold text-base text-slate-900 dark:text-white">${i.itemName}</h4>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">สถานที่: ${i.location}</p>
        <p class="text-xs text-slate-600 dark:text-slate-300 mt-2 font-light">${i.description || 'ไม่มีรายละเอียดเพิ่มเติม'}</p>
      </div>
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between text-xs">
        <span class="text-slate-400 font-medium">ผู้แจ้ง: ${i.reporterName}</span>
        <span class="font-extrabold text-blue-600 dark:text-blue-400">${i.contact}</span>
      </div>
    </div>
  `;

  document.getElementById('lost-items-list').innerHTML = lostList.map(renderCard).join('');
  document.getElementById('found-items-list').innerHTML = foundList.map(renderCard).join('');
}

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

// Global Exports & Init
function showLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.classList.add('flex');
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
  }
}

function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  showLoadingOverlay();
  try {
    db = loadDB();
    updateUIAuth();
    switchTab('public-achievements');
  } catch (e) {
    console.error('App init failed:', e);
  } finally {
    window.setTimeout(() => {
      hideLoadingOverlay();
    }, 650);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

window.addEventListener('load', initApp);
