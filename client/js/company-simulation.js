import { companyService } from './api/companyService.js';
import { renderLayout }   from './layout.js';
import { showToast }      from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'CBAM Simülasyonu' });
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

// ── DOM refs ──────────────────────────────────────────────────────────────────
const noDataNotice     = document.getElementById('csNoDataNotice');
const simulatorSection = document.getElementById('csSimulatorSection');
const baselineEmEl     = document.getElementById('csBaselineEmission');

const scenarioNameEl   = document.getElementById('csScenarioName');
const carbonPriceEl    = document.getElementById('csCarbonPrice');
const paidPriceEl      = document.getElementById('csPaidPrice');
const exportChangePctEl = document.getElementById('csExportChangePct');
const factorChangePctEl = document.getElementById('csFactorChangePct');
const csRunBtn         = document.getElementById('csRunBtn');

const previewEmission  = document.getElementById('csPreviewEmission');
const previewCost      = document.getElementById('csPreviewCost');
const previewEmChange  = document.getElementById('csPreviewEmChange');
const previewRisk      = document.getElementById('csPreviewRisk');
const previewDetail    = document.getElementById('csPreviewDetail');

const simsContainer    = document.getElementById('csSimsContainer');
const simCountEl       = document.getElementById('csSimCountEl');

// ── State ─────────────────────────────────────────────────────────────────────
let baselineEmission = 0;
let currentPage  = 1;
const PAGE_LIMIT = 20;

// ── Display constants ─────────────────────────────────────────────────────────
const RISK_LABELS = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' };
const RISK_COLORS = { low: '#16a34a', medium: '#f59e0b', high: '#dc2626', critical: '#7c3aed' };
const RISK_THRESHOLDS = { medium: 10000, high: 50000, critical: 200000 };

// ── Helpers ───────────────────────────────────────────────────────────────────
function clientRisk(cost) {
    if (cost < RISK_THRESHOLDS.medium)   return 'low';
    if (cost < RISK_THRESHOLDS.high)     return 'medium';
    if (cost < RISK_THRESHOLDS.critical) return 'high';
    return 'critical';
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

function fmtChange(val, unit = '') {
    const n = parseFloat(val);
    const sign = n > 0 ? '+' : '';
    return sign + n.toFixed(2) + unit;
}

function fmtDate(iso) {
    return new Date(iso).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ── Live preview ──────────────────────────────────────────────────────────────
function updatePreview() {
    const carbonPrice = parseFloat(carbonPriceEl?.value) || 0;
    const paidPrice   = parseFloat(paidPriceEl?.value)   || 0;
    const exportPct   = parseFloat(exportChangePctEl?.value) || 0;
    const factorPct   = parseFloat(factorChangePctEl?.value) || 0;

    if (baselineEmission <= 0) return;

    const exportMult    = 1 + exportPct / 100;
    const factorMult    = 1 + factorPct / 100;
    const projEmission  = baselineEmission * exportMult * factorMult;
    const netPrice      = Math.max(0, carbonPrice - paidPrice);
    const projCost      = projEmission * netPrice;
    const emChange      = projEmission - baselineEmission;
    const emChangePct   = (emChange / baselineEmission) * 100;
    const risk          = clientRisk(projCost);

    if (previewEmission) previewEmission.textContent = fmtNum(projEmission);
    if (previewCost)     previewCost.textContent     = fmtEur(projCost);

    if (previewEmChange) {
        const color = emChange <= 0 ? '#16a34a' : '#dc2626';
        previewEmChange.textContent  = fmtChange(emChange, ' tCO₂');
        previewEmChange.style.color  = color;
    }

    if (previewRisk) {
        previewRisk.textContent = RISK_LABELS[risk];
        previewRisk.style.color = RISK_COLORS[risk];
    }

    if (previewDetail) {
        previewDetail.style.display = 'block';
        previewDetail.innerHTML = `
          <div><strong>Net Karbon Fiyatı:</strong> €${netPrice.toFixed(2)}/tCO₂</div>
          <div><strong>Emisyon Değişimi:</strong> ${fmtChange(emChangePct, '%')}</div>
          <div><strong>Mevcut Toplam Emisyon:</strong> ${fmtNum(baselineEmission)} tCO₂e</div>`;
    }
}

[carbonPriceEl, paidPriceEl, exportChangePctEl, factorChangePctEl].forEach(el => {
    el?.addEventListener('input', updatePreview);
});

// ── Comparison bar chart ──────────────────────────────────────────────────────
function renderComparisonChart(sims) {
    const container = document.getElementById('csComparisonChart');
    if (!container) return;

    if (!sims.length) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    const costs      = sims.map(s => parseFloat(s.results?.projected_cost ?? 0));
    const emissions  = sims.map(s => parseFloat(s.results?.projected_emission ?? 0));
    const maxCost    = Math.max(...costs, 1);
    const maxEmission = Math.max(...emissions, 1);
    const names      = sims.map((s, i) => s.name || `Senaryo #${s.id}`);

    const costBars = sims.map((s, i) => {
        const cost    = costs[i];
        const risk    = s.results?.projected_risk || 'low';
        const color   = RISK_COLORS[risk] || '#9ca3af';
        const pct     = (cost / maxCost * 100).toFixed(1);
        const nameShort = names[i].length > 20 ? names[i].slice(0, 18) + '…' : names[i];
        return `
          <div class="cs-bar-row">
            <span class="cs-bar-label" title="${names[i]}">${nameShort}</span>
            <div class="cs-bar-track">
              <div class="cs-bar-fill" style="width:${pct}%;background:${color};"></div>
            </div>
            <span class="cs-bar-value">${fmtEur(cost)}</span>
          </div>`;
    }).join('');

    const emBars = sims.map((s, i) => {
        const em      = emissions[i];
        const pct     = (em / maxEmission * 100).toFixed(1);
        const change  = s.results?.emission_change_pct ?? 0;
        const color   = change <= 0 ? '#16a34a' : '#dc2626';
        const nameShort = names[i].length > 20 ? names[i].slice(0, 18) + '…' : names[i];
        return `
          <div class="cs-bar-row">
            <span class="cs-bar-label" title="${names[i]}">${nameShort}</span>
            <div class="cs-bar-track">
              <div class="cs-bar-fill" style="width:${pct}%;background:${color};"></div>
            </div>
            <span class="cs-bar-value">${fmtNum(em, 2)} tCO₂</span>
          </div>`;
    }).join('');

    container.innerHTML = `
      <div class="cs-comparison-grid">
        <div>
          <div class="cs-chart-title">Tahmini CBAM Maliyeti</div>
          ${costBars}
        </div>
        <div>
          <div class="cs-chart-title">Tahmini Emisyon</div>
          ${emBars}
        </div>
      </div>`;
}

// ── Render saved simulations ──────────────────────────────────────────────────
function renderSimulations(sims, total, page, limit) {
    if (simCountEl) simCountEl.textContent = `${total} senaryo`;

    renderComparisonChart(sims);

    if (!sims.length) {
        simsContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">🔬</div>
            <p>Henüz kayıtlı senaryo yok. Formu kullanarak ilk simülasyonu çalıştırın.</p>
          </div>`;
        return;
    }

    const totalPages = Math.ceil(total / limit);
    const paginationHtml = totalPages > 1 ? `
      <div class="ce-pagination">
        <button class="btn-secondary cs-prev-btn" ${page <= 1 ? 'disabled' : ''}>← Önceki</button>
        <span class="ce-page-info">${page} / ${totalPages} sayfa</span>
        <button class="btn-secondary cs-next-btn" ${page >= totalPages ? 'disabled' : ''}>Sonraki →</button>
      </div>` : '';

    simsContainer.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="hh-tasks-table">
          <thead>
            <tr>
              <th style="min-width:160px;">Senaryo</th>
              <th style="text-align:right;">Karbon Fiyatı</th>
              <th style="text-align:right;">Hacim Δ</th>
              <th style="text-align:right;">Faktör Δ</th>
              <th style="text-align:right;">Tahmini Emisyon</th>
              <th style="text-align:right;">Tahmini Maliyet</th>
              <th>Risk</th>
              <th>Tarih</th>
            </tr>
          </thead>
          <tbody>
            ${sims.map(simRow).join('')}
          </tbody>
        </table>
      </div>
      ${paginationHtml}`;

    simsContainer.querySelector('.cs-prev-btn')?.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; loadSimulations(); }
    });

    simsContainer.querySelector('.cs-next-btn')?.addEventListener('click', () => {
        if (currentPage < totalPages) { currentPage++; loadSimulations(); }
    });
}

function simRow(s) {
    const inp = s.inputs  || {};
    const res = s.results || {};
    const risk  = res.projected_risk || 'low';
    const color = RISK_COLORS[risk]  || '#9ca3af';
    const label = RISK_LABELS[risk]  || risk;
    const name  = s.name || `Senaryo #${s.id}`;

    const exportStr = inp.export_change_pct !== undefined
        ? fmtChange(inp.export_change_pct, '%')
        : '—';
    const factorStr = inp.emission_factor_change_pct !== undefined
        ? fmtChange(inp.emission_factor_change_pct, '%')
        : '—';

    return `
      <tr>
        <td style="font-weight:600;">${name}</td>
        <td style="text-align:right;font-size:13px;">€${parseFloat(inp.carbon_price ?? 0).toFixed(2)}</td>
        <td style="text-align:right;font-size:13px;">${exportStr}</td>
        <td style="text-align:right;font-size:13px;">${factorStr}</td>
        <td style="text-align:right;font-size:13px;">${res.projected_emission != null ? fmtNum(res.projected_emission) + ' tCO₂' : '—'}</td>
        <td style="text-align:right;font-size:13px;font-weight:700;">${res.projected_cost != null ? fmtEur(res.projected_cost) : '—'}</td>
        <td>
          <span style="font-size:11px;font-weight:700;color:${color};padding:2px 8px;
                border-radius:99px;background:${color}20;">${label}</span>
        </td>
        <td style="font-size:12px;color:var(--color-text-muted);">${fmtDate(s.created_at)}</td>
      </tr>`;
}

// ── Load saved simulations ────────────────────────────────────────────────────
async function loadSimulations() {
    simsContainer.innerHTML = '<div class="hh-loading">Yükleniyor…</div>';
    try {
        const res  = await companyService.getSavedSimulations({ page: currentPage, limit: PAGE_LIMIT });
        const data = res.data ?? {};
        renderSimulations(data.simulations ?? [], data.total ?? 0, data.page ?? 1, data.limit ?? PAGE_LIMIT);
    } catch (err) {
        simsContainer.innerHTML = `<div class="hh-empty"><p>Senaryolar yüklenemedi: ${err.message}</p></div>`;
    }
}

// ── Run + save simulation ─────────────────────────────────────────────────────
csRunBtn?.addEventListener('click', async () => {
    const carbonPrice = parseFloat(carbonPriceEl?.value);
    if (isNaN(carbonPrice) || carbonPrice < 0) {
        showToast('Hata', 'AB ETS karbon fiyatı girilmelidir (0 veya pozitif).', 'error');
        carbonPriceEl?.focus();
        return;
    }

    csRunBtn.disabled    = true;
    csRunBtn.textContent = 'Hesaplanıyor…';

    try {
        await companyService.runSimulation({
            scenario_name:             scenarioNameEl?.value.trim()    || undefined,
            carbon_price:              carbonPrice,
            export_change_pct:         parseFloat(exportChangePctEl?.value) || 0,
            emission_factor_change_pct: parseFloat(factorChangePctEl?.value) || 0,
            paid_price:                parseFloat(paidPriceEl?.value)   || 0,
        });
        showToast('Başarılı', 'Senaryo kaydedildi.', 'success');

        if (scenarioNameEl) scenarioNameEl.value = '';
        currentPage = 1;
        await loadSimulations();
    } catch (err) {
        showToast('Hata', err.message, 'error');
    } finally {
        csRunBtn.disabled    = false;
        csRunBtn.textContent = 'Simüle Et ve Kaydet';
    }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
    try {
        const [dashRes, profileRes] = await Promise.all([
            companyService.getDashboard(),
            companyService.getProfile(),
        ]);

        const dashboard = dashRes.data?.dashboard;
        baselineEmission = dashboard?.total_emission ?? 0;

        if (baselineEmission <= 0) {
            simulatorSection.style.display = 'none';
            noDataNotice.style.display     = 'block';
            return;
        }

        if (baselineEmEl) baselineEmEl.textContent = fmtNum(baselineEmission);

        const cp = profileRes.data?.profile?.default_carbon_price;
        if (cp && carbonPriceEl) carbonPriceEl.value = parseFloat(cp).toFixed(2);

        updatePreview();
        await loadSimulations();
    } catch {
        updatePreview();
        await loadSimulations();
    }
})();
