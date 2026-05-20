import { companyService } from './api/companyService.js';
import { renderLayout }   from './layout.js';
import { getCategoryLabelWithEmoji, CBAM_SECTOR_LABELS, RISK_LABELS, RISK_COLORS } from './utils/labelUtils.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'Şirket Paneli' });
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
const loadingState    = document.getElementById('cpLoadingState');
const noProfileState  = document.getElementById('cpNoProfileState');
const dashboardState  = document.getElementById('cpDashboardState');
const companyNameEl   = document.getElementById('cpCompanyNameEl');
const sectorBadgeEl   = document.getElementById('cpSectorBadge');

const statEmission    = document.getElementById('cpStatEmission');
const statCost        = document.getElementById('cpStatCost');
const statRisk        = document.getElementById('cpStatRisk');
const statScore       = document.getElementById('cpStatScore');


// ── Helpers ───────────────────────────────────────────────────────────────────
function formatEur(val) {
    return '€' + parseFloat(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNum(val, decimals = 2) {
    return parseFloat(val).toLocaleString('tr-TR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

function formatPeriod(periodStr) {
    // periodStr: "YYYY-MM"
    const parts = String(periodStr).split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
    return d.toLocaleDateString('tr-TR', { year: 'numeric', month: 'short' });
}

// ── Trend chart ───────────────────────────────────────────────────────────────
let trendChartInstance = null;

function renderTrendChart(trend) {
    const canvas  = document.getElementById('cpTrendChart');
    const emptyEl = document.getElementById('cpTrendEmpty');
    if (!canvas) return;

    if (!trend?.length) {
        canvas.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }

    if (trendChartInstance) trendChartInstance.destroy();

    const labels = trend.map(t => formatPeriod(t.period));
    const values = trend.map(t => parseFloat(t.cbam_cost));

    trendChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'CBAM Maliyeti (€)',
                data: values,
                backgroundColor: 'rgba(91,173,142,0.55)',
                borderColor: '#5BAD8E',
                borderWidth: 2,
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => '€' + v.toLocaleString('tr-TR') },
                },
            },
        },
    });
}

// ── Category breakdown ────────────────────────────────────────────────────────
function renderCategories(categories) {
    const container = document.getElementById('cpCategoriesContainer');
    if (!container) return;

    if (!categories?.length) {
        container.innerHTML = `<div class="hh-empty"><div class="hh-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted); opacity: 0.7;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg></div><p>Henüz emisyon kaydı yok. <a href="add-entry.html" style="color:var(--color-primary);">Kayıt ekleyin.</a></p></div>`;
        return;
    }

    const maxCost = Math.max(...categories.map(c => parseFloat(c.cbam_cost)));

    container.innerHTML = categories.map(c => {
        const pct   = maxCost > 0 ? (parseFloat(c.cbam_cost) / maxCost) * 100 : 0;
        const label = CBAM_SECTOR_LABELS[c.export_category] || getCategoryLabelWithEmoji(c.export_category);
        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
              <span style="font-weight:600;">${label}</span>
              <span style="color:var(--color-text-muted);">${formatEur(c.cbam_cost)}</span>
            </div>
            <div style="background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
              <div style="background:var(--color-primary);height:100%;width:${pct.toFixed(1)}%;border-radius:99px;"></div>
            </div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px;">
              ${formatNum(c.emission, 4)} tCO₂ · ${c.cnt} kayıt
            </div>
          </div>`;
    }).join('');
}

// ── Top emission source (primary: emission_records) ───────────────────────────
function renderHighestRisk(dashboard) {
    const container  = document.getElementById('cpHighestRiskContainer');
    const titleEl    = document.getElementById('cpHighestRiskTitle');
    if (!container) return;

    const topSource = dashboard.top_emission_source;
    const topEntry  = dashboard.highest_risk_entry;   // cbam_entries — may be null

    // Prefer emission_records top source; fall back to cbam declared entry
    if (topSource) {
        if (titleEl) titleEl.textContent = 'En Yüksek Emisyon Kaynağı';
        const label  = getCategoryLabelWithEmoji(topSource.export_category);
        const pct    = dashboard.total_emission > 0
            ? ((topSource.emission / dashboard.total_emission) * 100).toFixed(1)
            : '—';
        container.innerHTML = `
          <div style="padding:8px 0;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
              <span style="font-size:15px;font-weight:700;">${label}</span>
              <span style="font-size:12px;font-weight:700;color:var(--color-primary);padding:3px 10px;
                    border-radius:99px;background:var(--color-primary)20;">%${pct} pay</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div>
                <div style="font-size:11px;color:var(--color-text-muted);">Emisyon</div>
                <div style="font-size:13px;font-weight:600;">${formatNum(topSource.emission, 4)} tCO₂e</div>
              </div>
              <div>
                <div style="font-size:11px;color:var(--color-text-muted);">Kayıt Sayısı</div>
                <div style="font-size:13px;font-weight:600;">${topSource.cnt}</div>
              </div>
              <div style="grid-column:1/-1;margin-top:4px;">
                <div style="font-size:11px;color:var(--color-text-muted);">Tahmini Vergi Katkısı</div>
                <div style="font-size:22px;font-weight:800;color:var(--color-primary);">${formatEur(topSource.cbam_cost)}</div>
              </div>
            </div>
            ${topEntry ? `
              <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--color-border);
                           font-size:11px;color:var(--color-text-muted);">
                Son beyan: <strong>${CBAM_SECTOR_LABELS[topEntry.export_category] || topEntry.export_category}</strong>
                — ${formatEur(topEntry.estimated_cbam_cost)}
              </div>` : ''}
          </div>`;
        return;
    }

    container.innerHTML = `<div class="hh-empty"><div class="hh-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted); opacity: 0.7;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg></div>
      <p>Henüz kayıt yok. <a href="add-entry.html" style="color:var(--color-primary);">Kayıt ekleyin.</a></p></div>`;
}

// ── Compliance Progress Bar ───────────────────────────────────────────────────
function renderComplianceBar(score) {
    const existingBar = document.getElementById('cpComplianceBar');
    if (existingBar) { existingBar.remove(); }

    const scoreCard = statScore?.closest('.stat-card');
    if (!scoreCard) return;

    const bar = document.createElement('div');
    bar.id = 'cpComplianceBar';
    bar.innerHTML = `
      <div class="compliance-bar-track" style="margin-top:8px;">
        <div class="compliance-bar-fill" id="cpCompFill" style="width:0%"></div>
      </div>
      <div style="font-size:10px;color:var(--color-text-muted);margin-top:3px;">${
        score >= 85 ? '✓ İyi Uyum' : score >= 55 ? '⚠ Geliştirilmeli' : '✗ Risk Var'
      }</div>`;
    scoreCard.appendChild(bar);
    requestAnimationFrame(() => {
        const fill = document.getElementById('cpCompFill');
        if (fill) fill.style.width = `${score}%`;
    });
}

// ── KPI Trend Indicators ──────────────────────────────────────────────────────
function renderKpiTrends(dashboard) {
    if (!dashboard.trend?.length) return;

    const trend = dashboard.trend;
    if (trend.length < 2) return;

    const latest   = parseFloat(trend[trend.length - 1]?.total_cost ?? 0);
    const previous = parseFloat(trend[trend.length - 2]?.total_cost ?? 0);
    const pct      = previous > 0 ? ((latest - previous) / previous * 100).toFixed(1) : null;

    if (pct === null) return;

    const up      = parseFloat(pct) > 0;
    const trendEl = document.createElement('div');
    trendEl.style.cssText = 'font-size:12px;margin-top:4px;';
    trendEl.className = up ? 'kpi-trend-up' : 'kpi-trend-down';
    trendEl.textContent = `${up ? '↑' : '↓'} Geçen aya göre ${Math.abs(pct)}%`;

    const costCard = statCost?.closest('.stat-card');
    if (costCard && !costCard.querySelector('.kpi-trend-up,.kpi-trend-down')) {
        costCard.appendChild(trendEl);
    }
}

// ── Carbon Price Sensitivity ──────────────────────────────────────────────────
function renderSensitivity(totalEmbedded) {
    const container = document.getElementById('cpSensitivityContainer');
    if (!container) return;

    if (!totalEmbedded || totalEmbedded <= 0) {
        container.innerHTML = `<div class="hh-empty"><div class="hh-empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--color-text-muted); opacity: 0.7;"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg></div><p>Hesaplama için önce <a href="add-entry.html" style="color:var(--color-primary);">emisyon kaydı ekleyin</a>.</p></div>`;
        return;
    }

    const PRICE_POINTS = [50, 65, 80, 100];

    container.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--color-border);">
            <th style="text-align:left;padding:6px 8px;color:var(--color-text-muted);font-weight:600;">Fiyat</th>
            <th style="text-align:right;padding:6px 8px;color:var(--color-text-muted);font-weight:600;">Tahmini Maliyet</th>
          </tr>
        </thead>
        <tbody>
          ${PRICE_POINTS.map(p => {
              const cost = totalEmbedded * p;
              return `
            <tr style="border-bottom:1px solid var(--color-border);">
              <td style="padding:8px;font-weight:600;">€${p}/tCO₂</td>
              <td style="text-align:right;padding:8px;font-weight:700;">${formatEur(cost)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="font-size:11px;color:var(--color-text-muted);margin-top:8px;padding:0 8px;">
        Toplam gömülü emisyon: ${formatNum(totalEmbedded, 4)} tCO₂ · Ödenen vergiler mahsup edilmemiş
      </div>`;
}

// ── Render full dashboard ─────────────────────────────────────────────────────
function renderDashboard(profile, dashboard) {
    if (companyNameEl) companyNameEl.textContent = profile.company_name || '—';
    if (sectorBadgeEl) {
        sectorBadgeEl.textContent = profile.cbam_sector
            ? (CBAM_SECTOR_LABELS[profile.cbam_sector] || profile.cbam_sector)
            : '—';
    }

    // Show soft prompt if profile is incomplete
    const banner = document.getElementById('cpProfileBanner');
    if (banner) banner.style.display = (!profile.cbam_sector) ? 'flex' : 'none';

    if (statEmission) statEmission.textContent = formatNum(dashboard.total_emission, 4);
    if (statCost)     statCost.textContent     = formatEur(dashboard.total_cbam_cost);

    if (statRisk) {
        statRisk.textContent  = RISK_LABELS[dashboard.dominant_risk] || dashboard.dominant_risk;
        statRisk.style.color  = RISK_COLORS[dashboard.dominant_risk] || '';
    }

    if (statScore) {
        const score = dashboard.compliance_score;
        statScore.textContent = score;
        statScore.style.color = score >= 85 ? '#16a34a' : score >= 55 ? '#f59e0b' : '#dc2626';

        // Compliance progress bar
        renderComplianceBar(score);
    }

    // KPI trend indicators
    renderKpiTrends(dashboard);

    renderTrendChart(dashboard.trend);
    renderCategories(dashboard.categories);
    renderHighestRisk(dashboard);
    renderSensitivity(dashboard.total_emission);

    if (loadingState)   loadingState.style.display   = 'none';
    if (noProfileState) noProfileState.style.display = 'none';
    if (dashboardState) dashboardState.style.display = 'block';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
    try {
        const [profileRes, dashboardRes] = await Promise.all([
            companyService.getProfile(),
            companyService.getDashboard(),
        ]);

        const profile   = profileRes.data?.profile;
        const dashboard = dashboardRes.data?.dashboard;

        if (!profile) {
            if (loadingState)   loadingState.style.display   = 'none';
            if (noProfileState) noProfileState.style.display = 'block';
            return;
        }

        renderDashboard(profile, dashboard);
    } catch {
        if (loadingState)   loadingState.style.display   = 'none';
        if (noProfileState) noProfileState.style.display = 'block';
    }
})();
