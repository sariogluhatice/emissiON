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
  streak_30:     '30 günlük devasa seri — emisyon takibinde efsane oldun!',
  carbon_aware:  '300 XP biriktirerek yüksek karbon bilincine sahip olduğunu gösterdin.',
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
  } catch {
    // Kullanıcı henüz bir haneye katılmamış — kartı gizle
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

