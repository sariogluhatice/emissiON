import { TokenManager } from './api/tokenManager.js';
import { emissionService } from './api/emissionService.js';
import {
  getCurrentUser,
  renderTopbarUser,
  bindLogout
} from './utils/uiUtils.js';

// Koruma
if (!TokenManager.exists()) {
  window.location.href = 'login.html';
}

const user = getCurrentUser();
renderTopbarUser(user);
bindLogout();

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

    // Veri DEĞİŞMEDİYSE: Öngörü ve Trendi dondur, sadece tavsiyeleri taze göster
    if (cachedFingerprint === dataFingerprint && cachedPrediction && cachedTrend) {
      insights.prediction = cachedPrediction;
      insights.trend_summary = cachedTrend;
    } else {
      // Veri DEĞİŞTİYSE: Yeni öngörü ve trendleri hafızaya kaydet
      localStorage.setItem('ai_insights_fingerprint', dataFingerprint);
      localStorage.setItem('ai_insights_prediction', insights.prediction);
      localStorage.setItem('ai_insights_trend', insights.trend_summary);
    }

    // Render Prediction
    predictionEl.innerHTML = `<p class="prediction-value">${insights.prediction}</p>`;

    // Render Trend
    trendEl.innerHTML = `<p>${insights.trend_summary}</p>`;

    // Render Recommendations
    if (insights.recommendations && Array.isArray(insights.recommendations) && insights.recommendations.length > 0) {
      const listHtml = insights.recommendations.map(rec => `
        <div class="recommendation-item">
          <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>${rec}</span>
        </div>
      `).join('');
      recEl.innerHTML = `<div class="recommendation-list">${listHtml}</div>`;
    } else {
      recEl.innerHTML = '<p>Şu an için özel bir öneri oluşturulamadı.</p>';
    }

  } catch (err) {
    console.error('AI analizleri yüklenemedi:', err);
    predictionEl.innerHTML = '<p class="prediction-value" style="color:var(--color-error)">Bağlantı hatası: AI verilerine şu an ulaşılamıyor.</p>';
    trendEl.innerHTML = '<p style="opacity:0.7">Sistem yoğun veya çevrimdışı. Lütfen birazdan tekrar dene.</p>';
    recEl.innerHTML = '<p style="opacity:0.7">Öneriler şu an hazırlanamadı.</p>';
  }
}

loadSmartInsights();
