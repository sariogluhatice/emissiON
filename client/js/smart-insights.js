import { emissionService } from './api/emissionService.js';
import { renderLayout } from './layout.js';

const user = renderLayout({ activeNav: 'nav-insights' });
if (!user) throw new Error('redirect');

async function loadSmartInsights() {
  const predictionEl = document.getElementById('predictionContent');
  const trendEl = document.getElementById('trendContent');
  const recEl = document.getElementById('recommendationContent');

  try {
    const res = await emissionService.getAll();
    const emissionsArray = res.records || [];
    // Veri parmak izini sadece kayıt sayısına göre değil, toplam miktara göre hesapla (Daha güvenli)
    const dataFingerprint = emissionsArray.reduce((sum, r) => sum + Number(r.amount), 0).toFixed(2);

    const cachedFingerprint = localStorage.getItem('ai_insights_fingerprint');
    const cachedPrediction = localStorage.getItem('ai_insights_prediction');
    const cachedTrend = localStorage.getItem('ai_insights_trend');

    // Her zaman en taze AI analizini getir (Tavsiyelerin her seferinde değişmesi için)
    console.log('Generating fresh AI insights for recommendations...');
    const insights = await emissionService.getSmartInsights();

    // Helper to cap sentences to exactly 2 for ultra-clean readability
    const capToTwoSentences = (text) => {
      if (!text) return '';
      // Split by sentence endings (. ! ?)
      const sentences = text.split(/(?<=[.!?])\s+/);
      const valid = sentences.filter(s => s.trim().length > 3).slice(0, 2);
      return valid.join(' ');
    };

    // Parse Prediction safely
    let predictionText = insights.prediction || "Tahmin yüklenemedi.";
    if (predictionText && typeof predictionText === 'object') {
      const pChange = predictionText.emisyon_değişimi || predictionText.emisyon_degisimi || '';
      const pSteps = predictionText.stratejik_adımlar || predictionText.stratejik_adimlar || predictionText.tetikleyen_kategoriler || '';
      if (pChange || pSteps) {
        predictionText = `${pChange} ${pSteps}`.trim();
      } else {
        const values = Object.values(predictionText).filter(v => typeof v === 'string');
        predictionText = values.length > 0 ? values.join(' ') : JSON.stringify(predictionText);
      }
    }
    predictionText = capToTwoSentences(predictionText);

    // Parse Trend safely
    let trendText = insights.trend_summary || "Trend yüklenemedi.";
    if (trendText && typeof trendText === 'object') {
      const tHighest = trendText.en_yüksek_emisyon || trendText.en_yuksek_emisyon || '';
      const tTrend = trendText.emisyon_değişim_trendi || trendText.emisyon_degisim_trendi || trendText.trend_analiz || '';
      if (tHighest || tTrend) {
        trendText = `${tHighest} ${tTrend}`.trim();
      } else {
        const values = Object.values(trendText).filter(v => typeof v === 'string');
        trendText = values.length > 0 ? values.join(' ') : JSON.stringify(trendText);
      }
    }
    trendText = capToTwoSentences(trendText);

    // Veri değişse de değişmese de her zaman en taze AI analizini hafızaya kaydet ve göster
    localStorage.setItem('ai_insights_fingerprint', dataFingerprint);
    localStorage.setItem('ai_insights_prediction', predictionText);
    localStorage.setItem('ai_insights_trend', trendText);

    // Render Prediction
    predictionEl.innerHTML = `<p class="prediction-value">${predictionText}</p>`;

    // Render Trend
    trendEl.innerHTML = `<p>${trendText}</p>`;

    // Render Recommendations
    if (insights.recommendations && Array.isArray(insights.recommendations) && insights.recommendations.length > 0) {
      const listHtml = insights.recommendations.map(rec => {
        let title = '';
        let body = '';
        let financial = '';
        
        if (rec && typeof rec === 'object') {
          if (rec.kategori) {
            title = rec.kategori;
            body = rec.tasarruf || rec.text || rec.recommendation || rec.step || '';
            financial = rec.finansal_fayda || '';
          } else {
            body = rec.text || rec.recommendation || rec.step || JSON.stringify(rec);
          }
        } else {
          body = rec;
        }

        const titleHtml = title ? `<strong style="color: var(--color-primary); display: block; margin-bottom: 4px; font-size: 14px;">${title}</strong>` : '';
        const financialHtml = financial ? `<div style="font-size: 11.5px; color: #10b981; margin-top: 6px; font-weight: 600; display: flex; align-items: center; gap: 4px;"><span>Finansal Tasarruf: ${financial}</span></div>` : '';

        return `
        <div class="recommendation-item" style="display: flex; gap: 14px; align-items: flex-start; padding: 16px 0;">
          <svg class="check-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 3px; color: var(--color-primary);">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <div style="text-align: left;">
            ${titleHtml}
            <span style="font-size: 13.5px; line-height: 1.6; color: var(--color-text);">${body}</span>
            ${financialHtml}
          </div>
        </div>
        `;
      }).join('');
      recEl.innerHTML = `<div class="recommendation-list">${listHtml}</div>`;
    } else {
      recEl.innerHTML = '<p>Şu an için özel bir öneri oluşturulamadı.</p>';
    }

    // ── Karbon Ayak İzi Analojileri Hesaplama ve Gösterimi ─────────────────────
    const totalCarbon = emissionsArray.reduce((sum, r) => sum + Number(r.amount), 0);
    
    const glacierEl = document.getElementById('glacierVal');
    const flightsEl = document.getElementById('flightsVal');
    const driveEl = document.getElementById('driveVal');
    const chargesEl = document.getElementById('chargesVal');
    const treesEl = document.getElementById('treesVal');

    if (glacierEl) {
      const glacierMelt = Math.round(totalCarbon * 3); // 1 kg CO2 = ~3 kg buzul erimesi
      glacierEl.textContent = `Yaklaşık ${glacierMelt.toLocaleString('tr-TR')} kg buzul erimesi`;
    }

    if (flightsEl) {
      const flightsCount = (totalCarbon / 350).toFixed(1); // 1 tek yön uçuş = ~350 kg CO2
      flightsEl.textContent = `İstanbul'dan Londra'ya ${flightsCount} kez uçak yolculuğu`;
    }

    if (driveEl) {
      const driveDistance = Math.round(totalCarbon / 0.12); // binek araç = ~0.12 kg CO2 / km
      driveEl.textContent = `Benzinli araçla aralıksız ${driveDistance.toLocaleString('tr-TR')} km sürüş`;
    }

    if (chargesEl) {
      const phoneCharges = Math.round(totalCarbon / 0.008); // 1 şarj = ~0.008 kg CO2
      chargesEl.textContent = `Bir telefonu tam ${phoneCharges.toLocaleString('tr-TR')} kez şarj etmek`;
    }

    if (treesEl) {
      const annualTrees = (totalCarbon / 22).toFixed(1); // 1 yetişkin ağaç = ~22 kg CO2 / yıl
      treesEl.textContent = `Temizlemek için ${annualTrees} yetişkin ağacın 1 yıllık emeği`;
    }

    const streamingEl = document.getElementById('streamingVal');
    if (streamingEl) {
      const streamingHours = Math.round(totalCarbon / 0.055); // 1 saat video = ~0.055 kg CO2
      streamingEl.textContent = `Aralıksız ${streamingHours.toLocaleString('tr-TR')} saat dizi/video izlemek`;
    }

    const burgerEl = document.getElementById('burgerVal');
    if (burgerEl) {
      const burgers = Math.round(totalCarbon / 2.5); // 1 dana hamburger = ~2.5 kg CO2
      burgerEl.textContent = `Tam ${burgers.toLocaleString('tr-TR')} adet hamburger menüsü yemek`;
    }

  } catch (err) {
    console.error('AI analizleri yüklenemedi:', err);
    predictionEl.innerHTML = '<p class="prediction-value" style="color:var(--color-error)">Bağlantı hatası: AI verilerine şu an ulaşılamıyor.</p>';
    trendEl.innerHTML = '<p style="opacity:0.7">Sistem yoğun veya çevrimdışı. Lütfen birazdan tekrar dene.</p>';
    const recEl = document.getElementById('recommendationContent');
    if (recEl) recEl.innerHTML = '<p style="opacity:0.7">Öneriler şu an hazırlanamadı.</p>';
  }
}

loadSmartInsights();
