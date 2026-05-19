import { renderLayout } from './layout.js';

const user = renderLayout({ activeNav: 'nav-company', title: 'Rapor Görüntüle' });
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

// ── URL param ──────────────────────────────────────────────────────────────────

const params   = new URLSearchParams(window.location.search);
const reportId = parseInt(params.get('reportId'), 10);

const loadingEl = document.getElementById('crvLoading');
const errorEl   = document.getElementById('crvError');
const contentEl = document.getElementById('crvContent');

// ── Helpers ────────────────────────────────────────────────────────────────────

function escHtml(s) {
    return String(s ?? '—')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function fmtNum(v, dec = 2) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('tr-TR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtEur(v)  { return Number.isFinite(parseFloat(v)) ? '€' + fmtNum(v) : '—'; }
function fmtKg(v)   { return Number.isFinite(parseFloat(v)) ? fmtNum(v) + ' kg' : '—'; }
function fmtTco2(v) { return Number.isFinite(parseFloat(v)) ? fmtNum(v, 4) + ' tCO₂' : '—'; }

const RISK_LABELS  = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' };
const RISK_COLORS  = { low: '#16a34a', medium: '#f59e0b', high: '#dc2626', critical: '#7c3aed' };
const CAT_LABELS   = {
    energy: 'Enerji', water: 'Su', gas: 'Gaz', transport: 'Ulaşım',
    materials: 'Malzeme', waste: 'Atık', food: 'Gıda', shopping: 'Alışveriş', other: 'Diğer',
};
const REPORT_TYPE_LABELS = {
    full: 'Tam Rapor', cbam_only: 'Yalnızca CBAM', emission_only: 'Yalnızca Emisyon',
};

function riskBadge(risk) {
    const label = RISK_LABELS[risk] || risk;
    const color = RISK_COLORS[risk] || '#374151';
    return `<span style="font-size:12px;font-weight:700;padding:3px 10px;border-radius:99px;
                         background:${color}20;color:${color};border:1px solid ${color}40;">${escHtml(label)}</span>`;
}

function dataRow(label, value) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;
                  padding:7px 0;border-bottom:1px solid var(--color-border);">
        <span style="font-size:13px;color:var(--color-text-muted);">${label}</span>
        <span style="font-size:13px;font-weight:600;">${value}</span>
      </div>`;
}

function kpiCard(label, value, sub) {
    return `
      <div style="padding:16px;background:var(--color-surface-alt,#f9fafb);border-radius:var(--radius-md);text-align:center;">
        <div style="font-size:22px;font-weight:700;margin-bottom:4px;">${value}</div>
        <div style="font-size:12px;font-weight:600;color:var(--color-text-muted);">${label}</div>
        ${sub ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">${sub}</div>` : ''}
      </div>`;
}

function showError(msg) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
        errorEl.innerHTML = `
          <div class="content-card glass-card" style="text-align:center;padding:40px 24px;max-width:480px;margin:48px auto;">
            <h2 style="font-size:18px;font-weight:700;margin-bottom:8px;">Erişim Sağlanamadı</h2>
            <p style="color:var(--color-text-muted);font-size:14px;margin:0 0 20px;">${escHtml(msg)}</p>
            <a href="company-reports.html" class="btn-secondary">Raporlar Sayfasına Dön</a>
          </div>`;
        errorEl.style.display = '';
    }
}

// ── Render ─────────────────────────────────────────────────────────────────────

function renderReport(report) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) contentEl.style.display = '';

    const snap = report.snapshot || {};
    const co   = snap.company          || {};
    const em   = snap.emission_summary || {};
    const cbam = snap.cbam_summary     || {};
    const tasks= snap.task_summary     || {};

    document.title = `${report.report_no || 'Rapor'} – emissiON`;

    const titleEl = document.getElementById('crvTitle');
    if (titleEl) titleEl.textContent = co.company_name || report.report_no || 'Rapor';

    const subtitleEl = document.getElementById('crvSubtitle');
    if (subtitleEl) {
        subtitleEl.textContent = report.owner_name
            ? `${report.owner_name} tarafından paylaşılan şirket raporu`
            : `Şirket emisyon raporu`;
    }

    const reportNoEl = document.getElementById('crvReportNo');
    if (reportNoEl) reportNoEl.textContent = report.report_no || '—';

    const riskBadgeEl = document.getElementById('crvRiskBadge');
    if (riskBadgeEl && em.risk_level) riskBadgeEl.innerHTML = riskBadge(em.risk_level);

    // ── Meta ──────────────────────────────────────────────────────────────────
    const metaEl = document.getElementById('crvMeta');
    if (metaEl) {
        metaEl.innerHTML = [
            dataRow('Rapor Türü',        escHtml(REPORT_TYPE_LABELS[report.report_type] || report.report_type)),
            dataRow('Oluşturan',         escHtml(report.owner_name || '—')),
            dataRow('Oluşturma Tarihi',  fmtDate(snap.generated_at || report.created_at)),
            dataRow('Veri Başlangıcı',   fmtDate(em.first_date)),
            dataRow('Veri Bitişi',       fmtDate(em.last_date)),
            dataRow('Veri Dönemi',       em.months_of_data != null ? `${em.months_of_data} ay` : '—'),
        ].join('');
    }

    // ── Company profile ───────────────────────────────────────────────────────
    const companyEl = document.getElementById('crvCompany');
    if (companyEl) {
        companyEl.innerHTML = [
            dataRow('Şirket Adı',        escHtml(co.company_name)),
            dataRow('Sektör',            escHtml(co.industry)),
            dataRow('CBAM Sektörü',      escHtml(co.cbam_sector)),
            dataRow('AB\'ye İhracat',    co.exports_to_eu ? 'Evet' : 'Hayır'),
            dataRow('Ülke',              escHtml(co.country)),
            dataRow('Karbon Fiyatı',     fmtEur(em.carbon_price_used || co.default_carbon_price)),
        ].join('');
    }

    // ── Emission summary KPIs ─────────────────────────────────────────────────
    const emSumEl = document.getElementById('crvEmissionSummary');
    if (emSumEl) {
        emSumEl.innerHTML = [
            kpiCard('Toplam Emisyon (kg)', fmtKg(em.total_kg),    `${fmtNum(em.record_count, 0)} kayıt`),
            kpiCard('Toplam CO₂',          fmtTco2(em.total_tco2), `${em.months_of_data ?? '—'} aylık veri`),
            kpiCard('Tahmini CBAM Maliyeti', fmtEur(em.estimated_cost), `@${fmtEur(em.carbon_price_used)}/tCO₂`),
            kpiCard('Uyum Skoru',          `${snap.compliance_score ?? '—'}`, 'puan'),
        ].join('');
    }

    // ── Category breakdown ────────────────────────────────────────────────────
    const catEl = document.getElementById('crvCategories');
    if (catEl) {
        const cats = snap.category_breakdown || [];
        if (!cats.length) {
            catEl.innerHTML = `<div class="hh-empty"><p>Kategori verisi yok.</p></div>`;
        } else {
            catEl.innerHTML = `
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${cats.map(c => `
                  <div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px;">
                      <span style="font-weight:600;">${escHtml(CAT_LABELS[c.category] || c.category)}</span>
                      <span style="color:var(--color-text-muted);">${fmtTco2(c.total_tco2)} · ${c.share_pct ?? 0}%</span>
                    </div>
                    <div style="height:6px;background:var(--color-border);border-radius:3px;overflow:hidden;">
                      <div style="height:100%;width:${c.share_pct ?? 0}%;background:var(--color-primary);border-radius:3px;"></div>
                    </div>
                  </div>
                `).join('')}
              </div>`;
        }
    }

    // ── CBAM summary ──────────────────────────────────────────────────────────
    const cbamEl = document.getElementById('crvCbam');
    if (cbamEl) {
        if (!cbam.entry_count) {
            cbamEl.innerHTML = `<div class="hh-empty"><p>CBAM kaydı bulunmuyor.</p></div>`;
        } else {
            const entries = cbam.entries || [];
            cbamEl.innerHTML = `
              <div style="display:flex;flex-direction:column;gap:var(--spacing-xs);margin-bottom:var(--spacing-md);">
                ${dataRow('Kayıt Sayısı',        String(cbam.entry_count))}
                ${dataRow('Toplam Emisyon',       fmtTco2(cbam.total_emission_tco2))}
                ${dataRow('Toplam CBAM Maliyeti', fmtEur(cbam.total_cost))}
                ${dataRow('Baskın Risk',          cbam.dominant_risk ? riskBadge(cbam.dominant_risk) : '—')}
              </div>
              ${entries.length ? `
                <div style="font-size:12px;font-weight:600;color:var(--color-text-muted);
                            text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">
                  En Yüksek Maliyetli Kayıtlar
                </div>
                <div style="display:flex;flex-direction:column;gap:5px;">
                  ${entries.slice(0, 5).map(e => `
                    <div style="display:flex;justify-content:space-between;font-size:12px;
                                padding:5px 8px;background:var(--color-surface-alt,#f9fafb);
                                border-radius:var(--radius-sm);">
                      <span style="font-weight:600;">${escHtml(e.product_name || e.export_category)}</span>
                      <span style="color:var(--color-text-muted);">${fmtEur(e.estimated_cbam_cost)}</span>
                    </div>
                  `).join('')}
                </div>` : ''}`;
        }
    }

    // ── Monthly trend ─────────────────────────────────────────────────────────
    const trendEl = document.getElementById('crvTrend');
    if (trendEl) {
        const trend = snap.monthly_trend || [];
        if (!trend.length) {
            trendEl.innerHTML = `<div class="hh-empty"><p>Aylık veri yok.</p></div>`;
        } else {
            const maxKg = Math.max(...trend.map(t => t.total_kg), 1);
            trendEl.innerHTML = `
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                  <tr style="border-bottom:2px solid var(--color-border);">
                    <th style="text-align:left;padding:6px 10px;color:var(--color-text-muted);font-weight:600;">Dönem</th>
                    <th style="padding:6px 10px;color:var(--color-text-muted);font-weight:600;"></th>
                    <th style="text-align:right;padding:6px 10px;color:var(--color-text-muted);font-weight:600;">Emisyon</th>
                    <th style="text-align:right;padding:6px 10px;color:var(--color-text-muted);font-weight:600;">Maliyet</th>
                  </tr>
                </thead>
                <tbody>
                  ${trend.map(t => {
                    const barPct = Math.round((t.total_kg / maxKg) * 100);
                    return `
                      <tr style="border-bottom:1px solid var(--color-border);">
                        <td style="padding:8px 10px;font-weight:600;">${escHtml(t.period)}</td>
                        <td style="padding:8px 10px;min-width:100px;">
                          <div style="height:8px;background:var(--color-border);border-radius:4px;overflow:hidden;">
                            <div style="height:100%;width:${barPct}%;background:var(--color-primary);border-radius:4px;"></div>
                          </div>
                        </td>
                        <td style="padding:8px 10px;text-align:right;">${fmtTco2(t.total_tco2)}</td>
                        <td style="padding:8px 10px;text-align:right;color:var(--color-text-muted);">${fmtEur(t.est_cost)}</td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>`;
        }
    }

    // ── Task summary ──────────────────────────────────────────────────────────
    const tasksEl = document.getElementById('crvTasks');
    if (tasksEl) {
        const rate = tasks.completion_rate != null ? Math.round(tasks.completion_rate * 100) : null;
        tasksEl.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:var(--spacing-xs);">
            ${dataRow('Toplam Görev',    String(tasks.total_tasks ?? '—'))}
            ${dataRow('Tamamlanan',      String(tasks.completed_tasks ?? '—'))}
            ${dataRow('Tamamlanma Oranı', rate != null ? `%${rate}` : '—')}
          </div>
          ${rate != null ? `
            <div style="margin-top:var(--spacing-sm);">
              <div style="height:8px;background:var(--color-border);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${rate}%;background:var(--color-primary);border-radius:4px;transition:width .4s;"></div>
              </div>
            </div>` : ''}`;
    }

    // ── Compliance score ──────────────────────────────────────────────────────
    const complianceEl = document.getElementById('crvCompliance');
    if (complianceEl) {
        const score = snap.compliance_score ?? null;
        const color = score == null ? '#9ca3af'
            : score >= 80 ? '#16a34a'
            : score >= 60 ? '#f59e0b'
            : '#dc2626';
        complianceEl.innerHTML = `
          <div style="text-align:center;padding:var(--spacing-md);">
            <div style="font-size:52px;font-weight:800;color:${color};line-height:1;">
              ${score ?? '—'}
            </div>
            <div style="font-size:14px;color:var(--color-text-muted);margin-top:6px;">/ 100 puan</div>
            <div style="font-size:12px;margin-top:10px;color:${color};font-weight:600;">
              ${score == null ? '' : score >= 80 ? 'İyi' : score >= 60 ? 'Orta' : 'Düşük'}
            </div>
          </div>`;
    }

    // ── Wire up PDF button ────────────────────────────────────────────────────
    const pdfBtn = document.getElementById('crvDownloadPdfBtn');
    if (pdfBtn) {
        pdfBtn.style.display = '';
        pdfBtn.addEventListener('click', async () => {
            const orig = pdfBtn.textContent;
            pdfBtn.disabled    = true;
            pdfBtn.textContent = 'Hazırlanıyor…';
            try {
                await downloadReportPdf(report);
            } finally {
                pdfBtn.disabled    = false;
                pdfBtn.textContent = orig;
            }
        });
    }
}

// ── PDF generation ────────────────────────────────────────────────────────────

let _fontB64 = null;
async function _loadFont() {
    if (_fontB64) return _fontB64;
    try {
        const res = await fetch('https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf');
        if (!res.ok) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 8192)
            bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
        _fontB64 = btoa(bin);
        return _fontB64;
    } catch { return null; }
}

async function downloadReportPdf(report) {
    const fontB64 = await _loadFont();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const W = 210, M = 14, CW = W - M * 2;
    const GREEN  = [16, 185, 129];
    const DARK   = [30, 41, 59];
    const MUTED  = [100, 116, 139];
    const BLUE   = [59, 130, 246];
    const FNAME  = 'DejaVuSans';

    if (fontB64) {
        doc.addFileToVFS('DejaVuSans.ttf', fontB64);
        doc.addFont('DejaVuSans.ttf', FNAME, 'normal');
    }
    const sf  = (sz) => { doc.setFontSize(sz); doc.setFont(fontB64 ? FNAME : 'helvetica', 'normal'); };
    const tB  = { font: fontB64 ? FNAME : 'helvetica', fontSize: 8.5 };
    const tH  = (fill) => ({ fillColor: fill, textColor: 255, font: fontB64 ? FNAME : 'helvetica', fontStyle: 'normal', fontSize: 8 });
    const tA  = (fill) => ({ fillColor: fill });

    const snap = report.snapshot || {};
    const co   = snap.company          || {};
    const em   = snap.emission_summary || {};
    const cbam = snap.cbam_summary     || {};
    const tasks= snap.task_summary     || {};

    // ── Header ────────────────────────────────────────────────────────────────
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, W, 18, 'F');
    sf(16); doc.setTextColor(255, 255, 255);
    doc.text('emissiON', M, 12);
    sf(9);
    doc.text('Kurumsal Emisyon Raporu', M + 42, 12);

    // ── Report info card ──────────────────────────────────────────────────────
    doc.setFillColor(248, 250, 252); doc.setDrawColor(226, 232, 240);
    doc.roundedRect(M, 22, CW, 26, 3, 3, 'FD');
    sf(11); doc.setTextColor(...DARK);
    doc.text(co.company_name || report.owner_name || 'Şirket', M + 6, 31);
    sf(8.5); doc.setTextColor(...MUTED);
    doc.text(`Rapor No: ${report.report_no || '—'}`, M + 6, 38);
    doc.text(`Tür: ${REPORT_TYPE_LABELS[report.report_type] || report.report_type || '—'}`, M + 6, 44);
    const genDate = snap.generated_at ? new Date(snap.generated_at).toLocaleDateString('tr-TR', { year:'numeric', month:'long', day:'numeric' }) : '—';
    doc.text(`Oluşturulma: ${genDate}`, M + 80, 38);
    if (em.first_date || em.last_date) doc.text(`Veri dönemi: ${em.first_date || '—'} / ${em.last_date || '—'}`, M + 80, 44);

    let y = 54;

    // ── Emission summary table ────────────────────────────────────────────────
    sf(10); doc.setTextColor(...DARK);
    doc.text('Emisyon Özeti', M, y);
    y += 4;

    const riskTR = { low: 'Düşük', medium: 'Orta', high: 'Yüksek', critical: 'Kritik' };
    doc.autoTable({
        startY: y,
        head: [['Gösterge', 'Değer']],
        body: [
            ['Toplam Emisyon', em.total_kg != null ? `${parseFloat(em.total_kg).toLocaleString('tr-TR', {maximumFractionDigits:2})} kg` : '—'],
            ['Toplam CO₂', em.total_tco2 != null ? `${parseFloat(em.total_tco2).toFixed(4)} tCO₂` : '—'],
            ['Emisyon Kaydı', em.record_count != null ? String(em.record_count) : '—'],
            ['Veri Dönemi', em.months_of_data != null ? `${em.months_of_data} ay` : '—'],
            ['Karbon Fiyatı', em.carbon_price_used != null ? `€${parseFloat(em.carbon_price_used).toFixed(2)} / tCO₂` : '—'],
            ['Tahmini CBAM Maliyeti', em.estimated_cost != null ? `€${parseFloat(em.estimated_cost).toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2})}` : '—'],
            ['Risk Seviyesi', riskTR[em.risk_level] || em.risk_level || '—'],
            ['Uyum Skoru', snap.compliance_score != null ? `${snap.compliance_score} / 100` : '—'],
        ],
        theme: 'striped',
        headStyles: tH(GREEN),
        bodyStyles: tB,
        alternateRowStyles: tA([248, 250, 252]),
        columnStyles: { 1: { halign: 'right' } },
        margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── Category breakdown ────────────────────────────────────────────────────
    const cats = snap.category_breakdown || [];
    if (cats.length) {
        if (y > 220) { doc.addPage(); y = 18; }
        sf(10); doc.setTextColor(...DARK);
        doc.text('Kategori Dagilimi', M, y); y += 4;
        const catLabels = { energy:'Enerji', water:'Su', gas:'Gaz', transport:'Ulasim', materials:'Malzeme', waste:'Atik', food:'Gida', shopping:'Alisveris', other:'Diger' };
        doc.autoTable({
            startY: y,
            head: [['Kategori', 'Emisyon (tCO₂)', 'Pay (%)', 'Tahmini Maliyet']],
            body: cats.map(c => [
                catLabels[c.category] || c.category,
                parseFloat(c.total_tco2).toFixed(4),
                `${c.share_pct ?? 0}%`,
                c.estimated_cost != null ? `€${parseFloat(c.estimated_cost).toFixed(2)}` : '—',
            ]),
            theme: 'striped',
            headStyles: tH(DARK),
            bodyStyles: tB,
            alternateRowStyles: tA([248, 250, 252]),
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
            margin: { left: M, right: M },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // ── Monthly trend ─────────────────────────────────────────────────────────
    const trend = snap.monthly_trend || [];
    if (trend.length) {
        if (y > 200) { doc.addPage(); y = 18; }
        sf(10); doc.setTextColor(...DARK);
        doc.text('Aylik Emisyon Trendi', M, y); y += 4;
        doc.autoTable({
            startY: y,
            head: [['Dönem', 'Emisyon (tCO₂)', 'Tahmini Maliyet']],
            body: trend.map(t => [
                t.period,
                parseFloat(t.total_tco2).toFixed(4),
                t.est_cost != null ? `€${parseFloat(t.est_cost).toFixed(2)}` : '—',
            ]),
            theme: 'striped',
            headStyles: tH(BLUE),
            bodyStyles: tB,
            alternateRowStyles: tA([239, 246, 255]),
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
            margin: { left: M, right: M },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // ── CBAM summary ──────────────────────────────────────────────────────────
    if (cbam.entry_count > 0) {
        if (y > 200) { doc.addPage(); y = 18; }
        sf(10); doc.setTextColor(...DARK);
        doc.text('CBAM Ozeti', M, y); y += 4;
        doc.autoTable({
            startY: y,
            head: [['Gösterge', 'Değer']],
            body: [
                ['Beyan Sayisi', String(cbam.entry_count)],
                ['Toplam Emisyon', cbam.total_emission_tco2 != null ? `${parseFloat(cbam.total_emission_tco2).toFixed(4)} tCO₂` : '—'],
                ['Toplam CBAM Maliyeti', cbam.total_cost != null ? `€${parseFloat(cbam.total_cost).toFixed(2)}` : '—'],
                ['Baskin Risk', riskTR[cbam.dominant_risk] || cbam.dominant_risk || '—'],
            ],
            theme: 'striped',
            headStyles: tH(BLUE),
            bodyStyles: tB,
            alternateRowStyles: tA([239, 246, 255]),
            columnStyles: { 1: { halign: 'right' } },
            margin: { left: M, right: M },
        });
        y = doc.lastAutoTable.finalY + 8;

        const entries = (cbam.entries || []).slice(0, 10);
        if (entries.length) {
            if (y > 200) { doc.addPage(); y = 18; }
            sf(9); doc.setTextColor(...MUTED);
            doc.text('En Yuksek Maliyetli CBAM Kayitlari (ilk 10)', M, y); y += 4;
            doc.autoTable({
                startY: y,
                head: [['Ürün', 'Kategori', 'Emisyon (tCO₂)', 'Maliyet']],
                body: entries.map(e => [
                    e.product_name || '—',
                    e.export_category || '—',
                    parseFloat(e.total_embedded_emission ?? 0).toFixed(4),
                    `€${parseFloat(e.estimated_cbam_cost ?? 0).toFixed(2)}`,
                ]),
                theme: 'striped',
                headStyles: tH(DARK),
                bodyStyles: { ...tB, fontSize: 8 },
                alternateRowStyles: tA([248, 250, 252]),
                columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
                margin: { left: M, right: M },
            });
            y = doc.lastAutoTable.finalY + 8;
        }
    }

    // ── Task summary ──────────────────────────────────────────────────────────
    if (tasks.total_tasks > 0) {
        if (y > 230) { doc.addPage(); y = 18; }
        sf(10); doc.setTextColor(...DARK);
        doc.text('Görev Tamamlama', M, y); y += 4;
        const rate = tasks.completion_rate != null ? Math.round(tasks.completion_rate * 100) : 0;
        doc.autoTable({
            startY: y,
            head: [['Gösterge', 'Değer']],
            body: [
                ['Toplam Gorev', String(tasks.total_tasks)],
                ['Tamamlanan', String(tasks.completed_tasks)],
                ['Tamamlanma Orani', `%${rate}`],
            ],
            theme: 'striped',
            headStyles: tH(GREEN),
            bodyStyles: tB,
            alternateRowStyles: tA([248, 250, 252]),
            columnStyles: { 1: { halign: 'right' } },
            margin: { left: M, right: M },
        });
    }

    // ── Footer on every page ──────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const ph = doc.internal.pageSize.height;
        doc.setFillColor(248, 250, 252);
        doc.rect(0, ph - 14, W, 14, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.line(0, ph - 14, W, ph - 14);
        sf(8); doc.setTextColor(...MUTED);
        doc.text(`Sayfa ${i} / ${pageCount}  ·  ${report.report_no || 'emissiON Raporu'}`, M, ph - 6);
        doc.text('emissiON', W - M, ph - 6, { align: 'right' });
    }

    const safeName = (report.report_no || 'rapor').replace(/[^A-Za-z0-9_\-]/g, '_');
    doc.save(`emissiON_${safeName}.pdf`);
}

// ── Fetch ──────────────────────────────────────────────────────────────────────

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
