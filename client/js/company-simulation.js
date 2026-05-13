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
let baselineEmission = 0;   // loaded from dashboard on boot

// ── Display constants ─────────────────────────────────────────────────────────
const RISK_LABELS = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' };
const RISK_COLORS = { low: '#16a34a', medium: '#f59e0b', high: '#dc2626', critical: '#7c3aed' };

// Client-side mirrors of admin_cbam_config seeds (server is authoritative on save)
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

// ── Render saved simulations ──────────────────────────────────────────────────
function renderSimulations(sims) {
    if (simCountEl) simCountEl.textContent = `${sims.length} senaryo`;

    if (!sims.length) {
        simsContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">🔬</div>
            <p>Henüz kayıtlı senaryo yok. Formu kullanarak ilk simülasyonu çalıştırın.</p>
          </div>`;
        return;
    }

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
      </div>`;
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
        const res = await companyService.getSavedSimulations();
        renderSimulations(res.data?.simulations ?? []);
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
            // total_emission now comes from emission_records
            simulatorSection.style.display = 'none';
            noDataNotice.style.display     = 'block';
            return;
        }

        // Populate baseline bar
        if (baselineEmEl) baselineEmEl.textContent = fmtNum(baselineEmission);

        // Pre-fill carbon price from company profile default
        const cp = profileRes.data?.profile?.default_carbon_price;
        if (cp && carbonPriceEl) carbonPriceEl.value = parseFloat(cp).toFixed(2);

        updatePreview();
        await loadSimulations();
    } catch {
        // On error, keep simulator visible with empty state
        updatePreview();
        await loadSimulations();
    }
})();
