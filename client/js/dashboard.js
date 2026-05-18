import { emissionService }      from './api/emissionService.js';
import { profileService }        from './api/profileService.js';
import { gamificationService }   from './api/gamificationService.js';
import { renderLayout }          from './layout.js';
import {
  calculateStats,
  formatDate,
} from './utils/uiUtils.js';
import { getCategoryKey, getCategoryLabelWithEmoji } from './utils/labelUtils.js';
import { updateGlobe, updateGlobeTooltip, buildGlobeStats } from './utils/globe.js';

const user = renderLayout({ activeNav: 'nav-dashboard' });
if (!user) throw new Error('redirect');

const welcomeEl = document.getElementById('welcomeName');
if (welcomeEl) welcomeEl.textContent = user?.name ? user.name.split(' ')[0] : 'Misafir';

const recordList = document.getElementById('recordList');

let inflationFactor = 1.0;
let liveFuelMultiplier = null;
let recordsGlobal = [];

// Güncel Enflasyon ve Canlı Akaryakıt Fiyatlarını Çek
(async () => {
  // 1. Canlı Döviz Kuru Sorgula (Enflasyon Çarpanı İçerir)
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      const tryRate = data.rates?.TRY || 32.5;
      inflationFactor = tryRate / 32.5;
      console.log(`[inflation] Live USD/TRY rate: ${tryRate}, multiplier factor: ${inflationFactor.toFixed(3)}`);
    }
  } catch (err) {
    console.warn('[inflation] Could not fetch live rate, falling back to baseline prices:', err);
  }

  // 2. İstanbul Güncel Akaryakıt (Benzin/Motorin) Fiyatını Canlı Çek (ÜCRETSİZ API)
  try {
    const res = await fetch('https://hasanadiguzel.com.tr/api/akaryakit/sehir=istanbul');
    if (res.ok) {
      const data = await res.json();
      const districts = Object.keys(data.data || {});
      if (districts.length > 0) {
        const firstDistrict = data.data[districts[0]];
        let priceStr = '';
        for (const key in firstDistrict) {
          if (key.includes('Kursunsuz') || key.includes('95')) {
            priceStr = firstDistrict[key];
            break;
          }
        }
        if (!priceStr) {
          for (const key in firstDistrict) {
            if (key.includes('Motorin')) {
              priceStr = firstDistrict[key];
              break;
            }
          }
        }
        const fuelPrice = parseFloat(priceStr.replace(',', '.'));
        if (fuelPrice && fuelPrice > 20) {
          // 1 kg CO2 üretmek için gereken harcanan ortalama yakıt maliyet payı (1 kg CO2 ~ 0.43 L)
          liveFuelMultiplier = fuelPrice * 0.43;
          console.log(`[fuel-api] Live fuel price: ${fuelPrice} TL. Calculated transport multiplier: ${liveFuelMultiplier.toFixed(2)}`);
        }
      }
    }
  } catch (err) {
    console.warn('[fuel-api] Could not fetch live fuel prices, falling back to baseline multipliers:', err);
  }

  // 3. Çarpanlar yüklendikten sonra eğer veriler de hazırsa maliyetleri canlı güncelle
  if (recordsGlobal.length > 0) {
     const carbonCost = calculateCarbonCost(recordsGlobal, user.role);
     const statSavings = document.getElementById('statSavings');
     if (statSavings) {
       statSavings.textContent = Math.round(carbonCost).toLocaleString('tr-TR');
     }
  }
})();

// CRUD Kartı Oluşturma
function createCard(record) {
  const card = document.createElement('div');
  card.className  = 'record-card';
  card.dataset.id = record.id;

  card.innerHTML = `
    <div class="record-info">
      <span class="record-source">${record.source}</span>
      <span class="record-meta">${formatDate(record.date)}</span>
    </div>
    <span class="record-amount">${parseFloat(record.amount).toFixed(1)} kg CO₂</span>
  `;

  return card;
}

// CRUD Kayıtlarını Yükle ve İstatistikleri Güncelle
async function initDashboard() {
  try {
    const { records } = await emissionService.getAll();
    
    // 1. İstatistikleri Hesapla ve Göster
    const stats = calculateStats(records);
    if (document.getElementById('statTotal'))   document.getElementById('statTotal').textContent   = stats.total;
    if (document.getElementById('statEntries')) document.getElementById('statEntries').textContent = stats.entries;
    if (document.getElementById('statTopCat'))  document.getElementById('statTopCat').textContent  = stats.topCat;

    // 1b. Karbon Maliyeti Hesapla
    const carbonCost = calculateCarbonCost(records, user.role);
    if (document.getElementById('statSavings')) {
      document.getElementById('statSavings').textContent = Math.round(carbonCost).toLocaleString('tr-TR');
    }

    // 1c. 🌍 Dünya Globunu Aylık Performansa Göre Güncelle (Türkiye Ortalaması: 450kg)
    const globeStats = buildGlobeStats(records);
    updateGlobe(globeStats.currentMonth);
    updateGlobeTooltip(globeStats);

    // 2. Grafiği Başlat
    initChart(records);

    // 3. Kayıt Listesini Render Et
    if (recordList) {
      recordList.innerHTML = '';
      if (records.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
      } else {
        document.getElementById('emptyState').style.display = 'none';
        records.forEach(r => recordList.appendChild(createCard(r)));
      }
    }

    // 4. AI Spotlight (Özet) Bilgisini Çek
    try {
      const insights = await emissionService.getSmartInsights();
      const spotlightEl = document.getElementById('aiSpotlightText');
      if (spotlightEl) {
        let pred = insights?.prediction;
        // Guard: if AI returned an object instead of a string, try common keys
        if (pred && typeof pred === 'object') {
          pred = pred.text || pred.content || pred.value || pred.analysis || null;
        }
        if (typeof pred === 'string' && pred.trim()) {
          spotlightEl.textContent = pred.trim();
        } else {
          spotlightEl.textContent = "Analiz hazırlanıyor. Lütfen biraz sonra tekrar bakın.";
        }
      }
    } catch {
      const el = document.getElementById('aiSpotlightText');
      if (el) el.textContent = "Tahmin verileri şu an alınamıyor.";
    }

    // 5. Kurumsal Rapor Butonunu Göster
    if (user.role === 'company') {
      const reportBtn = document.getElementById('downloadReportBtn');
      if (reportBtn) {
        reportBtn.style.display = 'flex';
        reportBtn.onclick = () => generateCorporateReport(records, stats);
      }
    }

    // 6. Gamification & Rozetler
    try {
      const gamData = await gamificationService.getStats();
      if (gamData?.data) renderGamification(gamData.data);
    } catch (gamErr) { console.warn('[gamification] getStats failed:', gamErr?.message); }

    // 7. Hane İçi Görevleri Göster (Yalnızca Household)
    if (user.role === 'household') {
      const hhCard = document.getElementById('householdTasksCard');
      if (hhCard) hhCard.style.display = 'block';
    }

  } catch (err) {
    console.error('Panel verileri yüklenemedi:', err);
  }
}

// ── Karbon Maliyeti Hesaplama (Gerçekçi Yaklaşım) ─────────────────────────────
function calculateCarbonCost(records, role) {
  // Karbon emisyonu üretmek için harcanan enerjinin (yakıt, elektrik vb.) finansal maliyeti.
  // Katsayılar: 1 kg CO2 üretmek için gereken birim harcama maliyeti (2024-2026 TR Güncel Ortalama)
  let totalCost = 0;
  
  const multipliers = {
    'energy':      7.2,   // ⚡ Elektrik/Enerji (kWh tarifesi mesken/ticarethane ort.)
    'electricity': 7.2,   // Geriye dönük uyumluluk
    'gas':         5.8,   // 🔥 Doğalgaz (m³ ortalama fatura maliyeti)
    'natural_gas': 5.8,   // Geriye dönük uyumluluk
    'water':       12.5,  // 💧 Su (m³ arıtma, dağıtım ve belediye tarifesi)
    'transport':   liveFuelMultiplier || 17.5,  // 🚗 Ulaşım (Canlı çekilen akaryakıt / toplu taşıma bilet maliyetleri)
    'petrol':      liveFuelMultiplier || 17.5,  // Geriye dönük uyumluluk
    'diesel':      liveFuelMultiplier || 16.8,  // Geriye dönük uyumluluk
    'flight':      12.0,  // Geriye dönük uyumluluk
    'materials':   8.5,   // 📦 Malzeme / Hammadde (Plastik/kağıt/metal ortalama hammadde maliyeti)
    'waste':       4.0,   // 🗑️ Atık bertaraf ve belediye geri dönüşüm vergi payı
    'food':        15.0,  // 🍽️ Gıda tüketimi (Gıda üretimi ve karbon maliyet payı)
    'shopping':    12.0   // 🛍️ Alışveriş (Tedarik zinciri, lojistik ve mağaza perakende payı)
  };

  records.forEach(r => {
    const amount = parseFloat(r.amount) || 0;
    const cat    = (r.category || r.source || '').toLowerCase();
    
    let m = 5.0; // Varsayılan genel katsayı (other)
    for (const key in multipliers) {
      if (cat.includes(key)) {
        m = multipliers[key];
        break;
      }
    }
    
    // Eğer bu bir akaryakıt/ulaşım kaydıysa ve canlı akaryakıt fiyatı başarılı çekildiyse, 
    // canlı fiyat zaten nihai fiyattır, tekrar enflasyon çarpanıyla çarpmıyoruz (çift enflasyon olmaması için).
    // Diğer tüm kategoriler (elektrik, gaz, su, gıda, alışveriş, malzeme, atık) ise canlı enflasyon çarpanı ile ölçeklenir.
    const isLiveFuel = (cat.includes('transport') || cat.includes('petrol') || cat.includes('diesel')) && liveFuelMultiplier;
    const finalMultiplier = isLiveFuel ? m : m * (inflationFactor || 1.0);
    
    totalCost += amount * finalMultiplier; 
  });

  if (role === 'company') totalCost *= 1.2; // Kurumsal genel gider payı
  return totalCost;
}

// ── Badge descriptions (frontend-only, keyed by badge id) ────────────────────
const BADGE_DESC = {
  earth_friend:  'Uygulamaya kayıt olarak sürdürülebilirlik yolculuğuna başladın.',
  first_step:    'İlk emisyon kaydını oluşturarak harika bir adım attın.',
  data_pro:      '5 veya daha fazla kayıtla düzenli veri takibini kanıtladın.',
  data_expert:   '20+ kayıtla verilerini titizlikle izleyen bir analiz uzmanısın.',
  streak_3:      '3 gün üst üste emisyon kaydı girerek alışkanlık oluşturdun.',
  streak_7:      '7 günlük kesintisiz seri — haftalık şampiyon unvanını kazandın!',
  streak_30:     '30 günlük devasa seri — emisyon takibinde efsane oldun!',
  carbon_aware:  '300 XP biriktirerek yüksek karbon bilincine sahip olduğunu gösterdin.',
};

// ── Gamification Widget ───────────────────────────────────────────────────────
function renderGamification(stats) {
  // Topbar widgets
  const tbStreak = document.getElementById('topbarStreakWidget');
  const tbCount  = document.getElementById('topbarStreakCount');
  const tbXp     = document.getElementById('topbarXpWidget');
  const tbLevel  = document.getElementById('topbarLevel');
  const tbFill   = document.getElementById('topbarXpFill');
  if (tbStreak && stats.current_streak > 0) {
    tbStreak.style.display = 'flex';
    if (tbCount) tbCount.textContent = stats.current_streak;
  }
  if (tbXp) {
    tbXp.style.display = 'flex';
    if (tbLevel) tbLevel.textContent = `Sv.${stats.level}`;
    if (tbFill)  tbFill.style.width  = `${stats.level_progress_pct}%`;
  }

  // Banner
  const banner = document.getElementById('gamBanner');
  if (banner) {
    banner.style.display = '';
    const streakNum   = document.getElementById('gamStreakNum');
    const streakLabel = document.getElementById('gamStreakLabel');
    const levelEl     = document.getElementById('gamLevel');
    const xpText      = document.getElementById('gamXpText');
    const xpFill      = document.getElementById('gamXpFill');
    const xpNext      = document.getElementById('gamXpNext');
    if (streakNum)   streakNum.textContent   = stats.current_streak;
    if (streakLabel) streakLabel.textContent = stats.current_streak === 1 ? 'Günlük Seri' : 'Günlük Seri';
    if (levelEl)     levelEl.textContent     = `Seviye ${stats.level}`;
    if (xpText)      xpText.textContent      = `${stats.total_xp} XP`;
    if (xpFill)      { requestAnimationFrame(() => { xpFill.style.width = `${stats.level_progress_pct}%`; }); }
    if (xpNext && stats.xp_to_next_level > 0) xpNext.textContent = `Sonraki seviyeye ${stats.xp_to_next_level} XP`;
  }

  // Daily reminder
  const reminder = document.getElementById('dailyReminder');
  if (reminder) {
    // Show reminder only if streak > 0 (has used app) but hasn't logged today yet.
    // Detect by checking if current_streak stayed same as last session — approximate:
    // show if streak > 0 and we have no "logged today" signal (we'll check localStorage).
    const todayKey = `gam_logged_${new Date().toISOString().slice(0,10)}`;
    const loggedToday = localStorage.getItem(todayKey) === '1';
    if (!loggedToday && stats.current_streak > 0) {
      reminder.style.display = 'flex';
    }
  }

  // Badges
  const badgesCard   = document.getElementById('badgesCard');
  const badgesList   = document.getElementById('badgesList');
  const badgesCount  = document.getElementById('badgesEarnedCount');
  if (badgesCard && badgesList && stats.badge_defs) {
    badgesCard.style.display = '';
    const earned   = stats.badge_defs.filter(b => b.earned);
    const unearned = stats.badge_defs.filter(b => !b.earned);
    if (badgesCount) badgesCount.textContent = `${earned.length} / ${stats.badge_defs.length} kazanıldı`;
    badgesList.innerHTML = '';
    [...earned, ...unearned].forEach(b => {
      const el = document.createElement('div');
      el.className = `badge-item${b.earned ? ' badge-earned' : ' badge-locked'}`;
      const desc = b.earned
        ? (BADGE_DESC[b.id] || '')
        : 'Henüz kazanılmadı';
      el.innerHTML = `
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-info">
          <div class="badge-name">${b.name}</div>
          <div class="badge-desc">${desc}</div>
        </div>`;
      badgesList.appendChild(el);
    });
  }
}

// Silme İşlemi
if (recordList) {
  recordList.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('[data-delete]');
    if (!deleteBtn) return;

    const id = deleteBtn.dataset.delete;
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;

    try {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Siliniyor…';

      await emissionService.remove(id);
      await initDashboard(); // İstatistikleri ve listeyi tazele
    } catch (err) {
      console.error('Silme hatası:', err);
      alert('Kayıt silinemedi. Sunucu hatası oluşmuş olabilir.');
      deleteBtn.disabled = false;
      deleteBtn.innerHTML = 'Sil';
    }
  });
}


function initChart(data) {
  const ctx = document.getElementById('emissionChart');
  if (!ctx) return;

  const categories = {};
  data.forEach(e => {
    const label = getCategoryLabelWithEmoji(e.category || getCategoryKey(e));
    categories[label] = (categories[label] || 0) + parseFloat(e.amount);
  });

  const labels = Object.keys(categories);
  const values = Object.values(categories);

  if (labels.length === 0) {
    ctx.parentElement.innerHTML = `
      <div style="text-align:center; padding: 40px 20px; color: var(--color-text-muted);">
        <p style="font-size:32px; margin-bottom:12px;">🌱</p>
        <p style="font-size:14px; font-weight:500;">Henüz emisyon kaydı yok.</p>
        <p style="font-size:13px; margin-top:4px;">Görselleştirmeyi görmek için ilk kaydınızı ekleyin →</p>
      </div>`;
    return;
  }

  // Clear existing chart if any (Chart.js works better this way)
  if (window.myChart) window.myChart.destroy();

  window.myChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: ['#86EFAC', '#93C5FD', '#5EEAD4', '#FDE68A', '#C4B5FD', '#FDA4AF'],
        borderWidth: 0, // Çizgileri kaldırıp saf renk görünümü
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: 24 // Grafiğin kenarlara/birbirine yapışmasını engeller
      },
      plugins: { 
        legend: { 
          position: 'right',
          labels: { padding: 20, font: { family: "'Outfit', sans-serif" } }
        } 
      },
      cutout: '78%' // Çok daha zarif ve ince dilimler
    }
  });
}

initDashboard();

// ── Kurumsal Raporlama (Yalnızca Company) ─────────────────────────────────────
if (user.role === 'company') {
  const reportBtn = document.getElementById('downloadReportBtn');
  if (reportBtn) {
    reportBtn.style.display = 'flex';
    reportBtn.addEventListener('click', async () => {
      const origLabel = reportBtn.textContent;
      reportBtn.disabled = true;
      reportBtn.textContent = 'Rapor hazırlanıyor…';
      try {
        const { records } = await emissionService.getAll();
        await generateCorporateReport(records, user);
      } catch (err) {
        showToast('Hata', err.message || 'Rapor oluşturulamadı.', 'error');
      } finally {
        reportBtn.disabled = false;
        reportBtn.textContent = origLabel;
      }
    });
  }
}

// normTR: used ONLY for the PDF filename (filesystem safety). Never for PDF text.
function normTR(s) {
  if (s == null) return '';
  return String(s)
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g');
}

// ── DejaVu Sans font loader (fetched once, cached, supports full Unicode incl. Turkish) ──
let _dejaVuFontB64 = null;

async function _loadDejaVuFont() {
  if (_dejaVuFontB64) return _dejaVuFontB64;
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf'
    );
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    }
    _dejaVuFontB64 = btoa(binary);
    return _dejaVuFontB64;
  } catch {
    return null;
  }
}

async function generateCorporateReport(records, user) {
  // Load Turkish-capable font before creating the doc
  const fontB64 = await _loadDejaVuFont();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, M = 14, CW = W - M * 2;
  const GREEN = [16, 185, 129], DARK = [30, 41, 59], MUTED = [100, 116, 139];
  const BLUE = [59, 130, 246];

  const FNAME = 'DejaVuSans';
  if (fontB64) {
    doc.addFileToVFS('DejaVuSans.ttf', fontB64);
    doc.addFont('DejaVuSans.ttf', FNAME, 'normal');
  }

  // Helper: set font + size (falls back to helvetica if font not loaded)
  const sf = (size) => {
    doc.setFontSize(size);
    doc.setFont(fontB64 ? FNAME : 'helvetica', 'normal');
  };

  // autoTable style objects
  const tBody = { font: fontB64 ? FNAME : 'helvetica', fontSize: 8.5 };
  const tHead = (fill) => ({ fillColor: fill, textColor: 255, font: fontB64 ? FNAME : 'helvetica', fontStyle: 'normal', fontSize: 8 });
  const tAlt  = (fill) => ({ fillColor: fill });

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 18, 'F');

  sf(16); doc.setTextColor(255, 255, 255);
  doc.text('emissiON', M, 12);

  sf(9);
  doc.text('Kurumsal Sürdürülebilirlik Raporu', M + 42, 12);

  // ── Company / report info card ───────────────────────────────────────────────
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(M, 22, CW, 26, 3, 3, 'FD');

  sf(11); doc.setTextColor(...DARK);
  doc.text(user.name || 'Şirket', M + 6, 31);

  sf(9); doc.setTextColor(...MUTED);
  const reportNo = Math.random().toString(36).substr(2, 9).toUpperCase();
  const reportDate = new Date().toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Rapor No: ${reportNo}`, M + 6, 38);
  doc.text(`Oluşturulma Tarihi: ${reportDate}`, M + 6, 44);
  doc.text(`Kayıt Sayısı: ${records.length}`, M + 90, 38);
  const firstYear = records.length > 0 ? new Date(records[records.length - 1].date).getFullYear() : '—';
  const lastYear  = records.length > 0 ? new Date(records[0].date).getFullYear() : '—';
  doc.text(`Dönem: ${firstYear} – ${lastYear}`, M + 90, 44);

  let y = 54;

  // ── Metrics ──────────────────────────────────────────────────────────────────
  const stats = calculateStats(records);
  const totalCost = calculateCarbonCost(records, user.role);

  sf(10); doc.setTextColor(...DARK);
  doc.text('Emisyon Performans Göstergeleri', M, y + 6);
  y += 10;

  doc.autoTable({
    startY: y,
    head: [['Gösterge', 'Değer', 'Birim']],
    body: [
      ['Toplam Karbon Ayak İzi', stats.total, 'kg CO₂e'],
      ['Aktif Emisyon Kaydı', String(stats.entries), 'Adet'],
      ['En Yüksek Kategori', stats.topCat || '—', '—'],
      ['Tahmini Karbon Maliyeti', `${Math.round(totalCost).toLocaleString('tr-TR')} TL`, 'TRY'],
    ],
    theme: 'striped',
    headStyles: tHead(GREEN),
    bodyStyles: tBody,
    alternateRowStyles: tAlt([248, 250, 252]),
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right', cellWidth: 28 } },
    margin: { left: M, right: M },
  });

  y = doc.lastAutoTable.finalY + 8;

  // ── CBAM projection (company only) ───────────────────────────────────────────
  if (user.role === 'company') {
    sf(10); doc.setTextColor(...DARK);
    doc.text('AB Sınırda Karbon Mekanizması (CBAM) Öngörüsü', M, y + 6);
    y += 10;

    const co2Tons = parseFloat(stats.total) / 1000;
    const cbamEur = co2Tons * 85;
    const cbamTry = cbamEur * 38;

    doc.autoTable({
      startY: y,
      head: [['CBAM Metriği', 'Hesaplama', 'Öngörülen Tutar']],
      body: [
        ['Toplam Karbon Tonu', 'Toplam kg CO₂e / 1.000', `${co2Tons.toFixed(3)} tCO₂`],
        ['AB ETS Karbon Bedeli', 'Sabit birim bedel', '85,00 EUR / ton'],
        ['Yıllık Karbon Vergisi', 'Ton × 85 EUR', `${cbamEur.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} EUR`],
        ['Tahmini SKDM Yükümlülüğü', '1 EUR = 38 TRY', `${Math.round(cbamTry).toLocaleString('tr-TR')} TL`],
      ],
      theme: 'striped',
      headStyles: tHead(BLUE),
      bodyStyles: tBody,
      alternateRowStyles: tAlt([239, 246, 255]),
      columnStyles: { 2: { halign: 'right', cellWidth: 46 } },
      margin: { left: M, right: M },
    });

    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Detailed records ──────────────────────────────────────────────────────────
  sf(10); doc.setTextColor(...DARK);
  doc.text('Detaylı Faaliyet Dökümü', M, y + 6);
  y += 10;

  if (!records || records.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(M, y, CW, 14, 2, 2, 'FD');
    sf(9); doc.setTextColor(...MUTED);
    doc.text('Henüz faaliyet kaydı bulunmuyor.', M + 6, y + 9);
  } else {
    const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
    const tableData = sorted.map(r => [
      new Date(r.date).toLocaleDateString('tr-TR'),
      r.source || '—',
      r.description || '—',
      `${parseFloat(r.amount).toFixed(2)} kg`,
    ]);

    doc.autoTable({
      startY: y,
      head: [['Tarih', 'Kaynak', 'Açıklama', 'Miktar']],
      body: tableData,
      theme: 'grid',
      headStyles: tHead(DARK),
      bodyStyles: { ...tBody, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 24 }, 3: { halign: 'right', cellWidth: 24 } },
      margin: { left: M, right: M },
    });
  }

  // ── Footer on every page ──────────────────────────────────────────────────────
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const ph = doc.internal.pageSize.height;
    doc.setFillColor(248, 250, 252);
    doc.rect(0, ph - 14, W, 14, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(0, ph - 14, W, ph - 14);
    sf(8); doc.setTextColor(...MUTED);
    doc.text(`Sayfa ${i} / ${pageCount}  ·  emissiON Kurumsal Sürdürülebilirlik Raporu`, M, ph - 6);
    doc.text('Bu rapor otomatik olarak oluşturulmuştur.', W - M, ph - 6, { align: 'right' });
  }

  // normTR only for the filename (filesystem safety, not PDF content)
  const safeName = normTR(user.name || 'Sirket').replace(/\s+/g, '_');
  doc.save(`emissiON_Rapor_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}


// Yalnızca bireysel kullanıcılar için karşılaştırma kartını yükle
if (user.role === 'individual') {
  loadIndividualComparison();
}

// ── Bireysel Karşılaştırma ────────────────────────────────────────────────────

const BADGE_STYLES = {
  'Çok iyi':          { color: '#2F7A5C', bg: 'rgba(91,173,142,0.14)'  },
  'İyi':              { color: '#2F7A5C', bg: 'rgba(91,173,142,0.10)'  },
  'Geliştirilebilir': { color: '#B07A20', bg: 'rgba(245,200,122,0.18)' },
};

async function loadIndividualComparison() {
  const card = document.getElementById('individualComparisonCard');
  if (!card) return;
  card.style.display = '';

  try {
    const data = await profileService.getIndividualComparison();
    renderComparison(data);
  } catch (err) {
    console.error('[dashboard] karşılaştırma yüklenemedi:', err.message);
    card.style.display = 'none';
  }
}

function renderComparison(data) {
  const card    = document.getElementById('individualComparisonCard');
  const badgeEl = document.getElementById('comparisonBadge');
  const content = document.getElementById('comparisonContent');
  if (!card || !content) return;

  if (!data.comparisonAvailable) {
    // Yeterli veri yok — sade bilgilendirme, hata görünümü değil
    if (badgeEl) badgeEl.style.display = 'none';
    content.innerHTML = `
      <p style="font-size:14px; color:var(--color-text-muted); margin:0">
        ${data.message}
      </p>
    `;
    return;
  }

  // Rozet stilini uygula
  const style = BADGE_STYLES[data.badge] ?? BADGE_STYLES['İyi'];
  if (badgeEl) {
    badgeEl.textContent            = data.badge;
    badgeEl.style.color            = style.color;
    badgeEl.style.backgroundColor  = style.bg;
    badgeEl.style.borderColor      = style.color;
  }

  content.innerHTML = `
    <p style="font-size:14px; margin:0 0 12px; opacity:0.9">${data.message}</p>
    <p style="font-size:13px; color:var(--color-text-muted); margin:0 0 14px">${data.badgeDescription}</p>

    <div style="background:var(--color-border);border-radius:8px;height:8px;overflow:hidden;margin-bottom:10px">
      <div style="
        width:${data.percentile}%;
        height:100%;
        background:${style.color};
        border-radius:8px;
        transition:width 0.8s ease;
      "></div>
    </div>

    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-muted)">
      <span>%${data.percentile} daha iyi</span>
      <span>${data.userTotalEmission.toFixed(1)} kg CO₂e &nbsp;·&nbsp; ${data.totalIndividualUsers} bireysel kullanıcı</span>
    </div>
  `;
}

