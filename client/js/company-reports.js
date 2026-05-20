import { renderLayout } from './layout.js';
import { showToast }    from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'Raporlar' });
if (!user) throw new Error('redirect');

if (user.role !== 'company') {
    const pb = document.querySelector('.page-body');
    if (pb) pb.innerHTML = `
        <div class="content-card glass-card" style="text-align:center;padding:48px 24px;max-width:480px;margin:48px auto;">
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
    const res  = await fetch(path, opts);
    const data = await res.json();
    if (!data.success) throw Object.assign(new Error(data.message || 'Hata'), { status: res.status });
    return data;
}

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(status) {
    const map = {
        pending:  { label: 'Bekliyor',   bg: '#f59e0b20', color: '#b45309' },
        approved: { label: 'Onaylandı',  bg: '#16a34a20', color: '#15803d' },
        rejected: { label: 'Reddedildi', bg: '#dc262620', color: '#b91c1c' },
    };
    const s = map[status] || { label: status, bg: '#e5e7eb', color: '#374151' };
    return `<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;
                         background:${s.bg};color:${s.color};">${s.label}</span>`;
}

const REPORT_TYPE_LABELS = {
    full:          'Tam Rapor',
    cbam_only:     'Yalnızca CBAM',
    emission_only: 'Yalnızca Emisyon',
};

// ── DOM refs ───────────────────────────────────────────────────────────────────

const myReportsContainer  = document.getElementById('crMyReportsContainer');
const generateBtn         = document.getElementById('crGenerateBtn');
const generateForm        = document.getElementById('crGenerateForm');
const reportTypeSelect    = document.getElementById('crReportType');
const periodStartInput    = document.getElementById('crPeriodStart');
const periodEndInput      = document.getElementById('crPeriodEnd');
const confirmGenerateBtn  = document.getElementById('crConfirmGenerateBtn');
const cancelGenerateBtn   = document.getElementById('crCancelGenerateBtn');
const generateMsg         = document.getElementById('crGenerateMsg');

const reportNoInput       = document.getElementById('crReportNoInput');
const requestBtn          = document.getElementById('crRequestBtn');
const requestMsg          = document.getElementById('crRequestMsg');
const incomingContainer   = document.getElementById('crIncomingContainer');
const outgoingContainer   = document.getElementById('crOutgoingContainer');
const incomingCountEl     = document.getElementById('crIncomingCountEl');
const outgoingCountEl     = document.getElementById('crOutgoingCountEl');

// ── Message helpers ────────────────────────────────────────────────────────────

function showMsg(el, text, isError) {
    if (!el) return;
    el.textContent      = text;
    el.style.color      = isError ? 'var(--color-danger, #dc2626)' : 'var(--color-success, #16a34a)';
    el.style.display    = '';
    setTimeout(() => { el.style.display = 'none'; }, 6000);
}

// ── Render my reports ──────────────────────────────────────────────────────────

function copyToClipboard(el, text) {
    navigator.clipboard.writeText(text).then(() => {
        const orig = el.textContent;
        el.textContent = 'Kopyalandı!';
        setTimeout(() => { el.textContent = orig; }, 1500);
    }).catch(() => showToast('Hata', 'Kopyalanamadı.', 'error'));
}

function renderMyReports(reports) {
    if (!reports.length) {
        myReportsContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted); opacity: 0.7;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <p>Henüz rapor oluşturmadınız. "Rapor Oluştur" butonunu kullanın.</p>
          </div>`;
        return;
    }

    myReportsContainer.innerHTML = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--color-border);">
              <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--color-text-muted);">Rapor No</th>
              <th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--color-text-muted);">Tür</th>
              <th style="text-align:right;padding:8px 10px;font-weight:600;color:var(--color-text-muted);">Toplam Emisyon</th>
              <th style="text-align:right;padding:8px 10px;font-weight:600;color:var(--color-text-muted);">Oluşturma Tarihi</th>
              <th style="padding:8px 10px;"></th>
            </tr>
          </thead>
          <tbody>
            ${reports.map(r => `
              <tr style="border-bottom:1px solid var(--color-border);">
                <td style="padding:10px 10px;">
                  <code style="background:var(--color-surface-alt,#f3f4f6);padding:2px 7px;border-radius:4px;
                               font-size:12px;cursor:pointer;user-select:all;"
                        class="cr-copy-no" data-no="${escHtml(r.report_no)}"
                        title="Kopyalamak için tıkla">${escHtml(r.report_no)}</code>
                </td>
                <td style="padding:10px 10px;color:var(--color-text-muted);">
                  ${escHtml(REPORT_TYPE_LABELS[r.report_type] || r.report_type)}
                </td>
                <td style="padding:10px 10px;text-align:right;font-weight:600;">
                  ${r.total_tco2 != null ? (parseFloat(r.total_tco2) * 1000).toFixed(2) + ' kg CO₂e' : '—'}
                </td>
                <td style="padding:10px 10px;text-align:right;color:var(--color-text-muted);">
                  ${fmtDate(r.created_at)}
                </td>
                <td style="padding:10px 10px;text-align:right;">
                  <a href="company-report-view.html?reportId=${r.id}"
                     class="btn-secondary" style="font-size:11px;padding:4px 12px;">Görüntüle</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;

    myReportsContainer.querySelectorAll('.cr-copy-no').forEach(el => {
        el.addEventListener('click', () => copyToClipboard(el, el.dataset.no));
    });
}

// ── Render incoming requests ───────────────────────────────────────────────────

function renderIncoming(requests) {
    if (incomingCountEl) incomingCountEl.textContent = `${requests.length} talep`;

    if (!requests.length) {
        incomingContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted); opacity: 0.7;">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
              </svg>
            </div>
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
                  ${r.report_tco2 != null ? `· ${(parseFloat(r.report_tco2) * 1000).toFixed(1)} kg CO₂e` : ''}
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
            ${r.status === 'approved' ? `
              <button class="btn-secondary cr-revoke-in-btn" data-id="${r.id}"
                      style="font-size:12px;padding:5px 14px;color:var(--color-danger,#dc2626);margin-top:4px;">
                Erişimi İptal Et
              </button>` : ''}
          </div>
        `).join('')}
      </div>`;

    incomingContainer.querySelectorAll('.cr-approve-btn').forEach(btn => {
        btn.addEventListener('click', () => respondRequest(parseInt(btn.dataset.id, 10), 'approved'));
    });
    incomingContainer.querySelectorAll('.cr-reject-btn').forEach(btn => {
        btn.addEventListener('click', () => respondRequest(parseInt(btn.dataset.id, 10), 'rejected'));
    });
    incomingContainer.querySelectorAll('.cr-revoke-in-btn').forEach(btn => {
        btn.addEventListener('click', () => revokeRequest(parseInt(btn.dataset.id, 10), 'incoming'));
    });
}

// ── Render outgoing requests ───────────────────────────────────────────────────

function renderOutgoing(requests) {
    if (outgoingCountEl) outgoingCountEl.textContent = `${requests.length} talep`;

    if (!requests.length) {
        outgoingContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted); opacity: 0.7;">
                <path d="M4 14.89V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.11"></path>
                <polyline points="7 9 12 4 17 9"></polyline>
                <line x1="12" y1="4" x2="12" y2="15"></line>
              </svg>
            </div>
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
                <div style="font-size:12px;color:var(--color-text-muted);">Sahibi: ${escHtml(r.owner_name || '—')}</div>
              </div>
              ${statusBadge(r.status)}
            </div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:8px;">
              Talep tarihi: ${fmtDate(r.created_at)}
              ${r.approved_at ? `· Onaylandı: ${fmtDate(r.approved_at)}` : ''}
              ${r.rejected_at ? `· Reddedildi: ${fmtDate(r.rejected_at)}` : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${r.status === 'approved' ? `
                <a href="company-report-view.html?reportId=${r.report_id}"
                   class="btn-primary" style="font-size:12px;padding:5px 14px;display:inline-block;">
                  Görüntüle →
                </a>` : ''}
              ${r.status === 'pending' ? `
                <button class="btn-secondary cr-revoke-out-btn" data-id="${r.id}"
                        style="font-size:12px;padding:5px 14px;color:var(--color-danger,#dc2626);">
                  Geri Al
                </button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>`;

    outgoingContainer.querySelectorAll('.cr-revoke-out-btn').forEach(btn => {
        btn.addEventListener('click', () => revokeRequest(parseInt(btn.dataset.id, 10), 'outgoing'));
    });
}

// ── Load functions ─────────────────────────────────────────────────────────────

async function loadMyReports() {
    try {
        const res     = await apiFetch('GET', '/api/company/reports');
        const reports = res.data?.reports ?? [];
        renderMyReports(reports);
    } catch (err) {
        myReportsContainer.innerHTML = `<div class="hh-empty"><p>Yüklenemedi: ${escHtml(err.message)}</p></div>`;
    }
}

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

// ── Generate report flow ───────────────────────────────────────────────────────

generateBtn?.addEventListener('click', () => {
    generateForm.style.display = generateForm.style.display === 'none' ? '' : 'none';
});

cancelGenerateBtn?.addEventListener('click', () => {
    generateForm.style.display = 'none';
});

confirmGenerateBtn?.addEventListener('click', async () => {
    const report_type  = reportTypeSelect?.value  || 'full';
    const period_start = periodStartInput?.value  || undefined;
    const period_end   = periodEndInput?.value    || undefined;

    confirmGenerateBtn.disabled    = true;
    confirmGenerateBtn.textContent = 'Oluşturuluyor…';

    try {
        const res = await apiFetch('POST', '/api/company/reports', { report_type, period_start, period_end });
        showMsg(generateMsg, `Rapor oluşturuldu: ${res.data?.report?.report_no || ''}`, false);
        generateForm.style.display = 'none';
        await loadMyReports();
    } catch (err) {
        showMsg(generateMsg, err.message || 'Rapor oluşturulamadı.', true);
    } finally {
        confirmGenerateBtn.disabled    = false;
        confirmGenerateBtn.textContent = 'Oluştur';
    }
});

// ── Submit access request ──────────────────────────────────────────────────────

requestBtn?.addEventListener('click', async () => {
    const reportNo = (reportNoInput?.value || '').trim().toUpperCase();
    if (!reportNo) {
        showMsg(requestMsg, 'Rapor numarası boş olamaz.', true);
        reportNoInput?.focus();
        return;
    }

    requestBtn.disabled    = true;
    requestBtn.textContent = 'Gönderiliyor…';

    try {
        await apiFetch('POST', '/api/company/reports/request-access', { report_no: reportNo });
        showMsg(requestMsg, 'Erişim talebi başarıyla gönderildi. Rapor sahibinin onayını bekleyin.', false);
        if (reportNoInput) reportNoInput.value = '';
        await loadOutgoing();
    } catch (err) {
        showMsg(requestMsg, err.message || 'Talep gönderilemedi.', true);
    } finally {
        requestBtn.disabled    = false;
        requestBtn.textContent = 'Erişim Talep Et';
    }
});

// ── Revoke / cancel an access request ─────────────────────────────────────────

async function revokeRequest(requestId, side) {
    try {
        await apiFetch('DELETE', `/api/company/reports/access-requests/${requestId}`);
        showToast('Tamam', side === 'outgoing' ? 'Talep geri alındı.' : 'Erişim iptal edildi.', 'success');
        if (side === 'outgoing') await loadOutgoing();
        else await loadIncoming();
    } catch (err) {
        showToast('Hata', err.message, 'error');
    }
}

// ── Respond to incoming request ────────────────────────────────────────────────

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

await Promise.all([loadMyReports(), loadIncoming(), loadOutgoing()]);
