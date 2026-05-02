
class AiService {
    async generateImpactInsight(activity, amount, unit, category = 'Genel') {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return "AI anahtarı eksik, bu yüzden kıyaslama yapılamadı.";
        }

        try {
            const prompt = `Görevin: Bir emisyon uzmanı olarak karbon verilerini günlük hayattan kıyaslamalara dönüştürmek ve azaltma önerisi sunmak.
            Veri: "${category}" kategorisindeki "${activity}" aktivitesi sonucu ${amount.toFixed(2)} ${unit} CO2 salınımı.
            
            Talimatlar:
            1. ANALOGY: Bu miktarın etkisini SU TÜKETİMİ, HAVA KALİTESİ, ENERJİ TASARRUFU veya ERİYEN BUZULLAR gibi farklı alanlardan somut bir örnekle kıyaslayan TEK BİR CÜMLE kur. Sadece ağaç örneğine bağlı kalma.
            2. SUGGESTION: Kullanıcıya bu emisyonu azaltması için "${category}" kategorisine özel pratik ve teknik bir tavsiye veren TEK BİR CÜMLE kur.
            
            Format:
            Insight: [Kıyaslama cümlesi]
            Tip: [Öneri cümlesi]
            
            Kısıtlamalar: Sohbet etme, sadece bu iki satırı döndür. Maksimum toplam 280 karakter.
            Dil: Türkçe.`;

            // Anahtarın listesinde doğrulanan en güncel model etiketi: gemini-1.5-flash
            // 'v1beta' versiyonu bu anahtar için zorunlu görünüyor.
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('[AiService.generateImpactInsight] Gemini API Error:', JSON.stringify(data));
                throw new Error(data.error?.message || 'API request failed');
            }

            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                return data.candidates[0].content.parts[0].text.trim();
            }
            
            return "Karbon ayak iziniz hesaplandı, ancak su an AI kıyaslaması oluşturulamadı (boş yanıt).";
        } catch (error) {
            console.error('[AiService.generateImpactInsight] EXCEPTION:', error.message);
            return "Karbon ayak iziniz hesaplandı, ancak şu an AI kıyaslaması yapılamıyor (API Hatası).";
        }
    }

    async extractUtilityBillData(ocrText) {
        const safeText = String(ocrText || '').trim();
        if (!safeText) {
            throw new Error('OCR metni bos.');
        }

        const prompt = `You are a data extraction assistant for a carbon footprint tracking system.

Your task is to extract structured data from OCR text of a utility bill and map it to the system's input fields.

Return ONLY valid JSON, no explanation, no markdown.

Fields to extract:
- category (electricity, water, natural_gas)
- activity_type (simple normalized label)
- quantity (numeric consumption value)
- unit (kWh, m3, l, etc.)
- date (YYYY-MM if possible)

Rules:
- Map bill type to category:
  electricity -> electricity
  water -> water
  gas -> natural_gas
- Extract TOTAL consumption value (not daily or partial)
- Normalize units (kWh, m3, l)
- If multiple dates exist, choose billing period
- If unsure, return null for that field
- Do NOT explain anything

OCR TEXT:
"""
${safeText.slice(0, 12000)}
"""`;

        const keys = [
            process.env.GEMINI_API_KEY2,
            process.env.GEMINI_API_KEY3,
            process.env.GEMINI_API_KEY,
        ].filter(Boolean);

        if (!keys.length) throw new Error('Hic Gemini API anahtari tanimli degil.');

        let rawText = null;
        let lastError;
        for (const key of keys) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
                    }),
                });
                const data = await res.json();
                if (!res.ok) {
                    const msg = data.error?.message || 'Gemini API hatasi';
                    if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) { lastError = new Error(msg); continue; }
                    throw new Error(msg);
                }
                rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (rawText) break;
            } catch (err) {
                if (err.message.includes('RESOURCE_EXHAUSTED') || err.message.includes('quota')) { lastError = err; continue; }
                throw err;
            }
        }

        if (!rawText) throw lastError || new Error('AI yaniti bos geldi.');
        if (!rawText) {
            throw new Error('AI yaniti bos geldi.');
        }

        const cleaned = rawText
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch (err) {
            console.error('[AiService.extractUtilityBillData] Parse Error:', cleaned);
            throw new Error('AI yaniti JSON formatinda degil.');
        }

        return {
            category: parsed?.category ?? null,
            activity_type: parsed?.activity_type ?? null,
            quantity: typeof parsed?.quantity === 'number' ? parsed.quantity : (parsed?.quantity ? Number(parsed.quantity) : null),
            unit: parsed?.unit ?? null,
            date: parsed?.date ?? null,
        };
    }

    /**
     * Tek bir Gemini çağrısıyla üç Smart Insights alanı üretir.
     * Tek çağrı = kota 3x daha verimli kullanımı.
     */
    async getSmartInsights(history, profile, categories = []) {
        let primaryKey = process.env.GEMINI_API_KEY2;
        let fallbackKey = process.env.GEMINI_API_KEY;
        let activeKey = primaryKey || fallbackKey;

        if (!activeKey) {
            return {
                prediction: "AI anahtarı eksik.",
                trend_summary: "AI anahtarı eksik.",
                recommendations: ["AI tavsiyeleri şu an alınamıyor."]
            };
        }

        const historyText = history.map(h => `${h.month}: ${h.total_amount} kg CO2`).join(', ');
        const categoriesText = categories.map(c => `${c.category}: ${c.total} kg CO2`).join(', ');
        const profileText = JSON.stringify(profile);

        const prompt = `Sen bir karbon ayak izi uzmanısın. Kullanıcının emisyon geçmişi, kategori dağılımı ve profiline göre tamamen ona özel ve net bir öngörü ve azaltma önerileri sunacaksın. Lütfen çok spesifik ol ve klişe önerilerden kaçın. Yanıtların ne çok kısa ne de çok uzun (destan gibi) olmalı. Özellikle en yüksek emisyon kategorisine odaklan.

Emisyon Geçmişi (Aylık): ${historyText || 'Henüz veri yok'}
Kategori Dağılımı (Toplam): ${categoriesText || 'Henüz veri yok'}
Kullanıcı Profili: ${profileText}

ZORUNLU JSON FORMATI (sadece bu JSON veri yapısını döndür):
{
  "prediction": "Gelecek ay için emisyon miktarı tahmini. Yüzdelik değişim veya miktar içersin. İki cümlelik doyurucu bir öngörü olsun. (Maksimum 200 karakter)",
  "trend_summary": "Geçmiş emisyon trendinin gidişat analizi (artış/azalış ve detaylı nedeni). 2-3 cümlelik kapsamlı ve faydalı bir özet olsun. (Maksimum 250 karakter)",
  "recommendations": [
    "Kullanıcının profiline ve geçmişine özel pratik 1. öneri. 1-2 cümlelik detaylı anlatım. (Maksimum 150 karakter)",
    "Kullanıcının yaşam tarzına uygun somut 2. öneri. 1-2 cümlelik detaylı anlatım. (Maksimum 150 karakter)",
    "Genel gidişatı iyileştirecek kolay uygulanabilir 3. öneri. 1-2 cümlelik detaylı anlatım. (Maksimum 150 karakter)"
  ]
}`;

        const makeRequest = async (key) => {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { 
                        temperature: 0.5,
                        responseMimeType: 'application/json'
                    }
                })
            });
            const data = await response.json();
            if (!response.ok) {
                const errorMsg = data.error?.message || 'Gemini API hatası';
                console.error('[AiService.getSmartInsights] API Hatası:', JSON.stringify(data));
                throw new Error(errorMsg);
            }
            return data;
        };

        try {
            console.log('[AiService.getSmartInsights] AI analizi başlatılıyor...');
            let data;
            try {
                data = await makeRequest(activeKey);
            } catch (err) {
                if ((err.message.includes('quota') || err.message.includes('Quota') || err.message.includes('RESOURCE_EXHAUSTED')) && fallbackKey && fallbackKey !== activeKey) {
                    console.warn('[AiService.getSmartInsights] Kota aşıldı! Yedek (fallback) API anahtarına geçiliyor...');
                    data = await makeRequest(fallbackKey);
                } else {
                    throw err;
                }
            }

            let resultText = data.candidates[0].content.parts[0].text;
            console.log('[AiService.getSmartInsights] AI yanıtı alındı.');

            // Markdown bloklarını temizle
            resultText = resultText
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();

            const parsed = JSON.parse(resultText);
            console.log('[AiService.getSmartInsights] Başarıyla parse edildi.');
            return {
                prediction:      parsed.prediction      || "Öngörü oluşturulamadı.",
                trend_summary:   parsed.trend_summary   || "Trend analizi yapılamadı.",
                recommendations: parsed.recommendations || ["Öneri oluşturulamadı."]
            };
        } catch (error) {
            console.error('[AiService.getSmartInsights] HATA:', error.message);
            return {
                prediction:    "Analiz şu an hazırlanamadı.",
                trend_summary: "Bir hata oluştu veya kota doldu.",
                recommendations: ["Lütfen 1-2 dakika sonra sayfayı yenileyiniz."]
            };
        }
    }
}

module.exports = new AiService();


