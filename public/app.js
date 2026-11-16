import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

'use strict';

const config = window.STUDY_DESK_CONFIG || {};
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
const assignmentDialog = document.getElementById('assignment-dialog');
const assignmentForm = document.getElementById('assignment-form');
const sessionForm = document.getElementById('session-form');
const toast = document.getElementById('toast');

let supabaseClient = null;
let authMode = 'signup';
let activeProfile = null;
let assignments = [];
let sessions = [];
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
  const [assignmentResult, sessionResult] = await Promise.all([
    supabaseClient.from('assignments').select('*').order('due_date', { ascending: true }),
    supabaseClient.from('study_sessions').select('*').order('session_date', { ascending: true }).order('session_time', { ascending: true })
  ]);
  if (assignmentResult.error) throw assignmentResult.error;
  if (sessionResult.error) throw sessionResult.error;
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
  renderAll();
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(refreshFromServer, 15000);
}

async function refreshFromServer() {
  if (!activeProfile || document.visibilityState === 'hidden') return;
  try {
    const before = JSON.stringify({ assignments, sessions });
    await loadWorkspace();
    const after = JSON.stringify({ assignments, sessions });
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
    const timeLabel = item.time ? new Date(`2000-01-01T${item.time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    return `
      <article class="session-item">
        <div class="session-date"><strong>${date.day}</strong><span>${escapeHTML(date.month)}</span></div>
        <div class="session-info"><strong>${escapeHTML(item.topic)}</strong><span>${escapeHTML(item.subject)} · ${escapeHTML(timeLabel)}</span></div>
        <button class="session-delete" type="button" title="Delete study session" aria-label="Delete ${escapeHTML(item.topic)}" data-delete-session="${escapeHTML(item.id)}">×</button>
      </article>`;
  }).join('');
}

function renderAll() {
  renderStats();
  renderAssignments();
  renderSubjectProgress();
  renderSessions();
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

  if (!item.topic || item.topic.length > 90 || !parseLocalDate(item.date) || !subjects.includes(item.subject) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) {
    showToast('Please complete all study session details.');
    return;
  }

  const saveButton = sessionForm.querySelector('button[type="submit"]');
  saveButton.disabled = true;
  try {
    const { error } = await supabaseClient.from('study_sessions').insert({ id: item.id, user_id: activeProfile.id, topic: item.topic, subject: item.subject, session_date: item.date, session_time: item.time });
    if (error) throw error;
    sessions.push(item);
    renderSessions();
    sessionForm.reset();
    sessionForm.classList.add('hidden');
    document.getElementById('toggle-session-form').innerHTML = '<span class="button-plus">+</span> Add study session';
    showToast('Study session saved to your account.');
  } catch (error) {
    showToast(error.message);
  } finally {
    saveButton.disabled = false;
  }
});

scheduleList.addEventListener('click', async event => {
  const deleteButton = event.target.closest('[data-delete-session]');
  if (!deleteButton) return;
  const sessionId = deleteButton.dataset.deleteSession;
  try {
    const { error } = await supabaseClient.from('study_sessions').delete().eq('id', sessionId);
    if (error) throw error;
    sessions = sessions.filter(item => item.id !== sessionId);
    renderSessions();
    showToast('Study session deleted.');
  } catch (error) {
    showToast(error.message);
  }
});

// Keep the selected navigation item in step with the section being viewed.
const navLinks = [...document.querySelectorAll('.nav-link')];
const sections = ['overview', 'assignments', 'schedule'].map(id => document.getElementById(id));
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => link.classList.toggle('active', link.dataset.nav === entry.target.id));
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
