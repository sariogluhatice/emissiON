import { householdService } from './api/householdService.js';
import { renderLayout }     from './layout.js';
import { showToast, formatDate } from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-household', title: 'Hane Üyeleri' });
if (!user) throw new Error('redirect');

// ── DOM refs ──────────────────────────────────────────────────────────────────
const membersListEl       = document.getElementById('membersList');
const memberCountEl       = document.getElementById('memberCount');
const memberEmissionsCard = document.getElementById('memberEmissionsCard');
const selectedMemberTitle = document.getElementById('selectedMemberTitle');
const emissionsWrapper    = document.getElementById('emissionsTableWrapper');
const closeEmissionsBtn   = document.getElementById('closeEmissionsBtn');

const commentModal        = document.getElementById('commentModal');
const commentModalMeta    = document.getElementById('commentModalMeta');
const existingCommentsEl  = document.getElementById('existingComments');
const commentInput        = document.getElementById('commentInput');
const cancelCommentBtn    = document.getElementById('cancelCommentBtn');
const saveCommentBtn      = document.getElementById('saveCommentBtn');

let activeEmissionId = null;

// ── Category / status helpers ─────────────────────────────────────────────────
const CAT_LABELS = {
  energy: 'Enerji', water: 'Su', gas: 'Doğalgaz', transport: 'Ulaşım',
  food: 'Gıda', shopping: 'Alışveriş', waste: 'Atık', materials: 'Malzeme',
};

// ── Admin guard — redirect non-admins back to household.html ─────────────────
async function guardAdmin() {
  const res = await householdService.getMe();
  const h   = res.data?.household;
  if (!h || h.role !== 'admin') {
    window.location.href = 'household.html';
    throw new Error('not-admin');
  }
}

// ── Load and render members ───────────────────────────────────────────────────
async function loadMembers() {
  try {
    const res     = await householdService.getMembers();
    const members = res.data?.members ?? [];

    if (memberCountEl) memberCountEl.textContent = `${members.length} kişi`;

    if (!members.length) {
      membersListEl.innerHTML = `<div class="hh-empty"><div class="hh-empty-icon">👥</div><p>Henüz üye yok.</p></div>`;
      return;
    }

    membersListEl.innerHTML = members.map(m => `
      <div class="hh-member-row" data-uid="${m.user_id}">
        <div class="hh-member-avatar">${(m.name || m.email || '?').charAt(0).toUpperCase()}</div>
        <div class="hh-member-info">
          <div class="hh-member-name">${m.name || '—'}</div>
          <div class="hh-member-email">${m.email}</div>
        </div>
        <span style="margin:0 8px;" class="hh-role-badge ${m.role}">
          ${m.role === 'admin' ? 'Yönetici' : 'Üye'}
        </span>
        <div class="hh-member-stat">
          <div class="hh-member-emission">${parseFloat(m.total_emissions).toFixed(1)}</div>
          <div class="hh-member-emission-label">kg CO₂e · ${m.record_count} kayıt</div>
        </div>
        <button class="btn-action btn-edit view-emissions-btn" data-uid="${m.user_id}" data-name="${m.name || m.email}" style="margin-left:12px;white-space:nowrap;">
          Emisyonlar →
        </button>
      </div>`).join('');

    membersListEl.querySelectorAll('.view-emissions-btn').forEach(btn => {
      btn.addEventListener('click', () => loadMemberEmissions(btn.dataset.uid, btn.dataset.name));
    });

  } catch (err) {
    membersListEl.innerHTML = `<div class="hh-empty"><p>Üyeler yüklenemedi: ${err.message}</p></div>`;
  }
}

// ── Load emission records for one member ─────────────────────────────────────
async function loadMemberEmissions(memberId, memberName) {
  memberEmissionsCard.style.display = 'block';
  selectedMemberTitle.textContent   = `${memberName} — Emisyon Kayıtları`;
  emissionsWrapper.innerHTML        = `<div class="hh-loading">Yükleniyor…</div>`;
  memberEmissionsCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const res       = await householdService.getMemberEmissions(memberId);
    const emissions = res.data?.emissions ?? [];

    if (!emissions.length) {
      emissionsWrapper.innerHTML = `<div class="hh-empty"><div class="hh-empty-icon">📭</div><p>Bu üyenin emisyon kaydı yok.</p></div>`;
      return;
    }

    emissionsWrapper.innerHTML = `
      <table class="hh-emission-table">
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Kaynak</th>
            <th>Kategori</th>
            <th style="text-align:right">Miktar (kg CO₂e)</th>
            <th style="text-align:center">Yorum</th>
          </tr>
        </thead>
        <tbody>
          ${emissions.map(e => `
            <tr>
              <td>${formatDate(e.date)}</td>
              <td>${e.source || '—'}</td>
              <td>${CAT_LABELS[e.category] || e.category || '—'}</td>
              <td style="text-align:right;font-weight:700;">${parseFloat(e.amount).toFixed(1)}</td>
              <td style="text-align:center;">
                <button class="btn-action btn-edit comment-btn"
                  data-emission-id="${e.id}"
                  data-label="${formatDate(e.date)} · ${e.source || ''} · ${parseFloat(e.amount).toFixed(1)} kg"
                  style="font-size:12px;">
                  💬 Yorum
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    emissionsWrapper.querySelectorAll('.comment-btn').forEach(btn => {
      btn.addEventListener('click', () => openCommentModal(btn.dataset.emissionId, btn.dataset.label));
    });

  } catch (err) {
    emissionsWrapper.innerHTML = `<div class="hh-empty"><p>Kayıtlar yüklenemedi: ${err.message}</p></div>`;
  }
}

// ── Close emissions panel ─────────────────────────────────────────────────────
closeEmissionsBtn?.addEventListener('click', () => {
  memberEmissionsCard.style.display = 'none';
});

// ── Comment modal ─────────────────────────────────────────────────────────────
async function openCommentModal(emissionId, label) {
  activeEmissionId             = emissionId;
  commentModalMeta.textContent = label;
  commentInput.value           = '';
  existingCommentsEl.innerHTML = `<div class="hh-loading" style="padding:8px 0">Yorumlar yükleniyor…</div>`;
  commentModal.style.display   = 'flex';

  try {
    const res      = await householdService.getComments(emissionId);
    const comments = res.data?.comments ?? [];

    if (!comments.length) {
      existingCommentsEl.innerHTML = `<p style="font-size:13px;color:var(--color-text-muted);padding:4px 0 12px;">Henüz yorum yok.</p>`;
      return;
    }

    existingCommentsEl.innerHTML = comments.map(c => `
      <div class="hh-comment-item">
        <div class="hh-comment-meta">${c.admin_name || 'Yönetici'} · ${formatDate(c.created_at)}</div>
        <div class="hh-comment-text">${escapeHtml(c.comment)}</div>
      </div>`).join('');

  } catch {
    existingCommentsEl.innerHTML = `<p style="font-size:13px;color:var(--color-error)">Yorumlar yüklenemedi.</p>`;
  }
}

cancelCommentBtn?.addEventListener('click', () => {
  commentModal.style.display = 'none';
  activeEmissionId           = null;
});

saveCommentBtn?.addEventListener('click', async () => {
  const comment = commentInput.value.trim();
  if (!comment) {
    showToast('Hata', 'Yorum boş olamaz.', 'error');
    return;
  }

  saveCommentBtn.disabled = true;
  try {
    await householdService.addComment(activeEmissionId, comment);
    showToast('Başarılı', 'Yorum kaydedildi.', 'success');
    commentModal.style.display = 'none';
    activeEmissionId           = null;
  } catch (err) {
    showToast('Hata', err.message, 'error');
  } finally {
    saveCommentBtn.disabled = false;
  }
});

// Close modal on backdrop click
commentModal?.addEventListener('click', (e) => {
  if (e.target === commentModal) {
    commentModal.style.display = 'none';
    activeEmissionId = null;
  }
});

// ── XSS guard ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await guardAdmin();
    await loadMembers();
  } catch (err) {
    if (err.message !== 'not-admin') {
      showToast('Hata', err.message, 'error');
    }
  }
})();
