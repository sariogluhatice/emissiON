import { renderLayout } from './layout.js';
import { showToast }    from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'Rapor Paylaşımı' });
if (!user) throw new Error('redirect');

if (user.role !== 'company') {
    const pb = document.querySelector('.page-body');
    if (pb) pb.innerHTML = `
        <div class="content-card glass-card" style="text-align:center;padding:48px 24px;max-width:480px;margin:48px auto;">
            <div style="font-size:48px;margin-bottom:16px;">🔒</div>
            <h2 style="font-size:20px;font-weight:700;margin-bottom:10px;">Erişim Kısıtlı</h2>
            <p style="color:var(--color-text-muted);font-size:14px;margin:0 0 24px;">
                Bu özellik yalnızca şirket hesapları için kullanılabilir.
            </p>
            <a href="dashboard.html" class="btn-primary">Özet Panele Dön</a>
        </div>`;
    throw new Error('non-company-role');
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getToken() {
    return localStorage.getItem('emission_token') || sessionStorage.getItem('emission_token');
}

async function apiFetch(method, path, body) {
    const opts = {
        method,
        headers: {
            'Authorization': `Bearer ${getToken()}`,
            'Content-Type': 'application/json',
        },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    const data = await res.json();
    if (!data.success) throw Object.assign(new Error(data.message || 'Hata'), { status: res.status });
    return data;
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(status) {
    const map = {
        pending:  { label: 'Bekliyor',  bg: '#f59e0b20', color: '#b45309' },
        approved: { label: 'Onaylandı', bg: '#16a34a20', color: '#15803d' },
        rejected: { label: 'Reddedildi', bg: '#dc262620', color: '#b91c1c' },
    };
    const s = map[status] || { label: status, bg: '#e5e7eb', color: '#374151' };
    return `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;
                         background:${s.bg};color:${s.color};">${s.label}</span>`;
}

// ── DOM refs ───────────────────────────────────────────────────────────────────

const reportNoInput     = document.getElementById('crReportNoInput');
const requestBtn        = document.getElementById('crRequestBtn');
const requestMsg        = document.getElementById('crRequestMsg');
const incomingContainer = document.getElementById('crIncomingContainer');
const outgoingContainer = document.getElementById('crOutgoingContainer');
const incomingCountEl   = document.getElementById('crIncomingCountEl');
const outgoingCountEl   = document.getElementById('crOutgoingCountEl');

// ── Show message under the request form ───────────────────────────────────────

function showRequestMsg(text, isError) {
    if (!requestMsg) return;
    requestMsg.textContent = text;
    requestMsg.style.color  = isError ? 'var(--color-danger, #dc2626)' : 'var(--color-success, #16a34a)';
    requestMsg.style.display = '';
    setTimeout(() => { requestMsg.style.display = 'none'; }, 5000);
}

// ── Render incoming requests ───────────────────────────────────────────────────

function renderIncoming(requests) {
    if (incomingCountEl) incomingCountEl.textContent = `${requests.length} talep`;

    if (!requests.length) {
        incomingContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">📭</div>
            <p>Henüz gelen erişim talebi yok.</p>
          </div>`;
        return;
    }

    incomingContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--spacing-sm);">
        ${requests.map(r => `
          <div style="padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
              <div>
                <div style="font-weight:600;font-size:14px;">${escHtml(r.requester_name || '—')}</div>
                <div style="font-size:12px;color:var(--color-text-muted);">
                  <code style="background:var(--color-surface-alt,#f3f4f6);padding:1px 5px;border-radius:4px;">${escHtml(r.report_no || '—')}</code>
                  ${r.report_name ? `· ${escHtml(r.report_name)}` : ''}
                </div>
              </div>
              ${statusBadge(r.status)}
            </div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:8px;">
              Talep tarihi: ${fmtDate(r.created_at)}
            </div>
            ${r.status === 'pending' ? `
              <div style="display:flex;gap:8px;">
                <button class="btn-primary cr-approve-btn" data-id="${r.id}"
                        style="font-size:12px;padding:5px 14px;">Onayla</button>
                <button class="btn-secondary cr-reject-btn" data-id="${r.id}"
                        style="font-size:12px;padding:5px 14px;">Reddet</button>
              </div>` : ''}
          </div>
        `).join('')}
      </div>`;

    incomingContainer.querySelectorAll('.cr-approve-btn').forEach(btn => {
        btn.addEventListener('click', () => respondRequest(parseInt(btn.dataset.id, 10), 'approved'));
    });
    incomingContainer.querySelectorAll('.cr-reject-btn').forEach(btn => {
        btn.addEventListener('click', () => respondRequest(parseInt(btn.dataset.id, 10), 'rejected'));
    });
}

// ── Render outgoing requests ───────────────────────────────────────────────────

function renderOutgoing(requests) {
    if (outgoingCountEl) outgoingCountEl.textContent = `${requests.length} talep`;

    if (!requests.length) {
        outgoingContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">📤</div>
            <p>Henüz erişim talebi göndermediniz.</p>
          </div>`;
        return;
    }

    outgoingContainer.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:var(--spacing-sm);">
        ${requests.map(r => `
          <div style="padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">
              <div>
                <code style="background:var(--color-surface-alt,#f3f4f6);padding:1px 5px;border-radius:4px;font-size:13px;">${escHtml(r.report_no || '—')}</code>
                ${r.report_name ? `<span style="font-size:12px;color:var(--color-text-muted);margin-left:4px;">${escHtml(r.report_name)}</span>` : ''}
                <div style="font-size:12px;color:var(--color-text-muted);">Sahibi: ${escHtml(r.owner_name || '—')}</div>
              </div>
              ${statusBadge(r.status)}
            </div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:8px;">
              Talep tarihi: ${fmtDate(r.created_at)}
              ${r.approved_at ? `· Onaylandı: ${fmtDate(r.approved_at)}` : ''}
              ${r.rejected_at ? `· Reddedildi: ${fmtDate(r.rejected_at)}` : ''}
            </div>
            ${r.status === 'approved' ? `
              <a href="company-report-view.html?reportId=${r.report_id}"
                 class="btn-primary" style="font-size:12px;padding:5px 14px;display:inline-block;">
                Görüntüle →
              </a>` : ''}
          </div>
        `).join('')}
      </div>`;
}

// ── Escape HTML ────────────────────────────────────────────────────────────────

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── Load data ──────────────────────────────────────────────────────────────────

async function loadIncoming() {
    try {
        const res      = await apiFetch('GET', '/api/company/reports/access-requests/incoming');
        const requests = res.data?.requests ?? [];
        renderIncoming(requests);
    } catch (err) {
        incomingContainer.innerHTML = `<div class="hh-empty"><p>Yüklenemedi: ${escHtml(err.message)}</p></div>`;
    }
}

async function loadOutgoing() {
    try {
        const res      = await apiFetch('GET', '/api/company/reports/access-requests/outgoing');
        const requests = res.data?.requests ?? [];
        renderOutgoing(requests);
    } catch (err) {
        outgoingContainer.innerHTML = `<div class="hh-empty"><p>Yüklenemedi: ${escHtml(err.message)}</p></div>`;
    }
}

// ── Submit access request ──────────────────────────────────────────────────────

requestBtn?.addEventListener('click', async () => {
    const reportNo = (reportNoInput?.value || '').trim().toUpperCase();
    if (!reportNo) {
        showRequestMsg('Rapor numarası boş olamaz.', true);
        reportNoInput?.focus();
        return;
    }

    requestBtn.disabled    = true;
    requestBtn.textContent = 'Gönderiliyor…';

    try {
        await apiFetch('POST', '/api/company/reports/request-access', { report_no: reportNo });
        showRequestMsg('Erişim talebi başarıyla gönderildi. Rapor sahibinin onayını bekleyin.', false);
        if (reportNoInput) reportNoInput.value = '';
        await loadOutgoing();
    } catch (err) {
        showRequestMsg(err.message || 'Talep gönderilemedi.', true);
    } finally {
        requestBtn.disabled    = false;
        requestBtn.textContent = 'Erişim Talep Et';
    }
});

// ── Respond to a request ──────────────────────────────────────────────────────

async function respondRequest(requestId, decision) {
    try {
        await apiFetch('PATCH', `/api/company/reports/access-requests/${requestId}`, { decision });
        showToast(
            decision === 'approved' ? 'Onaylandı' : 'Reddedildi',
            decision === 'approved' ? 'Erişim talebi onaylandı.' : 'Erişim talebi reddedildi.',
            decision === 'approved' ? 'success' : 'error'
        );
        await loadIncoming();
    } catch (err) {
        showToast('Hata', err.message, 'error');
    }
}

// ── Auto-uppercase input ──────────────────────────────────────────────────────

reportNoInput?.addEventListener('input', () => {
    const pos = reportNoInput.selectionStart;
    reportNoInput.value = reportNoInput.value.toUpperCase();
    reportNoInput.setSelectionRange(pos, pos);
});

// ── Init ──────────────────────────────────────────────────────────────────────

await Promise.all([loadIncoming(), loadOutgoing()]);
