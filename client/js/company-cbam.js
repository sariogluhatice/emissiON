import { companyService } from './api/companyService.js';
import { renderLayout }   from './layout.js';
import { showToast }      from './utils/uiUtils.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'CBAM / Vergi Hesabı' });
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

// ── DOM refs — auto-analysis section ─────────────────────────────────────────
const cbamLoading         = document.getElementById('cbamLoading');
const cbamNoRecords       = document.getElementById('cbamNoRecords');
const cbamAnalysis        = document.getElementById('cbamAnalysis');

const cbamTotalTco2       = document.getElementById('cbamTotalTco2');
const cbamEstTax          = document.getElementById('cbamEstTax');
const cbamNetLiability    = document.getElementById('cbamNetLiability');
const cbamRiskLevel       = document.getElementById('cbamRiskLevel');
const cbamCarbonPriceLabel = document.getElementById('cbamCarbonPriceLabel');
const cbamPaidPrice       = document.getElementById('cbamPaidPrice');
const cbamCategoryContainer = document.getElementById('cbamCategoryContainer');
const cbamTrendContainer  = document.getElementById('cbamTrendContainer');
const cbamSensitivityContainer = document.getElementById('cbamSensitivityContainer');

// ── DOM refs — entries history ────────────────────────────────────────────────
const entryCountEl     = document.getElementById('entryCountEl');
const entriesContainer = document.getElementById('entriesContainer');

// ── Constants ─────────────────────────────────────────────────────────────────
const EMISSION_CATEGORY_LABELS = {
    energy:    '⚡ Enerji (Elektrik)',
    water:     '💧 Su',
    gas:       '🔥 Doğalgaz',
    transport: '🚗 Ulaşım',
    materials: '📦 Malzeme',
    waste:     '♻️ Atık',
    food:      '🍽️ Gıda',
    shopping:  '🛒 Alışveriş',
    other:     '📋 Diğer',
};

const CBAM_CATEGORY_LABELS = {
    iron_steel:  '🏗️ Demir ve Çelik',
    aluminium:   '⚙️ Alüminyum',
    cement:      '🏢 Çimento',
    fertiliser:  '🌱 Gübre',
    hydrogen:    '⚗️ Hidrojen',
    electricity: '⚡ Elektrik',
    other:       '📦 Diğer',
};

const RISK_LABELS = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' };
const RISK_COLORS = { low: '#16a34a', medium: '#f59e0b', high: '#dc2626', critical: '#7c3aed' };
const RISK_THRESHOLDS = { medium: 10000, high: 50000, critical: 200000 };

// ── Pagination state ──────────────────────────────────────────────────────────
let currentPage  = 1;
const PAGE_LIMIT = 20;
let totalEntries = 0;

// ── Other state ───────────────────────────────────────────────────────────────
let summaryState = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function clientRisk(cost) {
    if (cost < RISK_THRESHOLDS.medium)   return 'low';
    if (cost < RISK_THRESHOLDS.high)     return 'medium';
    if (cost < RISK_THRESHOLDS.critical) return 'high';
    return 'critical';
}

function fmtEur(val) {
    return '€' + parseFloat(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtNum(val, dec = 4) {
    return parseFloat(val).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

// ── Auto-analysis: render summary ─────────────────────────────────────────────
function renderAnalysis(summary) {
    const carbonPrice = summary.carbon_price_used;
    const totalTco2   = summary.total_tco2;
    const paidPerTon  = parseFloat(cbamPaidPrice?.value) || 0;
    const netPrice    = Math.max(0, carbonPrice - paidPerTon);
    const netLiability = parseFloat((totalTco2 * netPrice).toFixed(2));
    const risk        = clientRisk(summary.estimated_tax);

    if (cbamCarbonPriceLabel) cbamCarbonPriceLabel.textContent = `AB ETS: €${carbonPrice.toFixed(2)}/tCO₂`;
    if (cbamTotalTco2)   cbamTotalTco2.textContent   = fmtNum(totalTco2, 4);
    if (cbamEstTax)      cbamEstTax.textContent       = fmtEur(summary.estimated_tax);
    if (cbamNetLiability) {
        cbamNetLiability.textContent = fmtEur(netLiability);
        cbamNetLiability.style.color = netLiability <= 0 ? '#16a34a' : '';
    }
    if (cbamRiskLevel) {
        cbamRiskLevel.textContent = RISK_LABELS[risk] || risk;
        cbamRiskLevel.style.color = RISK_COLORS[risk] || '';
    }

    renderCategories(summary.categories, totalTco2);
    renderTrend(summary.trend);
    renderSensitivity(totalTco2);
}

function renderCategories(categories, totalTco2) {
    if (!cbamCategoryContainer) return;

    if (!categories?.length) {
        cbamCategoryContainer.innerHTML = `<div class="hh-empty"><p>Kategori verisi yok.</p></div>`;
        return;
    }

    cbamCategoryContainer.innerHTML = categories.map(c => {
        const label    = EMISSION_CATEGORY_LABELS[c.category] || c.category;
        const sharePct = c.share_pct ?? (totalTco2 > 0 ? c.total_tco2 / totalTco2 * 100 : 0);
        return `
          <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
              <span style="font-weight:600;">${label}</span>
              <span style="color:var(--color-text-muted);">${fmtNum(c.total_tco2, 4)} tCO₂e · ${fmtEur(c.estimated_tax)}</span>
            </div>
            <div style="background:var(--color-border);border-radius:99px;height:8px;overflow:hidden;">
              <div style="background:var(--color-primary);height:100%;width:${sharePct.toFixed(1)}%;border-radius:99px;"></div>
            </div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">${sharePct.toFixed(1)}% · ${c.cnt} kayıt</div>
          </div>`;
    }).join('');
}

function renderTrend(trend) {
    if (!cbamTrendContainer) return;

    if (!trend?.length) {
        cbamTrendContainer.innerHTML = `<div class="hh-empty"><p>Aylık veri yok.</p></div>`;
        return;
    }

    const maxTax = Math.max(...trend.map(t => t.estimated_tax), 1);
    cbamTrendContainer.innerHTML = trend.map(t => {
        const [y, m] = t.period.split('-');
        const label  = new Date(parseInt(y), parseInt(m) - 1, 1)
            .toLocaleDateString('tr-TR', { month: 'short', year: '2-digit' });
        const barPct = (t.estimated_tax / maxTax * 100).toFixed(1);
        return `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span style="width:52px;font-size:12px;color:var(--color-text-muted);flex-shrink:0;">${label}</span>
            <div style="flex:1;background:var(--color-border);border-radius:99px;height:8px;">
              <div style="width:${barPct}%;background:var(--color-primary);height:100%;border-radius:99px;"></div>
            </div>
            <span style="font-size:12px;font-weight:600;width:72px;text-align:right;">${fmtEur(t.estimated_tax)}</span>
          </div>`;
    }).join('');
}

function renderSensitivity(totalTco2) {
    if (!cbamSensitivityContainer) return;

    if (!totalTco2 || totalTco2 <= 0) {
        cbamSensitivityContainer.innerHTML = `<div class="hh-empty"><p>Veri bekleniyor.</p></div>`;
        return;
    }

    const PRICE_POINTS = [50, 65, 80, 100];
    cbamSensitivityContainer.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid var(--color-border);">
            <th style="text-align:left;padding:6px 8px;color:var(--color-text-muted);font-weight:600;">AB ETS Fiyatı</th>
            <th style="text-align:right;padding:6px 8px;color:var(--color-text-muted);font-weight:600;">Tahmini Vergi</th>
            <th style="text-align:right;padding:6px 8px;color:var(--color-text-muted);font-weight:600;">Risk</th>
          </tr>
        </thead>
        <tbody>
          ${PRICE_POINTS.map(p => {
              const cost  = totalTco2 * p;
              const risk  = clientRisk(cost);
              const color = RISK_COLORS[risk];
              return `
            <tr style="border-bottom:1px solid var(--color-border);">
              <td style="padding:8px;font-weight:600;">€${p}/tCO₂</td>
              <td style="text-align:right;padding:8px;font-weight:700;">${fmtEur(cost)}</td>
              <td style="text-align:right;padding:8px;">
                <span style="font-size:11px;font-weight:700;color:${color};padding:2px 8px;border-radius:99px;background:${color}20;">
                  ${RISK_LABELS[risk]}
                </span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div style="font-size:11px;color:var(--color-text-muted);margin-top:8px;padding:0 8px;">
        Toplam emisyon: ${fmtNum(totalTco2, 4)} tCO₂e · Ödenen vergiler bu tabloya dahil değil
      </div>`;
}

// ── Load and render auto-analysis ─────────────────────────────────────────────
async function loadSummary() {
    try {
        const res     = await companyService.getCbamSummary();
        summaryState  = res.data?.summary;

        cbamLoading.style.display = 'none';

        if (!summaryState?.has_records) {
            cbamNoRecords.style.display = 'block';
            return;
        }

        cbamAnalysis.style.display = 'block';
        renderAnalysis(summaryState);
    } catch (err) {
        cbamLoading.style.display = 'none';
        cbamNoRecords.style.display = 'block';
    }
}

cbamPaidPrice?.addEventListener('input', () => {
    if (summaryState) renderAnalysis(summaryState);
});


// ── Render entries history ─────────────────────────────────────────────────────
function formatPeriod(dateStr) {
    const [y, m] = String(dateStr).split('-');
    return new Date(parseInt(y), parseInt(m) - 1, 1)
        .toLocaleDateString('tr-TR', { year: 'numeric', month: 'long' });
}

function riskBadge(level) {
    const color = RISK_COLORS[level] || '#9ca3af';
    const label = RISK_LABELS[level] || level;
    return `<span style="font-size:11px;font-weight:700;color:${color};padding:2px 8px;border-radius:99px;background:${color}20;">${label}</span>`;
}

function sourceBadge(source) {
    return source === 'auto'
        ? `<span style="font-size:10px;font-weight:700;color:#16a34a;padding:2px 6px;border-radius:99px;background:#16a34a18;">⟳ Otomatik</span>`
        : `<span style="font-size:10px;font-weight:700;color:#9ca3af;padding:2px 6px;border-radius:99px;background:#9ca3af18;">Manuel</span>`;
}

function renderEntries(entries, total, page, limit) {
    totalEntries = total;
    if (entryCountEl) entryCountEl.textContent = `${total} beyan`;

    if (!entries.length) {
        entriesContainer.innerHTML = `
          <div class="hh-empty">
            <div class="hh-empty-icon">📋</div>
            <p>Henüz ihracat beyanı yok.</p>
          </div>`;
        return;
    }

    const totalPages = Math.ceil(total / limit);
    const paginationHtml = totalPages > 1 ? `
      <div class="ce-pagination">
        <button class="btn-secondary ce-prev-btn" ${page <= 1 ? 'disabled' : ''}>← Önceki</button>
        <span class="ce-page-info">${page} / ${totalPages} sayfa</span>
        <button class="btn-secondary ce-next-btn" ${page >= totalPages ? 'disabled' : ''}>Sonraki →</button>
      </div>` : '';

    entriesContainer.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="hh-tasks-table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Dönem</th>
              <th>Hedef Bölge</th>
              <th style="text-align:right;">İhracat (t)</th>
              <th style="text-align:right;">Em. Faktörü</th>
              <th style="text-align:right;">Gömülü Em.</th>
              <th style="text-align:right;">CBAM Maliyeti</th>
              <th>Risk</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(entryRow).join('')}
          </tbody>
        </table>
      </div>
      ${paginationHtml}`;

    // Attach raw entry data to edit buttons for pre-filling the modal
    entries.forEach(e => {
        const btn = entriesContainer.querySelector(`.ce-edit-btn[data-id="${e.id}"]`);
        if (btn) btn._entryData = e;
    });

    entriesContainer.querySelectorAll('.ce-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => handleDelete(parseInt(btn.dataset.id, 10), btn.dataset.name));
    });

    entriesContainer.querySelectorAll('.ce-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(parseInt(btn.dataset.id, 10)));
    });

    entriesContainer.querySelector('.ce-prev-btn')?.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; loadEntries(); }
    });

    entriesContainer.querySelector('.ce-next-btn')?.addEventListener('click', () => {
        if (currentPage < totalPages) { currentPage++; loadEntries(); }
    });
}

function entryRow(e) {
    const carbonInfo = parseFloat(e.paid_carbon_price) > 0
        ? `<div style="font-size:11px;color:var(--color-text-muted);">AB: €${parseFloat(e.carbon_price).toFixed(2)} / Ödenen: €${parseFloat(e.paid_carbon_price).toFixed(2)}</div>`
        : `<div style="font-size:11px;color:var(--color-text-muted);">AB: €${parseFloat(e.carbon_price).toFixed(2)}</div>`;
    const notesHtml   = e.notes ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">${e.notes}</div>` : '';
    const regionHtml  = e.destination_region ? `<span style="font-size:12px;">${e.destination_region}</span>` : '—';
    const displayName = CBAM_CATEGORY_LABELS[e.export_category] || e.export_category;
    const periodEnd   = e.period_end ? ` – ${formatPeriod(e.period_end)}` : '';

    return `
      <tr>
        <td>
          <div style="font-weight:600;">${displayName}</div>
          <div style="margin-top:2px;">${sourceBadge(e.emission_factor_source)}</div>
          ${notesHtml}
        </td>
        <td style="font-size:13px;">${formatPeriod(e.period_start)}${periodEnd}</td>
        <td style="font-size:12px;">${regionHtml}</td>
        <td style="text-align:right;font-size:13px;">${parseFloat(e.export_amount).toLocaleString('tr-TR')}</td>
        <td style="text-align:right;font-size:13px;">${parseFloat(e.emission_factor).toFixed(6)}</td>
        <td style="text-align:right;font-size:13px;font-weight:600;">${parseFloat(e.total_embedded_emission).toFixed(4)}</td>
        <td style="text-align:right;">
          <div style="font-size:13px;font-weight:700;">${fmtEur(e.estimated_cbam_cost)}</div>
          ${carbonInfo}
        </td>
        <td>${riskBadge(e.risk_level)}</td>
        <td>
          <div style="display:flex;gap:4px;">
            <button class="ce-edit-btn" data-id="${e.id}"
                    style="background:none;border:none;cursor:pointer;color:var(--color-primary);font-size:15px;padding:4px 6px;"
                    title="Düzenle">✎</button>
            <button class="ce-delete-btn" data-id="${e.id}" data-name="${displayName}"
                    style="background:none;border:none;cursor:pointer;color:var(--color-error);font-size:16px;padding:4px 6px;"
                    title="Sil">✕</button>
          </div>
        </td>
      </tr>`;
}

async function loadEntries() {
    if (entriesContainer) entriesContainer.innerHTML = '<div class="hh-loading">Yükleniyor…</div>';
    try {
        const res  = await companyService.getEntries({ page: currentPage, limit: PAGE_LIMIT });
        const data = res.data ?? {};
        renderEntries(data.entries ?? [], data.total ?? 0, data.page ?? 1, data.limit ?? PAGE_LIMIT);
    } catch (err) {
        if (entriesContainer) entriesContainer.innerHTML = `<div class="hh-empty"><p>Beyanlar yüklenemedi: ${err.message}</p></div>`;
    }
}

async function handleDelete(entryId, displayName) {
    if (!window.confirm(`"${displayName}" beyanını silmek istediğinizden emin misiniz?`)) return;
    try {
        await companyService.deleteEntry(entryId);
        showToast('Silindi', 'Beyan silindi.', 'success');
        if (currentPage > 1) {
            const remaining = totalEntries - 1;
            const maxPage   = Math.ceil(remaining / PAGE_LIMIT) || 1;
            if (currentPage > maxPage) currentPage = maxPage;
        }
        await loadEntries();
    } catch (err) {
        showToast('Hata', err.message, 'error');
    }
}


// ── Edit modal ────────────────────────────────────────────────────────────────
let _editModal   = null;
let _editEntryId = null;

function _getOrCreateModal() {
    if (_editModal) return _editModal;

    _editModal = document.createElement('div');
    _editModal.id = 'ceEditModal';
    _editModal.innerHTML = `
      <div class="ce-modal-overlay" id="ceModalOverlay">
        <div class="ce-modal-box">
          <div class="ce-modal-header">
            <span class="ce-modal-title">Beyan Düzenle</span>
            <button class="ce-modal-close" id="ceModalClose" title="Kapat">✕</button>
          </div>

          <div class="ce-modal-body">
            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" for="ceEditProductName">Ürün Adı</label>
              <input class="input" type="text" id="ceEditProductName" maxlength="200" />
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
              <div class="form-group" style="margin:0;">
                <label class="form-label" for="ceEditPeriodEnd">Dönem Bitiş</label>
                <input class="input" type="date" id="ceEditPeriodEnd" />
                <span class="field-hint">Çeyreklik bildirimler için</span>
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label" for="ceEditPaidPrice">Ödenen Karbon Fiyatı (€/tCO₂)</label>
                <input class="input" type="number" id="ceEditPaidPrice" min="0" step="0.01" />
                <span class="field-hint">CBAM'dan mahsup edilecek tutar</span>
              </div>
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label class="form-label" for="ceEditRegion">Hedef Bölge</label>
              <input class="input" type="text" id="ceEditRegion" maxlength="100" placeholder="Örn: Almanya, AB" />
            </div>

            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="ceEditNotes">Notlar</label>
              <textarea class="input textarea-resize-v" id="ceEditNotes" rows="3"
                        maxlength="2000" placeholder="İsteğe bağlı not…"></textarea>
            </div>

            <div id="ceEditWarning" class="ce-modal-warning" style="display:none;"></div>
          </div>

          <div class="ce-modal-footer">
            <button class="btn-secondary" id="ceEditCancelBtn">Vazgeç</button>
            <button class="btn-primary"   id="ceEditSaveBtn">Kaydet</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(_editModal);

    document.getElementById('ceModalClose')?.addEventListener('click', closeEditModal);
    document.getElementById('ceEditCancelBtn')?.addEventListener('click', closeEditModal);
    document.getElementById('ceModalOverlay')?.addEventListener('click', e => {
        if (e.target === document.getElementById('ceModalOverlay')) closeEditModal();
    });
    document.getElementById('ceEditSaveBtn')?.addEventListener('click', saveEdit);

    return _editModal;
}

function openEditModal(entryId) {
    _getOrCreateModal();
    _editEntryId = entryId;

    const btn  = entriesContainer.querySelector(`.ce-edit-btn[data-id="${entryId}"]`);
    const data = btn?._entryData;
    if (data) {
        document.getElementById('ceEditProductName').value = data.product_name        ?? '';
        document.getElementById('ceEditPeriodEnd').value   = data.period_end          ?? '';
        document.getElementById('ceEditPaidPrice').value   = parseFloat(data.paid_carbon_price ?? 0).toFixed(2);
        document.getElementById('ceEditRegion').value      = data.destination_region  ?? '';
        document.getElementById('ceEditNotes').value       = data.notes               ?? '';
    }

    const warningEl = document.getElementById('ceEditWarning');
    if (warningEl) warningEl.style.display = 'none';

    _editModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeEditModal() {
    if (_editModal) _editModal.style.display = 'none';
    document.body.style.overflow = '';
}

async function saveEdit() {
    const saveBtn = document.getElementById('ceEditSaveBtn');
    saveBtn.disabled    = true;
    saveBtn.textContent = 'Kaydediliyor…';

    const warningEl = document.getElementById('ceEditWarning');
    if (warningEl) warningEl.style.display = 'none';

    try {
        const res = await companyService.updateEntry(_editEntryId, {
            product_name:       document.getElementById('ceEditProductName').value.trim() || null,
            period_end:         document.getElementById('ceEditPeriodEnd').value          || null,
            paid_carbon_price:  parseFloat(document.getElementById('ceEditPaidPrice').value) || 0,
            destination_region: document.getElementById('ceEditRegion').value.trim()      || null,
            notes:              document.getElementById('ceEditNotes').value.trim()       || null,
        });

        const warning = res.data?.warning;
        if (warning && warningEl) {
            warningEl.textContent   = warning;
            warningEl.style.display = 'block';
        }

        showToast('Güncellendi', 'Beyan başarıyla güncellendi.', 'success');
        closeEditModal();
        await loadEntries();
    } catch (err) {
        showToast('Hata', err.message, 'error');
    } finally {
        saveBtn.disabled    = false;
        saveBtn.textContent = 'Kaydet';
    }
}


// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
    await loadSummary();
    await loadEntries();
})();
