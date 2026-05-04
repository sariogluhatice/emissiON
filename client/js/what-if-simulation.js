import { renderLayout } from './layout.js';
import { showToast }    from './utils/uiUtils.js';
import { ApiClient }    from './api/apiClient.js';
import { updateGlobe, buildGlobeStats } from './utils/globe.js';

const user = renderLayout({ activeNav: 'nav-whatif', title: 'What-if Simülasyon' });
if (!user) throw new Error('redirect');

const api = new ApiClient();

// ── DOM referansları ──────────────────────────────────────────────────────────
const simBtn        = document.getElementById('simBtn');
const simCategory   = document.getElementById('simCategory');
const simReduction  = document.getElementById('simReduction');
const simPeriod     = document.getElementById('simPeriod');
const simError      = document.getElementById('simError');
const simResultCard = document.getElementById('simResultCard');
const simResultBody = document.getElementById('simResultBody');
const simBadge      = document.getElementById('simBadge');
const simNoDataCard = document.getElementById('simNoDataCard');
const simNoDataMsg  = document.getElementById('simNoDataMsg');

// ── Sayfa yüklenince: Mevcut durumu gösteren globu doldur ─────────────────────
let _allTimeTotal = 0; // Toplam veriyi saklarız

(async () => {
  try {
    const { records } = await api.get('/emissions');
    const gs = buildGlobeStats(records);
    _allTimeTotal = gs.total;

    // 🌍 Dashboard ile aynı: "Şu Anki Durum" dünyası "Bu Ayki" veriyi göstermeli
    updateGlobe(gs.currentMonth, {
      containerId: 'globeCurrentContainer',
      labelId:     'globeCurrentLabel',
      textId:      'globeCurrentText',
    });
  } catch (e) {
    console.warn('[what-if] globe init error:', e.message);
  }
})();


// ── Hata mesajı göster / gizle ────────────────────────────────────────────────
function showError(msg) {
    simError.textContent    = msg;
    simError.style.display  = msg ? 'block' : 'none';
}

// ── Girdi doğrulaması ─────────────────────────────────────────────────────────
function validateInputs() {
    const pct = Number(simReduction.value);
    if (!simReduction.value || !Number.isFinite(pct) || pct < 1 || pct > 100) {
        showError('Azaltma oranı 1 ile 100 arasında bir sayı olmalıdır.');
        return false;
    }
    showError('');
    return true;
}

// ── Sonuç kartını gizle ───────────────────────────────────────────────────────
function hideResults() {
    simResultCard.style.display  = 'none';
    simNoDataCard.style.display  = 'none';
}

// ── "Veri yok" kartını göster ─────────────────────────────────────────────────
function showNoData(message) {
    simNoDataCard.style.display = '';
    simNoDataMsg.textContent    = message;
    simResultCard.style.display = 'none';
}

// ── Azaltım oranına göre rozet renklendir ─────────────────────────────────────
function getBadgeStyle(reductionPercent) {
    if (reductionPercent >= 30) return { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Yüksek Etki' };
    if (reductionPercent >= 15) return { color: '#00d27f', bg: 'rgba(0,210,127,0.12)',  label: 'Orta Etki'   };
    return                             { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Düşük Etki'  };
}

// ── Simülasyon sonucunu render et ─────────────────────────────────────────────
function renderResult(data) {
    simResultCard.style.display = '';
    simNoDataCard.style.display = 'none';

    const bs = getBadgeStyle(data.reductionPercent);
    simBadge.textContent           = bs.label;
    simBadge.style.color           = bs.color;
    simBadge.style.backgroundColor = bs.bg;
    simBadge.style.borderColor     = bs.color;

    // Karşılaştırma çubuğu: simülasyon sonrası / mevcut oranı
    const barPct = data.currentEmission > 0
        ? Math.round((data.simulatedEmission / data.currentEmission) * 100)
        : 0;

    simResultBody.innerHTML = `
        <div class="sim-result-grid">
            <div class="sim-stat current">
                <span class="sim-stat-label">Mevcut Emisyon</span>
                <span class="sim-stat-value">${data.currentEmission.toFixed(2)}</span>
                <span class="sim-stat-unit">kg CO₂e · ${data.periodLabel}</span>
            </div>
            <div class="sim-stat simulated">
                <span class="sim-stat-label">Simülasyon Sonrası</span>
                <span class="sim-stat-value">${data.simulatedEmission.toFixed(2)}</span>
                <span class="sim-stat-unit">kg CO₂e · ${data.periodLabel}</span>
            </div>
            <div class="sim-stat reduction">
                <span class="sim-stat-label">Azaltım Miktarı</span>
                <span class="sim-stat-value">${data.reducedAmount.toFixed(2)}</span>
                <span class="sim-stat-unit">kg CO₂e tasarruf</span>
            </div>
            <div class="sim-stat" style="border-color:rgba(0,210,127,0.3)">
                <span class="sim-stat-label">Azaltım Oranı</span>
                <span class="sim-stat-value" style="color:var(--color-primary,#00d27f)">%${data.reductionPercent}</span>
                <span class="sim-stat-unit">${data.categoryLabel}</span>
            </div>
        </div>

        <div class="sim-bar-wrap">
            <div class="sim-bar-base"></div>
            <div class="sim-bar-sim" style="width:${barPct}%"></div>
        </div>
        <div class="sim-bar-labels">
            <span style="color:var(--color-primary,#00d27f)">Simülasyon: ${data.simulatedEmission.toFixed(1)} kg</span>
            <span style="color:rgba(239,68,68,0.8)">Mevcut: ${data.currentEmission.toFixed(1)} kg</span>
        </div>

        <div class="sim-message">${data.message}</div>
    `;

    // 🌍 Simülasyon globunu güncelle
    // Dünyayı artık "Tüm Zamanlar" yerine "Simülasyon Yapılan Dönem" (Ay/Yıl) bazlı gösteriyoruz
    // Böylece yaptığın tasarrufun etkisi dünyada devasa görünür.
    
    // Sol taraftaki "Mevcut Durum" globunu o dönemki ham veriye göre güncelle
    updateGlobe(data.currentEmission, {
      containerId: 'globeCurrentContainer',
      labelId:     'globeCurrentLabel',
      textId:      'globeCurrentText',
    });

    // Sağ taraftaki "Simülasyon" globunu azaltılmış veriye göre güncelle
    updateGlobe(data.simulatedEmission, {
      containerId: 'globeSimContainer',
      labelId:     'globeSimLabel',
      textId:      'globeSimText',
    });
}



// ── Simülasyon gönder ─────────────────────────────────────────────────────────
async function runSimulation() {
    if (!validateInputs()) return;

    hideResults();
    simBtn.disabled    = true;
    simBtn.textContent = 'Hesaplanıyor…';

    const payload = {
        category:         simCategory.value,
        reductionPercent: Number(simReduction.value),
        period:           simPeriod.value,
    };

    try {
        const data = await api.post('/what-if-simulation', payload);

        if (!data.simulationAvailable) {
            showNoData(data.message);
            return;
        }

        renderResult(data);
    } catch (err) {
        console.error('[what-if] simülasyon hatası:', err.message);
        showToast('Hata', 'Simülasyon sırasında hata oluştu', 'error');
        showError('Simülasyon gerçekleştirilemedi. Lütfen tekrar deneyin.');
    } finally {
        simBtn.disabled    = false;
        simBtn.textContent = 'Simülasyonu Hesapla';
    }
}

// ── Event listener ────────────────────────────────────────────────────────────
simBtn.addEventListener('click', runSimulation);

// Enter tuşuyla da çalıştır
simReduction.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSimulation();
});

