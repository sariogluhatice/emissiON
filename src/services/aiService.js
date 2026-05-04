


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
        const prompt = `You are a utility bill parser. Extract structured data from OCR text.
Return ONLY valid JSON. No markdown. No explanation.

CATEGORY RULES — apply in this exact priority order:

1. If you see "satış internet üzerinden", "mağaza adı", "sipariş", "kargo", "birim fiyat",
   "ürün", "mal hizmet", "adet" → category: "shopping". Stop here.

2. "elektronik", "e-fatura", "e-arşiv", "belge tipi elektronik", "elektronik olarak iletilmiştir"
   describe the DOCUMENT FORMAT — they are NOT electricity signals. Never use them to decide
   category: "electricity".

3. Genuine electricity: kWh, aktif enerji, tesisat no, sayaç, dağıtım bedeli, enerji bedeli,
   elektrik tüketimi, elektrik faturası → category: "electricity".

4. Genuine water: su tüketimi, m³ (water), su faturası, water supply → category: "water".

5. Genuine gas: doğalgaz, sm3, gaz faturası, natural gas → category: "natural_gas".

6. Anything else (retail, e-commerce, services) → category: "shopping".

Fields to extract:
- category: "electricity" | "water" | "natural_gas" | "shopping"
- activity_type: specific activity string matching category
- quantity: numeric consumption value (kWh / m³ / litre). null for shopping.
- unit: "kWh" | "m3" | "l" | null
- date: YYYY-MM (billing period) or null

Return exactly:
{"category":null,"activity_type":null,"quantity":null,"unit":null,"date":null}

OCR TEXT: ${ocrText.slice(0, 8000)}`;

        let response = await this.callGroq(prompt, true);
        if (!response) response = await this.callGemini(prompt, true);

        if (!response) throw new Error('AI veri çıkaramadı.');

        const cleaned = response.replace(/```json|```/gi, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            category:      parsed.category      || null,
            activity_type: parsed.activity_type || null,
            quantity:      Number(parsed.quantity) || null,
            unit:          parsed.unit           || null,
            date:          parsed.date           || null
        };
    }

    /**
     * 3. Akıllı İçgörüler (Dashboard Analysis)
     */
    async getSmartInsights(history, profile, categories = []) {
        const hasData = history && history.length > 0;
        let prompt;

        if (hasData) {
            const historyText = history.map(h => `${h.month}: ${h.total_amount}kg`).join(', ');
            const categoriesText = categories.map(c => `${c.category}: ${c.total}kg`).join(', ');
            
            prompt = `Sen kullanıcının kişisel 'Dijital Karbon İkizi' ve veri analisti uzmanısın.
        
VERİLER:
- Geçmiş Emisyon Kayıtları: ${historyText}
- Kategorik Dağılım: ${categoriesText}
- Kullanıcı Profil Bilgileri (Onboarding): ${JSON.stringify(profile)}

ZORUNLU ANALİZ KURALLARI:
1. GERÇEKÇİLİK: Sadece yukarıdaki emisyon kayıtlarına ve kullanıcının profil bilgilerine dayanarak konuş. Veride olmayan bir aktiviteyi varmış gibi gösterme.
2. PROFİL UYUMU: Kullanıcının onboarding sorularına verdiği cevapları (konut tipi, araç sahibi olup olmaması, beslenme tarzı vb.) analizine dahil et. Örn: "Dizel araç kullandığınızı belirtmişsiniz, bu ayki ulaşım emisyonunuz..." gibi.
3. MATEMATİKSEL TREND: Geçmiş aylardaki veriler arasındaki değişimi (artış/azalış yüzdesi) hesapla ve gidişatı buna göre açıkla.
4. ÖNERİLER: Kullanıcının en çok emisyon ürettiği kategoriye ve profilindeki "öncelikli alan" (priority_area) hedefine odaklanan, uygulanabilir, teknik ve spesifik 3 öneri sun.
5. ASLA GENEL TAVSİYE VERME: "Ağaç dikin" veya "Geri dönüşüm yapın" gibi klişeler yerine, kullanıcının verisindeki spesifik bir yüksekliği düşürmeye yönelik konuş.

ZORUNLU JSON FORMATI (SADECE JSON):
{
  "prediction": "Gelecek ay için veriye dayalı öngörü (Maks 2 cümle)",
  "trend_summary": "Verilerdeki gerçek gidişat ve profil uyumu özeti (Maks 2 cümle)",
  "recommendations": [
    "Profil ve veriye dayalı 1. spesifik öneri",
    "Profil ve veriye dayalı 2. spesifik öneri",
    "Profil ve veriye dayalı 3. spesifik öneri"
  ]
}`;
        } else {
            prompt = `Sen bir sürdürülebilirlik asistanısın. Kullanıcı sisteme yeni katıldı ve henüz HİÇBİR verisi yok.
            
Kullanıcı Profili: ${JSON.stringify(profile)}

GÖREVİN:
1. Kullanıcıyı karşıla ve sisteme hoş geldin de.
2. Henüz veri girmediği için analiz yapılamadığını, ilk verisini (fatura veya manuel giriş) beklediğini söyle.
3. KESİN YASAK: 'Geçen ay', 'son 3 ay', '%...', 'artış', 'azalış' veya herhangi bir emisyon kategorisinden (elektrik, ulaşım vb.) KESİNLİKLE BAHSETME. Olmayan veriyi uydurma.
4. Hedefi olan '${profile?.priority_area || 'çevre'}' konusuna değinerek motivasyon ver.

ZORUNLU JSON FORMATI:
{
  "prediction": "Analiz için ilk verilerini bekliyorum.",
  "trend_summary": "Sisteme hoş geldin! Senin için analiz yapabilmem için veri girişine ihtiyacım var.",
  "recommendations": [
    "İlk verini eklemek için 'Kayıt Ekle' butonunu kullanabilirsin.",
    "Faturan varsa fotoğrafını çekip hızlıca yükleyebilirsin.",
    "Profilindeki hedeflerine ulaşman için sabırsızlanıyorum!"
  ]
}`;
        }

        let response = await this.callGroq(prompt, true);
        if (!response) response = await this.callGemini(prompt, true);

        if (!response) {
            return {
                prediction: "Veri yetersiz veya AI şu an meşgul.",
                trend_summary: "Gidişat takip ediliyor.",
                recommendations: ["Daha fazla veri ekleyerek analizi güçlendirin."]
            };
        }

        try {
            const cleaned = response.replace(/```json|```/gi, '').trim();
            const parsed = JSON.parse(cleaned);
            return {
                prediction: parsed.prediction || "Tahmin yapılamadı.",
                trend_summary: parsed.trend_summary || "Özet çıkarılamadı.",
                recommendations: parsed.recommendations || ["Veri eklemeye devam edin."]
            };
        } catch (e) {
            return {
                prediction: "Veri bekleniyor...",
                trend_summary: "Hoş geldiniz! Veri girişi yaparak analizi başlatabilirsiniz.",
                recommendations: ["İlk kaydınızı ekleyin."]
            };
        }
    }
}

module.exports = new AiService();
