import { emissionService }      from './api/emissionService.js';
import { profileService }        from './api/profileService.js';
import { gamificationService }   from './api/gamificationService.js';
import { renderLayout }          from './layout.js';
import {
  calculateStats,
  categoryEmoji,
  formatDate,
} from './utils/uiUtils.js';
import { updateGlobe, updateGlobeTooltip, buildGlobeStats } from './utils/globe.js';

const user = renderLayout({ activeNav: 'nav-dashboard', title: 'Özet Panel' });
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
      <span class="record-source">${categoryEmoji(record.source)} ${record.source}</span>
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
      if (spotlightEl && insights.prediction) {
        spotlightEl.textContent = insights.prediction;
      }
    } catch {
      // Spotlight hatası kritik değil, sessizce geçebiliriz
      document.getElementById('aiSpotlightText').textContent = "Tahmin verileri şu an alınamıyor.";
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
    const cat    = (r.source || '').toLowerCase();
    
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
      el.innerHTML = `
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${b.name}</div>`;
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

const CHART_CATEGORY_LABELS = {
  energy:    '⚡ Enerji',
  water:     '💧 Su',
  gas:       '🔥 Doğalgaz',
  transport: '🚗 Ulaşım',
  materials: '📦 Malzeme',
  waste:     '🗑️ Atık',
  food:      '🍽️ Gıda',
  shopping:  '🛍️ Alışveriş',
};

function initChart(data) {
  const ctx = document.getElementById('emissionChart');
  if (!ctx) return;

  const categories = {};
  data.forEach(e => {
    const label = e.category
      ? (CHART_CATEGORY_LABELS[e.category] || e.category)
      : (e.source || 'Diğer');
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
      const { records } = await emissionService.getAll();
      generateCorporateReport(records, user);
    });
  }
}

function generateCorporateReport(records, user) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  // Header & Brand Bar
  doc.setFillColor(16, 185, 129); // Brand Green
  doc.rect(0, 0, 210, 15, 'F');
  
  doc.setFontSize(22);
  doc.setTextColor(16, 185, 129);
  doc.setFont("helvetica", "bold");
  doc.text('emissiON', 14, 30);
  
  doc.setFontSize(14);
  doc.setTextColor(80);
  doc.setFont("helvetica", "normal");
  doc.text('Kurumsal Sürdürülebilirlik ve Karbon Analizi', 14, 38);
  
  doc.setDrawColor(200);
  doc.line(14, 42, 196, 42);
  
  // Company & Report Info
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Şirket: ${user.name}`, 14, 52);
  doc.text(`Rapor No: ${Math.random().toString(36).substr(2, 9).toUpperCase()}`, 14, 58);
  doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 64);
  
  // AI Spotlight Analysis
  const aiText = document.getElementById('aiSpotlightText')?.textContent;
  let nextY = 85;
  if (aiText && !aiText.includes('bekle')) {
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129);
    doc.text('Yapay Zeka Analiz Özeti', 14, 78);
    doc.setFontSize(10);
    doc.setTextColor(50);
    const splitText = doc.splitTextToSize(aiText, 182);
    doc.text(splitText, 14, 84);
    nextY = 84 + (splitText.length * 5) + 10;
  }

  // Summary Metrics Table
  const stats = calculateStats(records);
  const totalCost = calculateCarbonCost(records, user.role);
  
  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text('Emisyon Performans Göstergeleri', 14, nextY);
  
  doc.autoTable({
    startY: nextY + 4,
    head: [['Metrik', 'Değer', 'Birim']],
    body: [
      ['Toplam Karbon Ayak İzi', stats.total, 'kg CO2e'],
      ['Aktif Emisyon Kaydı', stats.entries, 'Adet'],
      ['Kritik Emisyon Kaynağı', stats.topCat, '-'],
      ['Tahmini Karbon Maliyeti', `${Math.round(totalCost).toLocaleString('tr-TR')} TL`, 'TRY']
    ],
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129] },
    styles: { font: "helvetica", fontSize: 9 }
  });

  let lastY = doc.lastAutoTable.finalY;

  // ── AB Sınırda Karbon Düzenleme Mekanizması (CBAM) Vergi Projeksiyonu (Yalnızca Şirketler) ──
  if (user.role === 'company') {
    doc.setFontSize(11);
    doc.setTextColor(16, 185, 129);
    doc.setFont("helvetica", "bold");
    doc.text('AB Sınırda Karbon Düzenleme Mekanizması (CBAM) Vergi Projeksiyonu', 14, lastY + 12);
    
    const co2Tons = stats.total / 1000;
    const cbamRateEur = 85; // 85 EUR per ton of CO2
    const cbamTaxEur = co2Tons * cbamRateEur;
    const cbamTaxTry = cbamTaxEur * 35.5; // realistic EUR to TRY rate

    doc.autoTable({
      startY: lastY + 16,
      head: [['CBAM Metriği', 'Hesaplama Oranı', 'Öngörülen Tutar']],
      body: [
        ['Toplam Karbon Tonu', 'Toplam kg CO2e / 1.000', `${co2Tons.toFixed(3)} Ton`],
        ['AB ETS Karbon Referans Bedeli', 'AB Komisyonu Sabit Birim Bedel', '85.00 EUR / Ton'],
        ['Öngörülen Yıllık Karbon Vergisi (EUR)', 'Toplam Ton x 85.00 EUR', `${cbamTaxEur.toFixed(2).toLocaleString('tr-TR')} EUR`],
        ['Tahmini SKDM Yükümlülüğü (TL)', 'EUR Tutar x 35.50 TRY/EUR', `${Math.round(cbamTaxTry).toLocaleString('tr-TR')} TL`]
      ],
      theme: 'striped',
      headStyles: { fillColor: [59, 130, 246] }, // Blue for compliance
      styles: { font: "helvetica", fontSize: 8 }
    });
    
    lastY = doc.lastAutoTable.finalY;
  }

  // Detailed Records List
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.text('Detaylı Faaliyet Dökümü', 14, lastY + 15);

  const tableData = records.sort((a,b) => new Date(b.date) - new Date(a.date)).map(r => [
    new Date(r.date).toLocaleDateString('tr-TR'),
    r.source,
    r.description || 'Açıklama yok',
    `${parseFloat(r.amount).toFixed(2)} kg`
  ]);

  doc.autoTable({
    startY: lastY + 20,
    head: [['Tarih', 'Kategori', 'Açıklama', 'Miktar']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [50, 50, 50] },
    styles: { font: "helvetica", fontSize: 8 }
  });

  // Conclusion Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Sayfa ${i} / ${pageCount} - emissiON Dijital İkiz Raporu`, 14, doc.internal.pageSize.height - 10);
    doc.text('Bu rapor otomatik olarak oluşturulmuştur.', 140, doc.internal.pageSize.height - 10);
  }

  doc.save(`Sustainability_Report_${user.name.replace(/\s+/g, '_')}.pdf`);
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

