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
    console.log('Generating fresh AI insights for trends and recommendations...');
    const insights = await emissionService.getSmartInsights();

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
    predictionEl.innerHTML = '<p>Analiz yüklenirken bir hata oluştu.</p>';
    trendEl.innerHTML = '<p>Veriler alınamadı.</p>';
    recEl.innerHTML = '<p>Lütfen daha sonra tekrar deneyin.</p>';
  }
}

loadSmartInsights();
