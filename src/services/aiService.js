/**
 * Gemini AI ile emisyon verilerini anlamlı bir kıyaslamaya dönüştüren servis.
 * Doğrudan REST API kullanarak kütüphane ve model ismi hatalarını bypass eder.
 */
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

            // Anahtarın listesinde doğrulanan en güncel model etiketi: gemini-flash-latest
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
                console.error('[AiService] API Error:', data);
                throw new Error(data.error?.message || 'API request failed');
            }

            if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                return data.candidates[0].content.parts[0].text.trim();
            }
            
            return "Karbon ayak iziniz hesaplandı, ancak şu an AI kıyaslaması yapılamıyor.";
        } catch (error) {
            console.error('[AiService.generateImpactInsight]', error.message);
            return "Karbon ayak iziniz hesaplandı, ancak şu an AI kıyaslaması yapılamıyor.";
        }
    }

    async extractUtilityBillData(ocrText) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY tanimli degil.');
        }

        const safeText = String(ocrText || '').trim();
        if (!safeText) {
            throw new Error('OCR metni bos.');
        }

        const prompt = `You are a data extraction assistant for a carbon footprint tracking system.

Your task is to extract structured data from OCR text of a utility bill and map it to the system's input fields.

Return ONLY JSON.

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

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json'
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[AiService.extractUtilityBillData] API Error:', data);
            throw new Error(data.error?.message || 'AI veri cikarma basarisiz oldu.');
        }

        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
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
}

module.exports = new AiService();
