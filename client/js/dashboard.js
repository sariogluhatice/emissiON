import { emissionService }      from './api/emissionService.js';
import { profileService }        from './api/profileService.js';
import { gamificationService }   from './api/gamificationService.js';
import { householdService }      from './api/householdService.js';
import { renderLayout }          from './layout.js';
import {
  calculateStats,
  formatDate,
  getTaskStatusLabel,
  getTaskStatusClass,
} from './utils/uiUtils.js';
import { getCategoryKey, getCategoryLabelWithEmoji } from './utils/labelUtils.js';
import { updateGlobe, updateGlobeTooltip, buildGlobeStats } from './utils/globe.js';

const user = renderLayout({ activeNav: 'nav-dashboard' });
if (!user) throw new Error('redirect');

// Gamification verisini sayfa açılır açılmaz çek (diğer API çağrılarını beklemeden)
const _gamStatsPromise = gamificationService.getStats().catch(() => null);
// Skeleton: banner'ı hemen göster, gerçek veri gelene kadar loading state
_showGamSkeleton();

const welcomeEl = document.getElementById('welcomeName');
if (welcomeEl) welcomeEl.textContent = user?.name ? user.name.split(' ')[0] : 'Misafir';

const recordList = document.getElementById('recordList');

let inflationFactor = 1.0;
let liveFuelMultiplier = null;
let recordsGlobal = [];

// Güncel Enflasyon ve Canlı Akaryakıt Fiyatlarını Çek (paralel)
(async () => {
  const [rateResult, fuelResult] = await Promise.allSettled([
    fetch('https://open.er-api.com/v6/latest/USD'),
    fetch('https://hasanadiguzel.com.tr/api/akaryakit/sehir=istanbul'),
  ]);

  // 1. Döviz kuru
  if (rateResult.status === 'fulfilled' && rateResult.value.ok) {
    try {
      const data    = await rateResult.value.json();
      const tryRate = data.rates?.TRY || 32.5;
      inflationFactor = tryRate / 32.5;
      console.log(`[inflation] Live USD/TRY rate: ${tryRate}, multiplier: ${inflationFactor.toFixed(3)}`);
    } catch { /* ignore parse error */ }
  } else {
    console.warn('[inflation] Could not fetch live rate, falling back to baseline prices.');
  }

  // 2. Akaryakıt fiyatı
  if (fuelResult.status === 'fulfilled' && fuelResult.value.ok) {
    try {
      const data      = await fuelResult.value.json();
      const districts = Object.keys(data.data || {});
      if (districts.length > 0) {
        const firstDistrict = data.data[districts[0]];
        let priceStr = '';
        for (const key in firstDistrict) {
          if (key.includes('Kursunsuz') || key.includes('95')) { priceStr = firstDistrict[key]; break; }
        }
        if (!priceStr) {
          for (const key in firstDistrict) {
            if (key.includes('Motorin')) { priceStr = firstDistrict[key]; break; }
          }
        }
        const fuelPrice = parseFloat(priceStr.replace(',', '.'));
        if (fuelPrice && fuelPrice > 20) {
          liveFuelMultiplier = fuelPrice * 0.43;
          console.log(`[fuel-api] Live fuel price: ${fuelPrice} TL, transport multiplier: ${liveFuelMultiplier.toFixed(2)}`);
        }
      }
    } catch { /* ignore parse error */ }
  } else {
    console.warn('[fuel-api] Could not fetch live fuel prices, falling back to baseline multipliers.');
  }

  // 3. Çarpanlar yüklendikten sonra eğer veriler de hazırsa maliyetleri canlı güncelle
  if (recordsGlobal.length > 0) {
    const carbonCost = calculateCarbonCost(recordsGlobal, user.role);
    const statSavings = document.getElementById('statSavings');
    if (statSavings) statSavings.textContent = Math.round(carbonCost).toLocaleString('tr-TR');
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
    if (document.getElementById('statTotal')) {
      const el = document.getElementById('statTotal');
      el.textContent = stats.month;
      const card = document.getElementById('cardTotal');
      if (card) {
        card.setAttribute('data-tooltip', `Tüm zamanlar: ${stats.total.toLocaleString('tr-TR')} kg CO₂e`);
      }
    }
    if (document.getElementById('statEntries')) document.getElementById('statEntries').textContent = stats.entries;
    if (document.getElementById('statTopCat'))  document.getElementById('statTopCat').textContent  = stats.topCat;

    // 1b. Karbon Maliyeti Hesapla (Sadece Bu Ay)
    const now = new Date();
    const monthRecords = records.filter(r => {
      const d = new Date(r.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const carbonCost = calculateCarbonCost(monthRecords, user.role);
    const lifetimeCost = calculateCarbonCost(records, user.role);
    if (document.getElementById('statSavings')) {
      const el = document.getElementById('statSavings');
      el.textContent = Math.round(carbonCost).toLocaleString('tr-TR');
      const card = document.getElementById('cardSavings');
      if (card) {
        card.setAttribute('data-tooltip', `Tüm zamanlar: ${Math.round(lifetimeCost).toLocaleString('tr-TR')} TL`);
      }
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

    // 5. Gamification & Rozetler (promise zaten başlatıldı, sadece bekle)
    try {
      const gamData = await _gamStatsPromise;
      if (gamData?.data) renderGamification(gamData.data);
      else _clearGamSkeleton();
    } catch (gamErr) {
      console.warn('[gamification] getStats failed:', gamErr?.message);
      _clearGamSkeleton();
    }

    // 7. Hane Görevlerini Yükle (Yalnızca Household)
    if (user.role === 'household') {
      loadHouseholdTasks();
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
  streak_14:     'İki haftalık istikrarlı kayıt ile sarsılmaz bir çevre dostusun.',
  streak_30:     '30 günlük devasa seri — emisyon takibinde efsane oldun!',
  carbon_aware:  '300 XP biriktirerek yüksek karbon bilincine sahip olduğunu gösterdin.',
  eco_warrior:   'Seviye 5\'e ulaşarak eko-savaşçı rütbesine terfi ettin!'
};

// ── Gamification Skeleton helpers ─────────────────────────────────────────────
function _showGamSkeleton() {
  const banner = document.getElementById('gamBanner');
  if (!banner) return;
  banner.style.display = '';
  banner.dataset.loading = '1';
  const levelEl = document.getElementById('gamLevel');
  const xpText  = document.getElementById('gamXpText');
  const xpNext  = document.getElementById('gamXpNext');
  const xpFill  = document.getElementById('gamXpFill');
  if (levelEl) { levelEl.textContent = 'Yükleniyor…'; levelEl.style.opacity = '0.35'; }
  if (xpText)  { xpText.textContent  = '— XP';         xpText.style.opacity  = '0.35'; }
  if (xpNext)  xpNext.textContent   = '';
  if (xpFill)  xpFill.style.width   = '0%';
}

function _clearGamSkeleton() {
  const banner = document.getElementById('gamBanner');
  if (banner) banner.style.display = 'none';
}

// ── Gamification Widget ───────────────────────────────────────────────────────
function renderGamification(stats) {
  const banner = document.getElementById('gamBanner');
  if (banner) {
    banner.style.display = '';
    delete banner.dataset.loading;
    const streakNum   = document.getElementById('gamStreakNum');
    const streakLabel = document.getElementById('gamStreakLabel');
    const levelEl     = document.getElementById('gamLevel');
    const xpText      = document.getElementById('gamXpText');
    const xpFill      = document.getElementById('gamXpFill');
    const xpNext      = document.getElementById('gamXpNext');
    if (streakNum)   streakNum.textContent      = stats.streak;
    if (streakLabel) streakLabel.textContent    = 'Günlük Seri';
    if (levelEl) {
      levelEl.textContent = `Seviye ${stats.level}`;
      levelEl.style.opacity = '';
    }
    if (xpText) {
      xpText.textContent = `${stats.totalXp} / ${stats.nextLevelXp} XP`;
      xpText.style.opacity = '';
    }
    if (xpFill) {
      requestAnimationFrame(() => { xpFill.style.width = `${stats.progressPercent}%`; });
    }
    if (xpNext) {
      xpNext.textContent = stats.xpToNextLevel > 0
        ? `Sonraki seviyeye ${stats.xpToNextLevel} XP kaldı`
        : 'Maksimum seviyeye ulaştın!';
    }
  }

  // Topbar widgets
  const tbStreak = document.getElementById('topbarStreakWidget');
  const tbCount  = document.getElementById('topbarStreakCount');
  const tbXp     = document.getElementById('topbarXpWidget');
  const tbLevel  = document.getElementById('topbarLevel');
  const tbFill   = document.getElementById('topbarXpFill');
  if (tbStreak && stats.streak > 0) {
    tbStreak.style.display = 'flex';
    if (tbCount) tbCount.textContent = stats.streak;
  }
  if (tbXp) {
    tbXp.style.display = 'flex';
    tbXp.title = `${stats.totalXp} XP • Sonraki seviye için ${stats.xpToNextLevel} XP`;
    if (tbLevel) tbLevel.textContent = `Sv.${stats.level}`;
    if (tbFill)  requestAnimationFrame(() => { tbFill.style.width = `${stats.progressPercent}%`; });
  }

  // Daily reminder
  const reminder = document.getElementById('dailyReminder');
  if (reminder) {
    const todayKey = `gam_logged_${new Date().toISOString().slice(0,10)}`;
    const loggedToday = localStorage.getItem(todayKey) === '1';
    if (!loggedToday && stats.streak > 0) {
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
    const BADGE_SVG_ICONS = {
      earth_friend: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
      first_step:   '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
      data_pro:     '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
      data_expert:  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
      streak_3:     '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
      streak_7:     '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
      streak_14:    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>',
      streak_30:    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 3.84-10.06M15 12l3 3a22 22 0 0 0-10.06-3.84"/><path d="M9 11l6 6"/><path d="M22 2s-1.5 5-2 5-5-1.5-5-2"/></svg>',
      carbon_aware: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      eco_warrior:  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2-1 4-2 7-2 2.5 0 4.5 1 6.5 2a1 1 0 0 1 1 1v7z"/><path d="m9 12 2 2 4-4"/></svg>'
    };

    badgesList.innerHTML = '';
    [...earned, ...unearned].forEach(b => {
      const el = document.createElement('div');
      el.className = `badge-item${b.earned ? ' badge-earned' : ' badge-locked'}`;
      const desc = b.earned
        ? (BADGE_DESC[b.id] || '')
        : 'Henüz kazanılmadı';
        
      const uiIcon = BADGE_SVG_ICONS[b.id] || '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
      
      el.innerHTML = `
        <div class="badge-icon">${uiIcon}</div>
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

// Yalnızca bireysel kullanıcılar için karşılaştırma kartını yükle
if (user.role === 'individual') {
  loadIndividualComparison();
}

// ── Hane Görevleri ────────────────────────────────────────────────────────────

async function loadHouseholdTasks() {
  const card    = document.getElementById('householdTasksCard');
  const listEl  = document.getElementById('hhTasksList');
  if (!card || !listEl) return;

  try {
    const res   = await householdService.getDashboard();
    const tasks = res.data?.dashboard?.recent_tasks ?? [];

    card.style.display = 'block';

    if (!tasks.length) {
      listEl.innerHTML = `
        <p style="font-size:13px;color:var(--color-text-muted);margin:0;padding:8px 0;">
          Henüz görev oluşturulmadı.
          <a href="household-tasks.html" style="color:var(--color-primary);text-decoration:underline;">Görev ekle →</a>
        </p>`;
      return;
    }

    const STATUS_COLORS = {
      pending:     { bg: 'var(--color-warning-soft)',  text: '#92400e'              },
      in_progress: { bg: 'var(--color-info-soft)',     text: '#1e40af'              },
      completed:   { bg: 'var(--color-success-soft)',  text: 'var(--color-primary-dark)' },
      cancelled:   { bg: '#f1f5f9',                    text: '#64748b'              },
    };

    listEl.innerHTML = tasks.map(t => {
      const sc       = STATUS_COLORS[t.status] || STATUS_COLORS.pending;
      const assignee = t.assigned_to_name ? `👤 ${t.assigned_to_name}` : '🏠 Tüm Hane';
      const due      = t.due_date
        ? `<span style="font-size:11px;color:var(--color-text-muted);">Son: ${formatDate(t.due_date)}</span>`
        : '';
      const dim      = (t.status === 'completed' || t.status === 'cancelled') ? 'opacity:0.6;' : '';

      return `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;
                    gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border);${dim}">
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:var(--color-text);
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.title}</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px;">${assignee}</div>
            ${due}
          </div>
          <span style="flex-shrink:0;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;
                       background:${sc.bg};color:${sc.text};white-space:nowrap;">
            ${getTaskStatusLabel(t.status)}
          </span>
        </div>`;
    }).join('') + `
      <div style="padding-top:10px;text-align:right;">
        <a href="household-tasks.html"
           style="font-size:12px;color:var(--color-primary);text-decoration:none;font-weight:600;">
          Tüm Görevleri Gör →
        </a>
      </div>`;
  } catch (err) {
    console.warn('[dashboard] loadHouseholdTasks failed:', err);
    if (err.message?.includes('üye olmanız') || err.message?.includes('Hane bulunamadı') || err.message?.includes('yetkiniz yok')) {
      card.style.display = 'block';
      listEl.innerHTML = `
        <div style="text-align:center;padding:24px 12px;background:rgba(0,0,0,0.02);border-radius:12px;border:1px dashed var(--color-border);">
          <span style="font-size:32px;display:block;margin-bottom:8px;">🏠</span>
          <p style="font-size:13px;color:var(--color-text-muted);margin:0 0 14px;line-height:1.5;">
            Henüz bir haneye katılmadınız veya yeni bir hane oluşturmadınız. Hane görevlerini ve takibini etkinleştirmek için lütfen hanenizi oluşturun veya bir davet kodu ile katılın.
          </p>
          <a href="household.html" class="btn-primary" style="display:inline-block;font-size:12px;padding:8px 16px;text-decoration:none;border-radius:8px;">
            Hanemi Kur / Katıl →
          </a>
        </div>`;
    } else {
      card.style.display = 'none';
    }
  }
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

