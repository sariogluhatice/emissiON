import { emissionService } from './api/emissionService.js';
import { profileService }  from './api/profileService.js';
import { renderLayout } from './layout.js';
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

    // 6. Rozetleri Kontrol Et (Yalnızca Individual)
    if (user.role === 'individual') {
      renderBadges(records);
    }

  } catch (err) {
    console.error('Panel verileri yüklenemedi:', err);
  }
}

// ── Karbon Maliyeti Hesaplama (Gerçekçi Yaklaşım) ─────────────────────────────
function calculateCarbonCost(records, role) {
  // Karbon emisyonu üretmek için harcanan enerjinin (yakıt, elektrik vb.) finansal maliyeti.
  // Katsayılar: 1 kg CO2 üretmek için gereken birim enerji maliyeti (2024 TR Tahmini)
  let totalCost = 0;
  
  const multipliers = {
    'electricity': 7.2,   // 1 kg CO2 ~ 2.3 kWh electricity (mesken/ticarethane ort.)
    'natural_gas': 5.8,   // 1 kg CO2 ~ 0.5 m3 doğalgaz
    'water':       2.5,   // Pompalama ve arıtma maliyeti
    'petrol':      17.5,  // 1 kg CO2 ~ 0.43 L Benzin (40 TL/L)
    'diesel':      16.8,  // 1 kg CO2 ~ 0.40 L Motorin (42 TL/L)
    'flight':      4.5,   // Havayolu birim yakıt maliyeti (yolcu başı ort.)
    'shopping':    3.5    // Üretim ve lojistik maliyet payı
  };

  records.forEach(r => {
    const amount = parseFloat(r.amount) || 0;
    const cat    = (r.source || '').toLowerCase();
    
    let m = 3.0; // default (other)
    for (const key in multipliers) {
      if (cat.includes(key)) {
        m = multipliers[key];
        break;
      }
    }
    
    // Girdiğimiz miktar (amount) kg CO2 olduğu için direkt katsayıyla çarpıyoruz.
    // Bu bize o kg CO2'yi oluşturmak için harcanan tahmini parayı verir.
    totalCost += amount * m; 
  });

  if (role === 'company') totalCost *= 1.2; // Kurumsal genel gider payı
  return totalCost;
}

// ── Rozet Sistemi ─────────────────────────────────────────────────────────────
const BADGE_DEFS = [
  { id: 'first_step',  name: 'İlk Adım',    icon: '🌱', desc: 'Sisteme ilk emisyon kaydını ekledin.', check: (recs) => recs.length >= 1 },
  { id: 'data_pro',    name: 'Veri Ustası',  icon: '📊', desc: '5\'ten fazla kayıt ekleyerek analizini güçlendirdin.', check: (recs) => recs.length >= 5 },
  { id: 'green_commute', name: 'Yeşil Yolcu', icon: '🚲', desc: 'Ulaşım kaynaklı emisyonlarını takip ediyorsun.', check: (recs) => recs.some(r => r.source.toLowerCase().includes('ulaşım') || r.source.toLowerCase().includes('transport')) },
  { id: 'saver',       name: 'Tasarrufçu',  icon: '💰', desc: 'Enerji kullanımında farkındalık yarattın.', check: (recs) => recs.some(r => r.source.toLowerCase().includes('elektrik') || r.source.toLowerCase().includes('enerji')) },
  { id: 'earth_friend', name: 'Dünya Dostu', icon: '🌍', desc: 'Onboarding sürecini tamamlayıp profilini oluşturdun.', check: () => true }, // Zaten dashboard'daysa tamamlamıştır
];

function renderBadges(records) {
  const container = document.getElementById('badgesCard');
  const list      = document.getElementById('badgesList');
  if (!container || !list) return;

  container.style.display = 'block';
  list.innerHTML = '';

  const earned = BADGE_DEFS.filter(b => b.check(records));

  if (earned.length === 0) {
    list.innerHTML = '<p style="font-size:13px; color:var(--color-text-muted)">Henüz rozet kazanılmadı. Veri ekleyerek başlayın!</p>';
    return;
  }

  earned.forEach(b => {
    const el = document.createElement('div');
    el.className = 'badge-item';
    el.style = `
      flex: 0 0 auto;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px;
      width: 120px;
      text-align: center;
      transition: transform 0.3s ease;
      cursor: help;
    `;
    el.title = b.desc;
    el.innerHTML = `
      <div style="font-size: 32px; margin-bottom: 8px;">${b.icon}</div>
      <div style="font-size: 12px; font-weight: 600; color: #f59e0b;">${b.name}</div>
    `;
    el.onmouseover = () => el.style.transform = 'translateY(-5px)';
    el.onmouseout  = () => el.style.transform = 'translateY(0)';
    list.appendChild(el);
  });
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
      deleteBtn.textContent = 'Siliniyor...';
      
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
    const cat = e.source || 'Other';
    categories[cat] = (categories[cat] || 0) + parseFloat(e.amount);
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
        // Daha modern, pastel ve göz yormayan Premium renk paleti
        backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#6366f1', '#8b5cf6'],
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
  doc.text(`Sirket: ${user.name}`, 14, 52);
  doc.text(`Rapor No: ${Math.random().toString(36).substr(2, 9).toUpperCase()}`, 14, 58);
  doc.text(`Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')}`, 14, 64);
  
  // AI Spotlight Analysis
  const aiText = document.getElementById('aiSpotlightText')?.textContent;
  let nextY = 85;
  if (aiText && !aiText.includes('bekle')) {
    doc.setFontSize(12);
    doc.setTextColor(16, 185, 129);
    doc.text('Yapay Zeka Analiz Ozeti', 14, 78);
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
  doc.text('Emisyon Performans Gostergeleri', 14, nextY);
  
  doc.autoTable({
    startY: nextY + 4,
    head: [['Metrik', 'Deger', 'Birim']],
    body: [
      ['Toplam Karbon Ayak Izi', stats.total, 'kg CO2e'],
      ['Aktif Emisyon Kaydi', stats.entries, 'Adet'],
      ['Kritik Emisyon Kaynagi', stats.topCat, '-'],
      ['Tahmini Karbon Maliyeti', `${Math.round(totalCost).toLocaleString('tr-TR')} TL`, 'TRY']
    ],
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129] },
    styles: { font: "helvetica", fontSize: 9 }
  });

  // Detailed Records List
  doc.setFontSize(12);
  doc.text('Detayli Faaliyet Dokumu', 14, doc.lastAutoTable.finalY + 15);

  const tableData = records.sort((a,b) => new Date(b.date) - new Date(a.date)).map(r => [
    new Date(r.date).toLocaleDateString('tr-TR'),
    r.source,
    r.description || 'Aciklama yok',
    `${parseFloat(r.amount).toFixed(2)} kg`
  ]);

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 20,
    head: [['Tarih', 'Kategori', 'Aciklama', 'Miktar']],
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
    doc.text(`Sayfa ${i} / ${pageCount} - emissiON Digital Twin Report`, 14, doc.internal.pageSize.height - 10);
    doc.text('Bu rapor otomatik olarak olusturulmustur.', 140, doc.internal.pageSize.height - 10);
  }

  doc.save(`Sustainability_Report_${user.name.replace(/\s+/g, '_')}.pdf`);
}


// Yalnızca bireysel kullanıcılar için karşılaştırma kartını yükle
if (user.role === 'individual') {
  loadIndividualComparison();
}

// ── Bireysel Karşılaştırma ────────────────────────────────────────────────────

const BADGE_STYLES = {
  'Çok iyi':          { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  'İyi':              { color: '#00d27f', bg: 'rgba(0,210,127,0.12)'  },
  'Geliştirilebilir': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
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

    <div style="background:var(--color-bg-alt,#151a1f);border-radius:8px;height:8px;overflow:hidden;margin-bottom:10px">
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

