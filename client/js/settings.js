import { profileService } from './api/profileService.js';
import { TokenManager }   from './api/tokenManager.js';
import { getCurrentUser, renderTopbarUser, showToast } from './utils/uiUtils.js';
import { renderLayout } from './layout.js';

const user = renderLayout({ activeNav: 'nav-settings', title: 'Sistem Ayarları' });
if (!user) throw new Error('redirect');
document.getElementById('settingsLogoutBtn')?.addEventListener('click', forceLogout);

// ── Helpers ──────────────────────────────────────────────────────────────────

function setMsg(elId, text, isError = false) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className   = `api-message ${isError ? 'is-error' : 'is-success'}`;
}

function clearMsg(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = '';
  el.className   = 'api-message';
}

function forceLogout() {
  TokenManager.remove();
  localStorage.removeItem('user');
  window.location.replace('login.html');
}

// ── Settings nav highlight on scroll ─────────────────────────────────────────

const sections = document.querySelectorAll('.settings-section');
const navItems = document.querySelectorAll('.settings-nav-item');

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navItems.forEach(a => a.classList.remove('active'));
      const active = document.querySelector(`.settings-nav-item[href="#${entry.target.id}"]`);
      if (active) active.classList.add('active');
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => observer.observe(s));

// Handle anchor in URL (e.g. settings.html#carbon-profile)
if (window.location.hash) {
  const target = document.querySelector(window.location.hash);
  if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), 150);
}

// ── Load profile data ─────────────────────────────────────────────────────────

async function loadData() {
  try {
    const { user: u, settings } = await profileService.getProfile();

    // Name field
    const nameInput = document.getElementById('editName');
    if (nameInput) nameInput.value = u.name ?? '';

    // Current email (read-only display, not an input)
    const emailDisplay = document.getElementById('currentEmailDisplay');
    if (emailDisplay) emailDisplay.textContent = u.email ?? '—';

    // Onboarding status badge
    const obRow = document.getElementById('obStatusRow');
    if (obRow) {
      obRow.innerHTML = u.onboarding_completed
        ? '<span class="profile-ob-badge complete">✓ Carbon profile complete</span>'
        : '<span class="profile-ob-badge incomplete">○ Carbon profile not completed yet</span>';
    }

    // Notification toggles
    if (settings) {
      document.getElementById('emailNotifications').checked = settings.email_notifications !== false;
      document.getElementById('carbonTips').checked         = settings.carbon_tips_notifications !== false;
    }

    renderTopbarUser(u);
  } catch (err) {
    console.error('[settings] load error:', err.message);
  }
}

loadData();

// ── Edit Name form (instant save) ────────────────────────────────────────────

document.getElementById('editNameForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('editNameMsg');

  const name = document.getElementById('editName').value.trim();

  if (!name || name.length < 2) {
    return setMsg('editNameMsg', 'Name must be at least 2 characters.', true);
  }

  const btn = document.getElementById('saveNameBtn');
  btn.disabled = true;

  try {
    const { user: updated } = await profileService.updateProfile({ name });

    // Sync localStorage
    const stored = getCurrentUser();
    if (stored) {
      stored.name = updated.name;
      localStorage.setItem('user', JSON.stringify(stored));
    }
    renderTopbarUser(updated);

    setMsg('editNameMsg', 'Name updated successfully.');
    showToast('Saved', 'Name updated.', 'success');
  } catch (err) {
    setMsg('editNameMsg', err.message || 'Could not update name.', true);
  } finally {
    btn.disabled = false;
  }
});

// ── Email change form (requests verification code) ───────────────────────────

document.getElementById('emailChangeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('emailChangeMsg');

  const newEmail = document.getElementById('newEmail').value.trim();

  if (!newEmail) {
    return setMsg('emailChangeMsg', 'Please enter a new email address.', true);
  }

  const btn = document.getElementById('requestEmailChangeBtn');
  btn.disabled = true;

  try {
    await profileService.requestEmailChange({ newEmail });
    openVerifyModal('email', `A 6-digit code was sent to ${newEmail}. Enter it below to confirm the change.`);
  } catch (err) {
    setMsg('emailChangeMsg', err.message || 'Could not send verification code.', true);
  } finally {
    btn.disabled = false;
  }
});

// ── Change Password form (requests verification code) ────────────────────────

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg('changePasswordMsg');

  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword     = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!currentPassword) {
    return setMsg('changePasswordMsg', 'Please enter your current password.', true);
  }
  if (!newPassword) {
    return setMsg('changePasswordMsg', 'Please enter a new password.', true);
  }
  if (newPassword !== confirmPassword) {
    return setMsg('changePasswordMsg', 'Passwords do not match.', true);
  }

  const btn = document.getElementById('savePasswordBtn');
  btn.disabled = true;

  try {
    await profileService.requestPasswordChange({ currentPassword, newPassword });
    openVerifyModal('password', 'A 6-digit code was sent to your current email. Enter it below to confirm the password change.');
  } catch (err) {
    setMsg('changePasswordMsg', err.message || 'Could not send verification code.', true);
  } finally {
    btn.disabled = false;
  }
});

// ── Verification modal ────────────────────────────────────────────────────────

const verifyModal = document.getElementById('verifyModal');
let activeVerifyFlow = null; // 'email' | 'password'

function openVerifyModal(flow, description) {
  activeVerifyFlow = flow;
  document.getElementById('verifyModalDesc').textContent  = description;
  document.getElementById('verifyCode').value             = '';
  clearMsg('verifyMsg');
  verifyModal.style.display = 'flex';
  setTimeout(() => document.getElementById('verifyCode').focus(), 100);
}

function closeVerifyModal() {
  verifyModal.style.display = 'none';
  activeVerifyFlow = null;
  document.getElementById('verifyCode').value = '';
  clearMsg('verifyMsg');
}

document.getElementById('verifyCancelBtn').addEventListener('click', closeVerifyModal);

verifyModal.addEventListener('click', (e) => {
  if (e.target === verifyModal) closeVerifyModal();
});

document.getElementById('verifyConfirmBtn').addEventListener('click', async () => {
  clearMsg('verifyMsg');

  const code = document.getElementById('verifyCode').value.trim();
  if (!code || code.length !== 6) {
    return setMsg('verifyMsg', 'Please enter the 6-digit code.', true);
  }

  const btn = document.getElementById('verifyConfirmBtn');
  btn.disabled = true;

  try {
    if (activeVerifyFlow === 'email') {
      await profileService.verifyEmailChange({ code });
    } else if (activeVerifyFlow === 'password') {
      await profileService.verifyPasswordChange({ code });
    }

    closeVerifyModal();
    showToast('Success', 'Change confirmed. Please log in again.', 'success');
    setTimeout(forceLogout, 1500);
  } catch (err) {
    setMsg('verifyMsg', err.message || 'Verification failed. Please try again.', true);
    btn.disabled = false;
  }
});

// Allow submitting the verify modal with Enter key
document.getElementById('verifyCode').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('verifyConfirmBtn').click();
  }
});

// ── Notification toggles (auto-save on change) ───────────────────────────────

async function saveNotifications() {
  clearMsg('notifMsg');
  try {
    await profileService.updateSettings({
      email_notifications:       document.getElementById('emailNotifications').checked,
      carbon_tips_notifications: document.getElementById('carbonTips').checked,
    });
    setMsg('notifMsg', 'Preferences saved.');
  } catch (err) {
    setMsg('notifMsg', err.message || 'Could not save preferences.', true);
  }
}

document.getElementById('emailNotifications').addEventListener('change', saveNotifications);
document.getElementById('carbonTips').addEventListener('change', saveNotifications);

// ── Delete Account modal ──────────────────────────────────────────────────────

const deleteModal = document.getElementById('deleteModal');

document.getElementById('deleteAccountBtn').addEventListener('click', () => {
  document.getElementById('deletePassword').value = '';
  clearMsg('deleteMsg');
  deleteModal.style.display = 'flex';
});

document.getElementById('deleteCancelBtn').addEventListener('click', () => {
  deleteModal.style.display = 'none';
});

deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) deleteModal.style.display = 'none';
});

document.getElementById('deleteConfirmBtn').addEventListener('click', async () => {
  clearMsg('deleteMsg');
  const password = document.getElementById('deletePassword').value;

  if (!password) {
    return setMsg('deleteMsg', 'Password required.', true);
  }

  const btn = document.getElementById('deleteConfirmBtn');
  btn.disabled = true;

  try {
    await profileService.deleteAccount({ password });
    TokenManager.remove();
    localStorage.removeItem('user');
    window.location.replace('../index.html');
  } catch (err) {
    setMsg('deleteMsg', err.message || 'Could not delete account.', true);
    btn.disabled = false;
  }
});
