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
    const dataFingerprint = emissionsArray.length.toString();

    const cachedFingerprint = localStorage.getItem('ai_insights_fingerprint');
    const cachedPrediction = localStorage.getItem('ai_insights_prediction');
    const cachedTrend = localStorage.getItem('ai_insights_trend');

    const isErrorText = (text) => {
      if (!text || text === 'undefined') return true;
      const lower = text.toLowerCase();
      return lower === 'öngörü oluşturulamadı.' ||
             lower === 'trend analizi yapılamadı.' ||
             lower === 'öneri oluşturulamadı.' ||
             lower === 'analiz şu an hazırlanamadı.' ||
             lower === 'bir hata oluştu veya kota doldu.' ||
             lower === 'ai anahtarı eksik.' ||
             lower === 'ai tavsiyeleri şu an alınamıyor.' ||
             lower.includes('şu an hazırlanamadı') ||
             lower.includes('öngörü şu an alınamadı');
    };

    const isCachedValid = !isErrorText(cachedPrediction) && !isErrorText(cachedTrend);

    console.log('Generating fresh AI insights for recommendations...');
    const insights = await emissionService.getSmartInsights();
    const isNewValid = !isErrorText(insights.prediction) && !isErrorText(insights.trend_summary);

    if (cachedFingerprint === dataFingerprint && isCachedValid) {
      console.log('Keeping Future Prediction and Trend frozen from cache.');
      insights.prediction = cachedPrediction;
      insights.trend_summary = cachedTrend;
    } else if (isNewValid) {
      console.log('Data changed or cache invalid! Saving new Future Prediction and Trend to cache.');
      localStorage.setItem('ai_insights_fingerprint', dataFingerprint);
      localStorage.setItem('ai_insights_prediction', insights.prediction);
      localStorage.setItem('ai_insights_trend', insights.trend_summary);
    } else if (cachedFingerprint === dataFingerprint && isCachedValid) {
      // Sadece veriler DEĞİŞMEDİYSE ve yeni istek başarısız olduysa eski cache'e düş. 
      // Veri değiştiyse eski analizi gösterme, başarısızlık mesajını göster.
      console.log('New insights invalid. Falling back to existing valid cache because data is unchanged.');
      insights.prediction = cachedPrediction;
      insights.trend_summary = cachedTrend;
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
    
    const cachedFingerprint = localStorage.getItem('ai_insights_fingerprint');
    const cachedPrediction = localStorage.getItem('ai_insights_prediction');
    const cachedTrend = localStorage.getItem('ai_insights_trend');
    
    // Yalnızca veri değişmemişse cache göster (yeni veri girildiğinde eski analizi göstermemek için)
    // dataFingerprint try bloğu içinde tanımlı olduğu için, eğer oraya kadar gelebildiyse kullan, 
    // ancak scope dışında olduğu için tekrar çekmemiz veya globalde tanımlı olması gerekebilir.
    // Try bloğu içinde olduğu için dataFingerprint burada mevcut değil. Güvenli yaklaşım, cache göstermemek.
    
    predictionEl.innerHTML = '<p>Analiz yüklenirken bir hata oluştu.</p>';
    trendEl.innerHTML = '<p>Veriler alınamadı.</p>';
    recEl.innerHTML = '<p>Lütfen daha sonra tekrar deneyin veya kotanızı kontrol edin.</p>';
  }
}

loadSmartInsights();
