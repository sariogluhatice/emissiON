


class AiService {
    constructor() {
        this.groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
        this.groqModel = 'llama-3.1-8b-instant'; // Güncellenmiş ve daha hızlı model
    }

    /**
     * Helper: Groq API Çağrısı
     */
    async callGroq(prompt, isJson = false) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return null;

        try {
            const response = await fetch(this.groqUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.groqModel,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    response_format: isJson ? { type: 'json_object' } : undefined
                })
            });

            const data = await response.json();
            if (!response.ok) {
                console.error('[AiService.callGroq] Error:', data.error?.message);
                return null;
            }

            return data.choices[0]?.message?.content || null;
        } catch (error) {
            console.error('[AiService.callGroq] Exception:', error.message);
            return null;
        }
    }

    /**
     * Helper: Gemini API Çağrısı (Fallback)
     */
    async callGemini(prompt, isJson = false) {
        const keys = [
            process.env.GEMINI_API_KEY2,
            process.env.GEMINI_API_KEY3,
            process.env.GEMINI_API_KEY
        ].filter(Boolean);

        for (const key of keys) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: 0.4,
                            responseMimeType: isJson ? 'application/json' : 'text/plain'
                        }
                    })
                });

                const data = await response.json();
                if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    return data.candidates[0].content.parts[0].text;
                }
                
                const msg = data.error?.message || '';
                if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) continue;
            } catch (error) {
                continue;
            }
        }
        return null;
    }

    /**
     * 1. Küçük İçgörüler (Activity Insights)
     */
    async generateImpactInsight(activity, amount, unit, category = 'Genel') {
        const prompt = `Görevin: Karbon emisyon verisini günlük hayattan kıyaslamalara dönüştür.
        Veri: "${category}" kategorisinde "${activity}" sonucu ${amount.toFixed(2)} ${unit} CO2.
        
        Talimatlar:
        1. ANALOGY: Bu miktarı SU TÜKETİMİ, ENERJİ veya BUZULLAR gibi alanlardan somut bir örnekle kıyaslayan TEK CÜMLE kur. Sadece ağaç örneği verme.
        2. SUGGESTION: Azaltma için pratik, teknik bir tavsiye veren TEK CÜMLE kur.
        
        Format:
        Insight: [Kıyaslama]
        Tip: [Öneri]
        
        Kısıt: Maks 250 karakter. Dil: Türkçe. Sohbet etme.`;

        let response = await this.callGroq(prompt);
        if (!response) response = await this.callGemini(prompt);

        return response || "Insight: Karbon ayak iziniz hesaplandı. Tip: Verileri takip etmeye devam edin.";
    }

    /**
     * 2. OCR Fatura Veri Çıkarma
     */
    async extractUtilityBillData(ocrText) {
        const prompt = `Extract utility bill data from OCR text. Return ONLY JSON.
        Fields: category (electricity, water, natural_gas), activity_type, quantity (numeric), unit, date (YYYY-MM).
        OCR TEXT: ${ocrText.slice(0, 8000)}`;

        let response = await this.callGroq(prompt, true);
        if (!response) response = await this.callGemini(prompt, true);

        if (!response) throw new Error('AI veri çıkaramadı.');

        const cleaned = response.replace(/```json|```/gi, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            category: parsed.category || null,
            activity_type: parsed.activity_type || null,
            quantity: Number(parsed.quantity) || null,
            unit: parsed.unit || null,
            date: parsed.date || null
        };
    }

    /**
     * 3. Akıllı İçgörüler (Dashboard Analysis)
     */
    async getSmartInsights(history, profile, categories = []) {
        const historyText = history.map(h => `${h.month}: ${h.total_amount}kg`).join(', ');
        const categoriesText = categories.map(c => `${c.category}: ${c.total}kg`).join(', ');
        
        const hasData = history && history.length > 0;
        
        const prompt = `Sen kullanıcının kişisel 'Dijital Karbon İkizi' ve veri analisti uzmanısın.
        
        VERİLER:
        - Geçmiş Veriler: ${historyText || 'KESİNLİKLE VERİ YOK'}
        - Kategorik Dağılım: ${categoriesText || 'KESİNLİKLE VERİ YOK'}
        - Kullanıcı Profili: ${JSON.stringify(profile)}
        
        ZORUNLU ANALİZ KURALLARI:
        ${hasData ? `
        1. ASLA GENEL TAVSİYE VERME.
        2. Geçmiş aylardaki ${historyText} verilerine bakarak matematiksel bir ARTALIM/AZALIM trendi hesapla.
        3. Gelecek ay öngörüsünü bu trende dayandır.
        ` : `
        1. VERİ YOK: Kullanıcının henüz HİÇBİR emisyon kaydı yok. 
        2. YASAKLAR: 'Geçmişe göre', 'En yüksek kategori', 'Plastik', 'Ambalaj' veya herhangi bir spesifik kategoriden BAHSETME. Olmayan veriyi uydurma.
        3. GÖREVİN: Kullanıcıyı karşıla. Henüz veri girmediği için analiz yapılamadığını kibarca belirt. 
        4. EYLEM: Onboarding'de seçtiği '${profile?.priority_area || 'çevre'}' hedefine odaklanarak ilk kaydını (fatura yükleme veya manuel giriş) yapması için bir cümlelik motivasyon ver.
        `}
        
        ZORUNLU JSON FORMATI (SADECE JSON DÖN):
        {
          "prediction": "Veri yoksa 'Analiz için veri bekleniyor' mesajı, varsa tahmin (Maks 2 cümle)",
          "trend_summary": "Veri yoksa 'Hoş geldin' mesajı, varsa gidişat (Maks 2 cümle)",
          "recommendations": [
            "İlk veriyi girmek için bir ipucu",
            "Profiline özel bir sürdürülebilirlik tavsiyesi",
            "Sistemin nasıl çalıştığına dair küçük bir not"
          ]
        }`;

        let response = await this.callGroq(prompt, true);
        if (!response) response = await this.callGemini(prompt, true);

        if (!response) {
            return {
                prediction: "Veri yetersiz veya AI şu an meşgul.",
                trend_summary: "Gidişat takip ediliyor.",
                recommendations: ["Daha fazla veri ekleyerek analizi güçlendirin."]
            };
        }

        const cleaned = response.replace(/```json|```/gi, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            prediction: parsed.prediction || "Tahmin yapılamadı.",
            trend_summary: parsed.trend_summary || "Özet çıkarılamadı.",
            recommendations: parsed.recommendations || ["Veri eklemeye devam edin."]
        };
    }
}

module.exports = new AiService();
