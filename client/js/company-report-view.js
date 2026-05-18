import { renderLayout } from './layout.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'Rapor Görüntüle' });
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

// ── Read reportId from URL ─────────────────────────────────────────────────────

const params   = new URLSearchParams(window.location.search);
const reportId = parseInt(params.get('reportId'), 10);

const loadingEl = document.getElementById('crvLoading');
const errorEl   = document.getElementById('crvError');
const contentEl = document.getElementById('crvContent');

function showError(msg) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
        errorEl.innerHTML = `
          <div class="content-card glass-card" style="text-align:center;padding:40px 24px;max-width:480px;margin:48px auto;">
            <div style="font-size:48px;margin-bottom:16px;">🔒</div>
            <h2 style="font-size:18px;font-weight:700;margin-bottom:8px;">Erişim Sağlanamadı</h2>
            <p style="color:var(--color-text-muted);font-size:14px;margin:0 0 20px;">${escHtml(msg)}</p>
            <a href="company-reports.html" class="btn-secondary">Rapor Paylaşımı Sayfasına Dön</a>
          </div>`;
        errorEl.style.display = '';
    }
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtNum(val, dec = 4) {
    return parseFloat(val).toLocaleString('tr-TR', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
    });
}

function fmtEur(val) {
    return '€' + parseFloat(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataRow(label, value) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:8px 0;border-bottom:1px solid var(--color-border);">
        <span style="font-size:13px;color:var(--color-text-muted);">${escHtml(label)}</span>
        <span style="font-size:13px;font-weight:600;">${value}</span>
      </div>`;
}

function riskLabel(risk) {
    const map = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' };
    const colors = { low: '#16a34a', medium: '#f59e0b', high: '#dc2626', critical: '#7c3aed' };
    const label = map[risk] || risk;
    const color = colors[risk] || '#374151';
    return `<span style="font-weight:700;color:${color};">${escHtml(label)}</span>`;
}

function changeIndicator(val, unit = '') {
    const n = parseFloat(val);
    if (isNaN(n)) return '—';
    const sign  = n > 0 ? '+' : '';
    const color = n <= 0 ? '#16a34a' : '#dc2626';
    return `<span style="color:${color};font-weight:700;">${sign}${n.toFixed(2)}${unit}</span>`;
}

// ── Render report ──────────────────────────────────────────────────────────────

function renderReport(report) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = '';

    const title = document.getElementById('crvTitle');
    if (title) title.textContent = report.name || `Rapor ${report.report_no}`;

    const subtitle = document.getElementById('crvSubtitle');
    if (subtitle) subtitle.textContent = `${report.owner_name} tarafından paylaşılan simülasyon raporu`;

    const reportNoEl = document.getElementById('crvReportNo');
    if (reportNoEl) reportNoEl.textContent = report.report_no || '—';

    const nameEl = document.getElementById('crvName');
    if (nameEl) nameEl.textContent = report.name || '—';

    const ownerEl = document.getElementById('crvOwner');
    if (ownerEl) ownerEl.textContent = report.owner_name || '—';

    const createdEl = document.getElementById('crvCreatedAt');
    if (createdEl) createdEl.textContent = fmtDate(report.created_at);

    // Inputs
    const inp      = report.inputs  || {};
    const inputsEl = document.getElementById('crvInputs');
    if (inputsEl) {
        inputsEl.innerHTML = [
            dataRow('AB ETS Karbon Fiyatı',        `€${parseFloat(inp.carbon_price ?? 0).toFixed(2)} / tCO₂`),
            dataRow('Ödenen Karbon Fiyatı',         `€${parseFloat(inp.paid_price ?? 0).toFixed(2)} / tCO₂`),
            dataRow('İhracat Hacmi Değişimi',       changeIndicator(inp.export_change_pct, '%')),
            dataRow('Emisyon Yoğunluğu Değişimi',   changeIndicator(inp.emission_factor_change_pct, '%')),
        ].join('');
    }

    // Results
    const res      = report.results || {};
    const resultsEl = document.getElementById('crvResults');
    if (resultsEl) {
        const emChangePct = res.emission_change_pct;
        const emChangeStr = emChangePct !== undefined ? changeIndicator(emChangePct, '%') : '—';

        resultsEl.innerHTML = [
            dataRow('Mevcut Emisyon (Baz)',        res.baseline_emission  != null ? `${fmtNum(res.baseline_emission)} tCO₂`  : '—'),
            dataRow('Tahmini Emisyon',             res.projected_emission != null ? `${fmtNum(res.projected_emission)} tCO₂` : '—'),
            dataRow('Emisyon Değişimi',            emChangeStr),
            dataRow('Net Karbon Fiyatı',           res.net_price          != null ? fmtEur(res.net_price)                   : '—'),
            dataRow('Tahmini CBAM Maliyeti',       res.projected_cost     != null ? fmtEur(res.projected_cost)              : '—'),
            dataRow('Tahmini Risk Seviyesi',       res.projected_risk     != null ? riskLabel(res.projected_risk)           : '—'),
        ].join('');
    }

    document.title = `${report.report_no || 'Rapor'} – emissiON`;
}

// ── Fetch and render ───────────────────────────────────────────────────────────

if (!reportId || isNaN(reportId)) {
    showError('Geçersiz rapor ID. URL parametresi eksik veya hatalı.');
} else {
    const token = localStorage.getItem('emission_token') || sessionStorage.getItem('emission_token');
    fetch(`/api/company/reports/${reportId}/shared`, {
        headers: { Authorization: `Bearer ${token}` },
    })
        .then(res => res.json())
        .then(body => {
            if (!body.success) throw new Error(body.message || 'Rapor yüklenemedi.');
            renderReport(body.data?.report || {});
        })
        .catch(err => showError(err.message));
}
