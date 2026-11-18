import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

'use strict';

const config = window.STUDY_DESK_CONFIG || {};
const STUDY_GUIDES_BUCKET = 'study-guides';
const MAX_GUIDES_PER_SESSION = 20;
const MAX_GUIDE_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_GUIDE_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'txt', 'rtf', 'png', 'jpg', 'jpeg']);

const subjects = [
  'Mathematics', 'English', 'Biology', 'Chemistry', 'Physics',
  'Individuals & Societies', 'Design', 'Arts', 'Language acquisition', 'Other'
];

const authScreen = document.getElementById('auth-screen');
const appShell = document.getElementById('app-shell');
const authForm = document.getElementById('signup-form');
const authError = document.getElementById('auth-error');
const authTitle = document.getElementById('auth-title');
const authDescription = document.getElementById('auth-description');
const authEyebrow = document.getElementById('auth-eyebrow');
const authSubmit = document.getElementById('auth-submit');
const signupTab = document.getElementById('signup-tab');
const loginTab = document.getElementById('login-tab');
const authTabs = document.querySelector('.auth-tabs');
const nameField = document.getElementById('name-field');
const confirmPasswordField = document.getElementById('confirm-password-field');
const nameInput = document.getElementById('profile-name');
const emailInput = document.getElementById('profile-email');
const passwordInput = document.getElementById('profile-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const assignmentList = document.getElementById('assignment-list');
const subjectProgressList = document.getElementById('subject-progress-list');
const scheduleList = document.getElementById('schedule-list');
const sessionGuideInput = document.getElementById('session-guides');
const sessionFileList = document.getElementById('session-file-list');
const weekCalendar = document.getElementById('week-calendar');
const guideLibrary = document.getElementById('guide-library');
const overviewView = document.getElementById('overview-view');
const studyGuidesView = document.getElementById('study-guides-view');
const assignmentDialog = document.getElementById('assignment-dialog');
const assignmentForm = document.getElementById('assignment-form');
const sessionForm = document.getElementById('session-form');
const toast = document.getElementById('toast');

let supabaseClient = null;
let authMode = 'signup';
let activeProfile = null;
let assignments = [];
let sessions = [];
let studyGuides = [];
let currentWeekStart = startOfWeek(new Date());
let currentFilter = 'all';
let toastTimer = null;
let refreshTimer = null;

function createSupabaseClient() {
  const url = String(config.url || '').trim();
  const key = String(config.publishableKey || '').trim();
  if (!url || !key || url.includes('YOUR_PROJECT') || key.includes('YOUR_PUBLISHABLE')) {
    throw new Error('Add your Supabase Project URL and publishable key in public/config.js, then reload this page.');
  }
  return createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

async function loadWorkspace() {
  const [assignmentResult, sessionResult, guideResult] = await Promise.all([
    supabaseClient.from('assignments').select('*').order('due_date', { ascending: true }),
    supabaseClient.from('study_sessions').select('*').order('session_date', { ascending: true }).order('session_time', { ascending: true }),
    supabaseClient.from('study_guides').select('*').order('created_at', { ascending: false })
  ]);
  if (assignmentResult.error) throw assignmentResult.error;
  if (sessionResult.error) throw sessionResult.error;
  if (guideResult.error) throw guideResult.error;
  assignments = (assignmentResult.data || []).map(row => ({
    id: row.id,
    title: row.title,
    subject: row.subject,
    due: row.due_date,
    priority: row.priority,
    completed: Boolean(row.completed)
  }));
  sessions = (sessionResult.data || []).map(row => ({
    id: row.id,
    topic: row.topic,
    subject: row.subject,
    date: row.session_date,
    time: String(row.session_time || '').slice(0, 5)
  }));
  studyGuides = (guideResult.data || []).map(mapStudyGuide);
}

function mapStudyGuide(row) {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    fileName: row.file_name,
    storagePath: row.storage_path,
    fileSize: Number(row.file_size || 0),
    mimeType: row.mime_type || ''
  };
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateOffset(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return localDateValue(date);
}

function parseLocalDate(dateString) {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function daysFromToday(dateString) {
  const date = parseLocalDate(dateString);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function formatDueDate(dateString) {
  const difference = daysFromToday(dateString);
  if (difference === null) return 'No due date';
  if (difference === 0) return 'Due today';
  if (difference === 1) return 'Due tomorrow';
  if (difference === -1) return '1 day overdue';
  if (difference < -1) return `${Math.abs(difference)} days overdue`;
  return `Due ${parseLocalDate(dateString).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function formatSessionDate(dateString) {
  const date = parseLocalDate(dateString);
  if (!date) return { day: '--', month: 'DATE' };
  return { day: date.getDate(), month: date.toLocaleDateString(undefined, { month: 'short' }) };
}

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - mondayOffset);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addCalendarDays(date, amount) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
}

function formatDateForLabel(date) {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatClock(time) {
  if (!time) return '';
  const [hour, minute] = time.split(':').map(Number);
  const value = new Date();
  value.setHours(hour, minute, 0, 0);
  return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileExtension(fileName) {
  return String(fileName).split('.').pop().toLowerCase();
}

function safeStorageFileName(fileName) {
  const extension = fileExtension(fileName);
  const base = String(fileName).replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'study-guide';
  return `${base}.${extension}`;
}

function mimeTypeForFile(file) {
  if (file.type) return file.type;
  const extension = fileExtension(file.name);
  return ({
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    rtf: 'application/rtf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg'
  })[extension] || 'application/octet-stream';
}

function validateGuideFiles(files, existingCount = 0) {
  const selected = Array.from(files || []);
  if (existingCount + selected.length > MAX_GUIDES_PER_SESSION) {
    throw new Error(`A study session can have up to ${MAX_GUIDES_PER_SESSION} files. It already has ${existingCount}.`);
  }
  for (const file of selected) {
    const extension = fileExtension(file.name);
    if (!ALLOWED_GUIDE_EXTENSIONS.has(extension)) {
      throw new Error(`${file.name}: use a PDF, Word, PowerPoint, text or image file.`);
    }
    if (!file.size || file.size > MAX_GUIDE_FILE_SIZE) {
      throw new Error(`${file.name}: each file must be smaller than 20 MB.`);
    }
  }
  return selected;
}

function icsEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function localCalendarStamp(dateString, timeString) {
  const date = parseLocalDate(dateString);
  if (!date) return '';
  const [hours, minutes] = String(timeString || '16:00').split(':').map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`;
}

function calendarEndStamp(dateString, timeString) {
  const date = parseLocalDate(dateString);
  if (!date) return '';
  const [hours, minutes] = String(timeString || '16:00').split(':').map(Number);
  date.setHours(hours || 0, minutes || 0, 0, 0);
  date.setMinutes(date.getMinutes() + 60);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`;
}

function googleCalendarUrl(session) {
  const start = localCalendarStamp(session.date, session.time);
  const end = calendarEndStamp(session.date, session.time);
  const details = `Study session for ${session.subject}. Planned in Study Desk.`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: session.topic,
    dates: `${start}/${end}`,
    details
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function setAuthMode(mode) {
  authMode = mode;
  const signingUp = mode === 'signup';
  signupTab.classList.toggle('active', signingUp);
  loginTab.classList.toggle('active', !signingUp);
  signupTab.setAttribute('aria-selected', String(signingUp));
  loginTab.setAttribute('aria-selected', String(!signingUp));
  nameField.classList.toggle('hidden', !signingUp);
  confirmPasswordField.classList.toggle('hidden', !signingUp);
  nameInput.required = signingUp;
  confirmPasswordInput.required = signingUp;
  passwordInput.autocomplete = signingUp ? 'new-password' : 'current-password';
  authEyebrow.textContent = signingUp ? 'GET STARTED' : 'WELCOME BACK';
  authTitle.textContent = signingUp ? 'Create your account' : 'Sign in to your study space';
  authDescription.textContent = signingUp
    ? 'Use your email and create a password to set up your planner.'
    : 'Enter the email and password linked to your account.';
  authSubmit.textContent = signingUp ? 'Create account' : 'Sign in';
  authError.textContent = '';
  authForm.classList.remove('hidden');
  authTabs.classList.remove('hidden');
}

function showAuth(mode = 'signup') {
  activeProfile = null;
  window.clearInterval(refreshTimer);
  appShell.classList.add('hidden');
  authScreen.classList.remove('hidden');
  authForm.reset();
  setAuthMode(mode);
}

async function showApp(profile) {
  activeProfile = {
    id: profile.id,
    name: String(profile.user_metadata?.full_name || profile.user_metadata?.name || profile.email || 'Student')
  };
  await loadWorkspace();
  currentFilter = 'all';
  document.querySelectorAll('.filter-button').forEach(button => button.classList.toggle('selected', button.dataset.filter === 'all'));
  authScreen.classList.add('hidden');
  appShell.classList.remove('hidden');
  updateProfileDetails();
  updateDateLabel();
  showWorkspaceView('overview');
  renderAll();
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(refreshFromServer, 15000);
}

async function refreshFromServer() {
  if (!activeProfile || document.visibilityState === 'hidden') return;
  try {
    const before = JSON.stringify({ assignments, sessions, studyGuides });
    await loadWorkspace();
    const after = JSON.stringify({ assignments, sessions, studyGuides });
    if (before !== after) renderAll();
  } catch (error) {
    console.warn('Could not refresh Study Desk data:', error.message);
  }
}

function updateProfileDetails() {
  const firstName = activeProfile.name.trim().split(/\s+/)[0] || 'there';
  document.getElementById('welcome-title').textContent = `Hello, ${firstName}.`;
  document.getElementById('sidebar-profile-name').textContent = activeProfile.name;
  document.getElementById('topbar-profile-name').textContent = activeProfile.name;
  document.getElementById('profile-avatar').textContent = firstName.charAt(0).toUpperCase();
}

function updateDateLabel() {
  const now = new Date();
  document.getElementById('today-label').textContent = now.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function populateSubjectSelects() {
  ['assignment-subject', 'session-subject'].forEach(id => {
    const select = document.getElementById(id);
    select.innerHTML = subjects.map(subject => `<option value="${escapeHTML(subject)}">${escapeHTML(subject)}</option>`).join('');
  });
}

function renderStats() {
  const total = assignments.length;
  const completed = assignments.filter(task => task.completed).length;
  const pending = total - completed;
  const dueSoon = assignments.filter(task => {
    const difference = daysFromToday(task.due);
    return !task.completed && difference !== null && difference >= 0 && difference <= 7;
  }).length;
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

  document.getElementById('pending-count').textContent = pending;
  document.getElementById('due-count').textContent = dueSoon;
  document.getElementById('completed-count').textContent = completed;
  document.getElementById('progress-number').textContent = progress;
  document.getElementById('overall-progress-bar').style.width = `${progress}%`;
  document.getElementById('filter-all-count').textContent = total;
  document.getElementById('filter-pending-count').textContent = pending;
  document.getElementById('filter-completed-count').textContent = completed;
}

function renderAssignments() {
  const filtered = assignments
    .filter(task => currentFilter === 'all' || (currentFilter === 'completed' ? task.completed : !task.completed))
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return String(a.due).localeCompare(String(b.due));
    });

  if (filtered.length === 0) {
    const title = currentFilter === 'completed' ? 'No completed assignments yet' : currentFilter === 'pending' ? 'Nothing to do right now' : 'Your list is empty';
    const message = currentFilter === 'completed'
      ? 'When you finish a task, tick it off and it will show up here.'
      : currentFilter === 'pending'
        ? 'You have no unfinished tasks in this list.'
        : 'Add an assignment when you get homework or a project to work on.';
    assignmentList.innerHTML = `<div class="empty-state"><strong>${title}</strong>${message}</div>`;
    return;
  }

  assignmentList.innerHTML = filtered.map(task => {
    const difference = daysFromToday(task.due);
    const overdue = !task.completed && difference !== null && difference < 0;
    const priorityClass = ['normal', 'important', 'high'].includes(String(task.priority).toLowerCase()) ? String(task.priority).toLowerCase() : 'normal';
    return `
      <article class="assignment-item ${task.completed ? 'completed' : ''}">
        <input class="task-check" type="checkbox" aria-label="Mark ${escapeHTML(task.title)} as ${task.completed ? 'not completed' : 'completed'}" data-task-check="${escapeHTML(task.id)}" ${task.completed ? 'checked' : ''}>
        <div class="task-main">
          <span class="task-title">${escapeHTML(task.title)}</span>
          <div class="task-meta">
            <span class="subject-tag">${escapeHTML(task.subject)}</span>
            <span class="task-due ${overdue ? 'overdue' : ''}">${escapeHTML(formatDueDate(task.due))}</span>
          </div>
        </div>
        <div class="task-actions">
          <span class="priority-tag priority-${priorityClass}">${escapeHTML(task.priority)}</span>
          <button class="delete-task" type="button" title="Delete assignment" aria-label="Delete ${escapeHTML(task.title)}" data-delete-task="${escapeHTML(task.id)}">×</button>
        </div>
      </article>`;
  }).join('');
}

function renderSubjectProgress() {
  const counts = subjects.map(subject => {
    const subjectTasks = assignments.filter(task => task.subject === subject);
    const complete = subjectTasks.filter(task => task.completed).length;
    return { subject, total: subjectTasks.length, complete };
  }).filter(item => item.total > 0);

  if (counts.length === 0) {
    subjectProgressList.innerHTML = '<div class="subject-empty">Subject progress will appear here after you add a few assignments.</div>';
    return;
  }

  subjectProgressList.innerHTML = counts.map(item => {
    const percentage = Math.round((item.complete / item.total) * 100);
    return `
      <div class="subject-progress-item">
        <div class="subject-progress-top"><span>${escapeHTML(item.subject)}</span><span>${item.complete}/${item.total} done</span></div>
        <div class="subject-track"><div class="subject-fill" style="width: ${percentage}%"></div></div>
      </div>`;
  }).join('');
}

function renderSessions() {
  const upcoming = sessions
    .filter(item => (daysFromToday(item.date) ?? -1) >= 0)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  if (upcoming.length === 0) {
    scheduleList.innerHTML = '<div class="schedule-empty">You have not planned any study sessions yet.</div>';
    return;
  }

  scheduleList.innerHTML = upcoming.map(item => {
    const date = formatSessionDate(item.date);
    const timeLabel = formatClock(item.time);
    const guideCount = studyGuides.filter(guide => guide.sessionId === item.id).length;
    return `
      <article class="session-item">
        <div class="session-date"><strong>${date.day}</strong><span>${escapeHTML(date.month)}</span></div>
        <div class="session-info"><strong>${escapeHTML(item.topic)}</strong><span>${escapeHTML(item.subject)} · ${escapeHTML(timeLabel)} · ${guideCount} file${guideCount === 1 ? '' : 's'}</span></div>
        <button class="mini-action" type="button" data-open-study-guides="${escapeHTML(item.id)}">Guides</button>
        <button class="session-delete" type="button" title="Delete study session" aria-label="Delete ${escapeHTML(item.topic)}" data-delete-session="${escapeHTML(item.id)}">×</button>
      </article>`;
  }).join('');
}

function renderWeekCalendar() {
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(currentWeekStart, index));
  const first = days[0];
  const last = days[6];
  const rangeLabel = first.getMonth() === last.getMonth()
    ? `${first.toLocaleDateString(undefined, { month: 'long' })} ${first.getDate()}–${last.getDate()}, ${last.getFullYear()}`
    : `${formatDateForLabel(first)} – ${last.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  document.getElementById('calendar-week-label').textContent = rangeLabel;

  weekCalendar.innerHTML = days.map(day => {
    const dateKey = localDateValue(day);
    const daySessions = sessions
      .filter(item => item.date === dateKey)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const todayClass = dateKey === localDateValue(new Date()) ? ' today' : '';
    const eventMarkup = daySessions.length ? daySessions.map(item => {
      const guideCount = studyGuides.filter(guide => guide.sessionId === item.id).length;
      const googleLink = googleCalendarUrl(item);
      return `
        <article class="calendar-event">
          <span class="calendar-event-time">${escapeHTML(formatClock(item.time))}</span>
          <strong>${escapeHTML(item.topic)}</strong>
          <span class="calendar-event-subject">${escapeHTML(item.subject)}</span>
          <div class="calendar-event-meta">${guideCount} / ${MAX_GUIDES_PER_SESSION} guide files</div>
          <div class="calendar-event-actions">
            <button class="mini-action" type="button" data-focus-guides="${escapeHTML(item.id)}">View files</button>
            <button class="mini-action" type="button" data-add-session-files="${escapeHTML(item.id)}" ${guideCount >= MAX_GUIDES_PER_SESSION ? 'disabled' : ''}>Add files</button>
            <a class="mini-action-link" href="${escapeHTML(googleLink)}" target="_blank" rel="noopener noreferrer">Google Calendar</a>
            <button class="calendar-delete" type="button" data-calendar-delete-session="${escapeHTML(item.id)}" aria-label="Delete ${escapeHTML(item.topic)}">×</button>
          </div>
        </article>`;
    }).join('') : '<p class="calendar-day-empty">No study sessions</p>';

    return `
      <section class="calendar-day${todayClass}">
        <div class="calendar-day-heading"><span>${escapeHTML(day.toLocaleDateString(undefined, { weekday: 'short' }))}</span><strong>${day.getDate()}</strong></div>
        <div class="calendar-day-events">${eventMarkup}</div>
      </section>`;
  }).join('');
}

function renderGuideLibrary() {
  document.getElementById('guide-total').textContent = `${studyGuides.length} file${studyGuides.length === 1 ? '' : 's'}`;
  if (!studyGuides.length) {
    guideLibrary.innerHTML = '<div class="guide-empty"><strong>No study guides uploaded yet.</strong><span>Add PDF, Word, PowerPoint, text or image files when you create a study session. Each session can have up to 20 files.</span></div>';
    return;
  }

  const groups = sessions
    .map(session => ({ session, files: studyGuides.filter(guide => guide.sessionId === session.id) }))
    .filter(group => group.files.length > 0)
    .sort((a, b) => `${a.session.date}T${a.session.time}`.localeCompare(`${b.session.date}T${b.session.time}`));

  guideLibrary.innerHTML = groups.map(group => {
    const date = parseLocalDate(group.session.date);
    const dateLabel = date ? date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : group.session.date;
    const filesMarkup = group.files.map(guide => `
      <article class="guide-file-row">
        <div class="guide-file-icon">${escapeHTML(fileExtension(guide.fileName).toUpperCase().slice(0, 4))}</div>
        <div class="guide-file-details"><strong>${escapeHTML(guide.fileName)}</strong><span>${escapeHTML(formatFileSize(guide.fileSize))} · ${escapeHTML(guide.mimeType || 'Study file')}</span></div>
        <button class="mini-action" type="button" data-open-guide="${escapeHTML(guide.id)}">Open</button>
        <button class="guide-remove" type="button" data-remove-guide="${escapeHTML(guide.id)}" aria-label="Remove ${escapeHTML(guide.fileName)}">×</button>
      </article>`).join('');
    return `
      <section class="guide-group" id="guide-group-${escapeHTML(group.session.id)}">
        <div class="guide-group-heading"><div><strong>${escapeHTML(group.session.topic)}</strong><span>${escapeHTML(group.session.subject)} · ${escapeHTML(dateLabel)} · ${escapeHTML(formatClock(group.session.time))}</span></div><span>${group.files.length}/${MAX_GUIDES_PER_SESSION}</span></div>
        <div class="guide-files">${filesMarkup}</div>
      </section>`;
  }).join('');
}

function renderStudyGuidesView() {
  renderWeekCalendar();
  renderGuideLibrary();
}

function showWorkspaceView(view, scrollTarget = null) {
  const showGuides = view === 'study-guides';
  overviewView.classList.toggle('hidden', showGuides);
  studyGuidesView.classList.toggle('hidden', !showGuides);
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.classList.toggle('active', link.dataset.nav === (showGuides ? 'study-guides' : (scrollTarget || 'overview')));
  });
  document.querySelectorAll('[data-mobile-nav]').forEach(button => {
    button.classList.toggle('active', button.dataset.mobileNav === (showGuides ? 'study-guides' : 'overview'));
  });
  if (showGuides) {
    renderStudyGuidesView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (scrollTarget) {
    requestAnimationFrame(() => document.getElementById(scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function renderAll() {
  renderStats();
  renderAssignments();
  renderSubjectProgress();
  renderSessions();
  renderStudyGuidesView();
}

function openAssignmentDialog() {
  document.getElementById('assignment-due').value = dateOffset(1);
  if (typeof assignmentDialog.showModal === 'function') assignmentDialog.showModal();
  else assignmentDialog.setAttribute('open', '');
  document.getElementById('assignment-title').focus();
}

function closeAssignmentDialog() {
  if (typeof assignmentDialog.close === 'function') assignmentDialog.close();
  else assignmentDialog.removeAttribute('open');
  assignmentForm.reset();
}

async function uploadStudyGuideFiles(sessionId, files, existingCount = 0) {
  const selectedFiles = validateGuideFiles(files, existingCount);
  const errors = [];
  let saved = 0;

  for (const file of selectedFiles) {
    const path = `${activeProfile.id}/${sessionId}/${crypto.randomUUID()}-${safeStorageFileName(file.name)}`;
    const mimeType = mimeTypeForFile(file);
    const { error: uploadError } = await supabaseClient.storage
      .from(STUDY_GUIDES_BUCKET)
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: mimeType });

    if (uploadError) {
      errors.push(`${file.name}: ${uploadError.message}`);
      continue;
    }

    const { data, error: recordError } = await supabaseClient
      .from('study_guides')
      .insert({
        user_id: activeProfile.id,
        session_id: sessionId,
        file_name: file.name,
        storage_path: path,
        file_size: file.size,
        mime_type: mimeType
      })
      .select('*')
      .single();

    if (recordError) {
      await supabaseClient.storage.from(STUDY_GUIDES_BUCKET).remove([path]);
      errors.push(`${file.name}: ${recordError.message}`);
      continue;
    }

    studyGuides.unshift(mapStudyGuide(data));
    saved += 1;
  }

  return { saved, errors };
}

async function openStudyGuide(guideId, download = false) {
  const guide = studyGuides.find(item => item.id === guideId);
  if (!guide) return;
  const newWindow = window.open('about:blank', '_blank');
  try {
    const options = download ? { download: guide.fileName } : undefined;
    const { data, error } = await supabaseClient.storage
      .from(STUDY_GUIDES_BUCKET)
      .createSignedUrl(guide.storagePath, 60, options);
    if (error) throw error;
    if (newWindow) newWindow.location.href = data.signedUrl;
    else window.location.href = data.signedUrl;
  } catch (error) {
    if (newWindow) newWindow.close();
    showToast(error.message || 'Could not open this study guide.');
  }
}

async function removeStudyGuide(guideId) {
  const guide = studyGuides.find(item => item.id === guideId);
  if (!guide) return;
  const { error: storageError } = await supabaseClient.storage.from(STUDY_GUIDES_BUCKET).remove([guide.storagePath]);
  if (storageError) throw storageError;
  const { error: rowError } = await supabaseClient.from('study_guides').delete().eq('id', guideId);
  if (rowError) throw rowError;
  studyGuides = studyGuides.filter(item => item.id !== guideId);
  renderAll();
  showToast('Study guide removed.');
}

async function deleteStudySession(sessionId) {
  const guidesToRemove = studyGuides.filter(item => item.sessionId === sessionId);
  if (guidesToRemove.length) {
    const { error: storageError } = await supabaseClient.storage
      .from(STUDY_GUIDES_BUCKET)
      .remove(guidesToRemove.map(item => item.storagePath));
    if (storageError) throw storageError;
  }
  const { error } = await supabaseClient.from('study_sessions').delete().eq('id', sessionId);
  if (error) throw error;
  sessions = sessions.filter(item => item.id !== sessionId);
  studyGuides = studyGuides.filter(item => item.sessionId !== sessionId);
  renderAll();
  showToast('Study session and its attached files were deleted.');
}

function openFilePickerForSession(sessionId) {
  const existingCount = studyGuides.filter(item => item.sessionId === sessionId).length;
  if (existingCount >= MAX_GUIDES_PER_SESSION) {
    showToast(`This session already has ${MAX_GUIDES_PER_SESSION} files.`);
    return;
  }
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.multiple = true;
  picker.accept = '.pdf,.doc,.docx,.ppt,.pptx,.txt,.rtf,.png,.jpg,.jpeg';
  picker.addEventListener('change', async () => {
    if (!picker.files?.length) return;
    try {
      const selected = validateGuideFiles(picker.files, existingCount);
      const result = await uploadStudyGuideFiles(sessionId, selected, existingCount);
      renderAll();
      showToast(result.errors.length
        ? `${result.saved} file(s) uploaded. ${result.errors.length} could not be uploaded.`
        : `${result.saved} study guide file(s) uploaded.`);
    } catch (error) {
      showToast(error.message);
    }
  });
  picker.click();
}

function downloadStudyCalendar() {
  const events = sessions.slice().sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  if (!events.length) {
    showToast('Add a study session before downloading your calendar.');
    return;
  }
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Study Desk//Study Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];
  events.forEach(item => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${item.id}@studydesk`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART:${localCalendarStamp(item.date, item.time)}`,
      `DTEND:${calendarEndStamp(item.date, item.time)}`,
      `SUMMARY:${icsEscape(item.topic)}`,
      `DESCRIPTION:${icsEscape(`Study session for ${item.subject}. Planned in Study Desk.`)}`,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'study-desk-schedule.ics';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast('Calendar file downloaded. Import it into your calendar app.');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120;
}

signupTab.addEventListener('click', () => setAuthMode('signup'));
loginTab.addEventListener('click', () => setAuthMode('login'));

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  authError.textContent = '';
  const email = emailInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  if (!isValidEmail(email)) {
    authError.textContent = 'Enter a valid email address.';
    return;
  }
  if (authMode === 'signup') {
    const name = nameInput.value.trim();
    if (name.length < 2) {
      authError.textContent = 'Please enter your name.';
      return;
    }
    if (password.length < 8) {
      authError.textContent = 'Use a password with at least 8 characters.';
      return;
    }
    if (password !== confirmPasswordInput.value) {
      authError.textContent = 'The passwords do not match.';
      return;
    }
  } else if (!password) {
    authError.textContent = 'Enter your password.';
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = authMode === 'signup' ? 'Creating account…' : 'Signing in…';
  try {
    let result;
    if (authMode === 'signup') {
      result = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: nameInput.value.trim() } }
      });
      if (result.error) throw result.error;
      if (!result.data.session) {
        throw new Error('Email confirmation is still enabled. In Supabase, open Authentication → Sign In / Providers → Email and turn off Confirm email, then try again.');
      }
      await showApp(result.data.user);
      showToast('Your account is ready. Welcome to Study Desk!');
    } else {
      result = await supabaseClient.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      await showApp(result.data.user);
      showToast('Welcome back. Your planner is up to date.');
    }
  } catch (error) {
    authError.textContent = error.message || 'Could not complete that request.';
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === 'signup' ? 'Create account' : 'Sign in';
  }
});

document.getElementById('logout-button').addEventListener('click', async () => {
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
  } catch (error) {
    showToast(error.message || 'Could not sign out. Please try again.');
    return;
  }
  showAuth('login');
});

document.getElementById('open-assignment-modal').addEventListener('click', openAssignmentDialog);
document.getElementById('open-assignment-modal-small').addEventListener('click', openAssignmentDialog);
document.getElementById('close-assignment-modal').addEventListener('click', closeAssignmentDialog);
document.getElementById('cancel-assignment').addEventListener('click', closeAssignmentDialog);

assignmentDialog.addEventListener('click', event => {
  if (event.target === assignmentDialog) closeAssignmentDialog();
});

assignmentForm.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(assignmentForm);
  const task = {
    id: crypto.randomUUID(),
    title: String(formData.get('title')).trim(),
    subject: String(formData.get('subject')),
    due: String(formData.get('due')),
    priority: String(formData.get('priority')),
    completed: false
  };

  if (!task.title || task.title.length > 100 || !parseLocalDate(task.due) || !subjects.includes(task.subject)) {
    showToast('Please complete all assignment details.');
    return;
  }

  const saveButton = assignmentForm.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  try {
    const { error } = await supabaseClient.from('assignments').insert({ id: task.id, user_id: activeProfile.id, title: task.title, subject: task.subject, due_date: task.due, priority: task.priority, completed: false });
    if (error) throw error;
    assignments.push(task);
    renderAll();
    closeAssignmentDialog();
    showToast('Assignment saved to your account.');
  } catch (error) {
    showToast(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

document.querySelectorAll('.filter-button').forEach(button => {
  button.addEventListener('click', () => {
    currentFilter = button.dataset.filter;
    document.querySelectorAll('.filter-button').forEach(item => item.classList.toggle('selected', item === button));
    renderAssignments();
  });
});

assignmentList.addEventListener('change', async event => {
  const taskId = event.target.dataset.taskCheck;
  if (!taskId) return;
  const task = assignments.find(item => item.id === taskId);
  if (!task) return;
  const newValue = event.target.checked;
  try {
    const { error } = await supabaseClient.from('assignments').update({ completed: newValue }).eq('id', taskId);
    if (error) throw error;
    task.completed = newValue;
    renderAll();
    showToast(task.completed ? 'Marked as completed.' : 'Moved back to your to-do list.');
  } catch (error) {
    event.target.checked = !newValue;
    showToast(error.message);
  }
});

assignmentList.addEventListener('click', async event => {
  const deleteButton = event.target.closest('[data-delete-task]');
  if (!deleteButton) return;
  const taskId = deleteButton.dataset.deleteTask;
  try {
    const { error } = await supabaseClient.from('assignments').delete().eq('id', taskId);
    if (error) throw error;
    assignments = assignments.filter(task => task.id !== taskId);
    renderAll();
    showToast('Assignment deleted.');
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById('toggle-session-form').addEventListener('click', () => {
  const isHidden = sessionForm.classList.toggle('hidden');
  document.getElementById('toggle-session-form').innerHTML = isHidden ? '<span class="button-plus">+</span> Add study session' : 'Close form';
  if (!isHidden) {
    document.getElementById('session-date').value = dateOffset(1);
    document.getElementById('session-topic').focus();
  }
});

sessionGuideInput.addEventListener('change', () => {
  try {
    const files = validateGuideFiles(sessionGuideInput.files);
    sessionFileList.textContent = files.length
      ? `${files.length} file(s) selected: ${files.map(file => file.name).join(', ')}`
      : 'No files selected.';
  } catch (error) {
    sessionGuideInput.value = '';
    sessionFileList.textContent = 'No files selected.';
    showToast(error.message);
  }
});

sessionForm.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(sessionForm);
  const item = {
    id: crypto.randomUUID(),
    topic: String(formData.get('topic')).trim(),
    subject: String(formData.get('subject')),
    date: String(formData.get('date')),
    time: String(formData.get('time'))
  };
  let selectedFiles;
  try {
    selectedFiles = validateGuideFiles(sessionGuideInput.files);
  } catch (error) {
    showToast(error.message);
    return;
  }

  if (!item.topic || item.topic.length > 90 || !parseLocalDate(item.date) || !subjects.includes(item.subject) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) {
    showToast('Please complete all study session details.');
    return;
  }

  const saveButton = sessionForm.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  saveButton.textContent = selectedFiles.length ? 'Saving session and files…' : 'Saving session…';
  try {
    const { error } = await supabaseClient.from('study_sessions').insert({
      id: item.id,
      user_id: activeProfile.id,
      topic: item.topic,
      subject: item.subject,
      session_date: item.date,
      session_time: item.time
    });
    if (error) throw error;
    sessions.push(item);

    let uploadResult = { saved: 0, errors: [] };
    if (selectedFiles.length) {
      uploadResult = await uploadStudyGuideFiles(item.id, selectedFiles);
    }

    renderAll();
    sessionForm.reset();
    sessionFileList.textContent = 'No files selected.';
    sessionForm.classList.add('hidden');
    document.getElementById('toggle-session-form').innerHTML = '<span class="button-plus">+</span> Add study session';
    if (uploadResult.errors.length) {
      showToast(`Session saved. ${uploadResult.saved} file(s) uploaded; ${uploadResult.errors.length} failed.`);
    } else {
      showToast(selectedFiles.length
        ? `Study session saved with ${uploadResult.saved} guide file(s).`
        : 'Study session saved to your account.');
    }
  } catch (error) {
    showToast(error.message || 'Could not save the study session.');
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = 'Save session';
  }
});

scheduleList.addEventListener('click', async event => {
  const openGuidesButton = event.target.closest('[data-open-study-guides]');
  if (openGuidesButton) {
    showWorkspaceView('study-guides');
    const target = document.getElementById(`guide-group-${openGuidesButton.dataset.openStudyGuides}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const deleteButton = event.target.closest('[data-delete-session]');
  if (!deleteButton) return;
  try {
    await deleteStudySession(deleteButton.dataset.deleteSession);
  } catch (error) {
    showToast(error.message || 'Could not delete the study session.');
  }
});

weekCalendar.addEventListener('click', async event => {
  const focusButton = event.target.closest('[data-focus-guides]');
  if (focusButton) {
    const group = document.getElementById(`guide-group-${focusButton.dataset.focusGuides}`);
    if (group) group.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else document.getElementById('guide-library-heading').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const addFilesButton = event.target.closest('[data-add-session-files]');
  if (addFilesButton) {
    openFilePickerForSession(addFilesButton.dataset.addSessionFiles);
    return;
  }
  const deleteButton = event.target.closest('[data-calendar-delete-session]');
  if (deleteButton) {
    try {
      await deleteStudySession(deleteButton.dataset.calendarDeleteSession);
    } catch (error) {
      showToast(error.message || 'Could not delete the study session.');
    }
  }
});

guideLibrary.addEventListener('click', async event => {
  const openButton = event.target.closest('[data-open-guide]');
  if (openButton) {
    await openStudyGuide(openButton.dataset.openGuide);
    return;
  }
  const removeButton = event.target.closest('[data-remove-guide]');
  if (removeButton) {
    if (!window.confirm('Remove this study guide file?')) return;
    try {
      await removeStudyGuide(removeButton.dataset.removeGuide);
    } catch (error) {
      showToast(error.message || 'Could not remove the study guide.');
    }
  }
});

document.getElementById('calendar-prev').addEventListener('click', () => {
  currentWeekStart = addCalendarDays(currentWeekStart, -7);
  renderWeekCalendar();
});
document.getElementById('calendar-next').addEventListener('click', () => {
  currentWeekStart = addCalendarDays(currentWeekStart, 7);
  renderWeekCalendar();
});
document.getElementById('calendar-today').addEventListener('click', () => {
  currentWeekStart = startOfWeek(new Date());
  renderWeekCalendar();
});
document.getElementById('export-calendar').addEventListener('click', downloadStudyCalendar);
document.getElementById('open-session-from-guides').addEventListener('click', () => {
  showWorkspaceView('overview', 'schedule');
  if (sessionForm.classList.contains('hidden')) {
    sessionForm.classList.remove('hidden');
    document.getElementById('toggle-session-form').innerHTML = 'Close form';
  }
  document.getElementById('session-date').value = dateOffset(1);
  document.getElementById('session-topic').focus();
});

// Navigation between the main dashboard and the separate study-guides workspace.
const navLinks = [...document.querySelectorAll('.nav-link')];
const sections = ['overview', 'assignments', 'schedule'].map(id => document.getElementById(id));
navLinks.forEach(link => {
  link.addEventListener('click', event => {
    const view = link.dataset.nav;
    if (view === 'study-guides') {
      event.preventDefault();
      showWorkspaceView('study-guides');
    } else {
      event.preventDefault();
      showWorkspaceView('overview', view === 'overview' ? null : view);
    }
  });
});
document.querySelectorAll('[data-mobile-nav]').forEach(button => {
  button.addEventListener('click', () => showWorkspaceView(button.dataset.mobileNav));
});
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    if (studyGuidesView && !studyGuidesView.classList.contains('hidden')) return;
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => link.classList.toggle('active', link.dataset.nav === entry.target.id));
      document.querySelectorAll('[data-mobile-nav]').forEach(button => {
        button.classList.toggle('active', button.dataset.mobileNav === 'overview');
      });
    });
  }, { rootMargin: '-22% 0px -62% 0px' });
  sections.forEach(section => observer.observe(section));
}

async function initialise() {
  populateSubjectSelects();
  showAuth('signup');
  try {
    supabaseClient = createSupabaseClient();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data.session?.user) {
      await showApp(data.session.user);
    }
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        showAuth('login');
      }
    });
  } catch (error) {
    authError.textContent = error.message || 'Study Desk could not connect. Check your Supabase settings.';
  }
}

initialise();
