


// Safely extract a plain string from an AI field that may be a string, object, or null.
// LLMs occasionally return { "text": "...", "language": "tr" } instead of a bare string.
function _extractStr(val, fallback) {
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (val && typeof val === 'object') {
        const knownKeys = ['text','content','value','analysis','summary','prediction',
                           'trend','description','message','result','output'];
        for (const k of knownKeys) {
            if (typeof val[k] === 'string' && val[k].trim()) return val[k].trim();
        }
        // Handle Turkish or any other key names by joining all string values
        const allStrings = Object.values(val)
            .filter(v => typeof v === 'string' && v.trim().length > 10)
            .join(' ').trim();
        if (allStrings) return allStrings;
    }
    return fallback;
}

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
            
            prompt = `Sen kullanıcının kişisel 'Dijital Karbon İkizi' ve veri analisti uzmanısın. Projenin amacı kullanıcıyı profesyonel bir karbon analiz raporuyla aydınlatmaktır. Bu yüzden tahmin ve gidişat analizleri sığ ve kuru tek cümleler yerine, DERİNLEMESİNE, VERİYE DAYALI, DOLU ve SON DERECE PROFESYONEL paragraflar olmalıdır.
        
VERİLER:
- Geçmiş Emisyon Kayıtları: ${historyText}
- Kategorik Dağılım: ${categoriesText}
- Kullanıcı Profil Bilgileri (Onboarding): ${JSON.stringify(profile)}

ZORUNLU ANALİZ VE HESAPLAMA KURALLARI:
1. GELECEK AY ÖNGÖRÜSÜ (DETAYLI VE DOLU): Kullanıcının geçmiş emisyon hızına ve profilindeki tüketim alışkanlıklarına bakarak gelecek ay için bilimsel bir tahmin modeli sun. Cümleler sığ ve kuru ("tasarruf sağlayabilirsiniz" gibi) KESİNLİKLE olmamalıdır. Tam olarak 2 zengin cümleyle, emisyonların yüzde kaç değişebileceğini, bu değişimi hangi kategorilerin tetikleyeceğini ve bu trendi kırmak için atılması gereken stratejik adımları derinlemesine analiz et.
2. GİDİŞAT ANALİZİ (DETAYLI VE DOLU): Kullanıcının en yüksek emisyon ürettiği kategoriyi (örn: Sığır/Kırmızı Et veya Elektrik) ve geçmiş aylardaki matematiksel emisyon değişim trendini bilimsel olarak analiz et. Bu salınımın büyüklüğünü açıklamak için somut veriler, profil bilgileriyle kurulan bağlar ve tam olarak 2 zengin, ufuk açıcı cümle kullan.
3. MATEMATİKSEL REALİTE (TL HESABI): Tasarruflardaki TL hesapları KESİNLİKLE gerçekçi olmalı. Aşağıdaki formülleri temel alarak hesaplama yap:
   - Benzin / Mazot (Ulaşım) azaltımında: Azaltılan her 1 kg CO2 = ~18.5 TL tasarruftur. (Örn: 4.88 kg CO2 azaltımı = ~90 TL tasarruftur).
   - Elektrik azaltımında: Azaltılan her 1 kg CO2 = ~5.5 TL tasarruftur. (Örn: 48.80 kg CO2 azaltımı = ~268 TL tasarruftur).
   - Doğalgaz (Isınma) azaltımında: Azaltılan her 1 kg CO2 = ~5.2 TL tasarruftur.
   - Atık / Geri Dönüşüm azaltımında: Azaltılan her 1 kg CO2 = ~3.0 TL tasarruftur. (Örn: 168 kg CO2 azaltımı = ~504 TL tasarruftur).
4. ÖNERİLER: Kullanıcının en çok emisyon ürettiği kategorilere odaklanan, uygulanabilir, orta uzunlukta ve son derece somut tam 5 adet öneri sun.

ZORUNLU JSON FORMATI (SADECE JSON):
{
  "prediction": "Gelecek ay için veriye dayalı, tam olarak 2 adet zengin, akıcı ve profesyonel cümleden oluşan, yüzdeler ve trendler barındıran derinlemesine bilimsel gelecek ay öngörüsü analizi",
  "trend_summary": "Geçmiş verilerdeki gidişatın ve en yüksek salınım yapılan alanın (Sığır/Kırmızı Et vb.) analizini sunan, tam olarak 2 adet zengin, akıcı ve profesyonel cümleden oluşan derinlemesine trend analizi",
  "recommendations": [
    {
      "kategori": "Ulaşım / Enerji / Atık vb. (Kategori İsmi)",
      "tasarruf": "Karbon azaltım oranı, hedef kg değerleri ve bunu başarmak için atılacak pratik adımı açıklayan tek akıcı cümle (Burada KESİNLİKLE finansal kazançtan veya TL tutarından bahsetme, onu sadece finansal_fayda kısmına sakla!)",
      "finansal_fayda": "Yukarıdaki formüllere göre hesaplanmış GERÇEKÇİ tasarruf miktarı (Örn: '90 TL' veya '268 TL finansal kazanç')"
    }
  ]
}
KRİTİK: "prediction" ve "trend_summary" alanları MUTLAKA DÜZCE BİR METİN (string) olmalıdır. Asla iç içe JSON nesnesi veya alt alan içermemelidir.`;
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
            if (!parsed.prediction || typeof parsed.prediction !== 'string') {
                console.warn('[AiService.getSmartInsights] prediction not a flat string:', JSON.stringify(parsed.prediction));
            }
            return {
                prediction:   _extractStr(parsed.prediction,   "Gelecek ay tahmini hazırlanıyor."),
                trend_summary: _extractStr(parsed.trend_summary, "Gidişat analizi hazırlanıyor."),
                recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : ["Veri eklemeye devam edin."]
            };
        } catch (e) {
            return {
                prediction: "Analiz şu an alınamıyor. Lütfen daha sonra tekrar deneyin.",
                trend_summary: "Hoş geldiniz! Veri girişi yaparak analizi başlatabilirsiniz.",
                recommendations: ["İlk kaydınızı ekleyin."]
            };
        }
    }
    /**
     * 4. Simülasyon Yol Haritası (What-If Roadmap)
     */
    async generateSimulationRoadmap(reductions, role = 'individual') {
        const CATEGORY_NAMES = {
            energy:    'Enerji',
            water:     'Su Kullanımı',
            gas:       'Doğalgaz',
            transport: 'Ulaşım',
            food:      'Gıda',
            waste:     'Atık',
            materials: 'Malzeme',
            shopping:  'Alışveriş',
        };

        const selected = Object.entries(reductions)
            .filter(([_, val]) => Number(val) < 0)
            .map(([cat, val]) => ({
                key: cat,
                name: CATEGORY_NAMES[cat] || cat,
                pct: Math.abs(Number(val)),
            }));

        if (selected.length === 0) {
            return {
                title: "Azaltım Hedefi Seçilmedi",
                steps: ["Kişisel azaltım yol haritası oluşturmak için en az bir kategori için azaltım hedefi seçin."]
            };
        }

        const selectedLines = selected.map(r => `- ${r.name}: %${r.pct} azaltım hedefi`).join('\n');
        const selectedNames = selected.map(r => r.name).join(', ');
        const notSelected = Object.values(CATEGORY_NAMES)
            .filter(n => !selected.some(r => r.name === n))
            .join(', ');

        const roleNote = role === 'company'
            ? 'Şirket ofisi, filo ve tedarik zinciri bağlamında öneriler ver.'
            : role === 'household'
            ? 'Aile içi işbirliğine yönelik öneriler ver.'
            : 'Kişisel günlük alışkanlıklara yönelik öneriler ver.';

        const prompt = `Görevin: Kullanıcının karbon emisyon simülasyonunda seçtiği azaltım hedefleri için kişisel bir yol haritası üret.

KULLANICI VERİLERİ:
${selectedLines}
Kullanıcı Rolü: ${role}

ZORUNLU KURALLAR:
1. YALNIZCA şu kategoriler için bölüm oluştur: ${selectedNames}
2. Şu kategoriler seçilmedi — bunlar hakkında HİÇBİR ŞEY yazma, başlık ekleme: ${notSelected}
3. Her kategoriye yalnızca o kategoriyle doğrudan ilgili, pratik, uygulanabilir öneriler yaz:
   - Enerji → elektrik tasarrufu, standby cihaz, LED aydınlatma, yenilenebilir enerji
   - Su Kullanımı → duş süresi, akan musluk, debi sınırlayıcı, bahçe sulama zamanlaması
   - Doğalgaz → ısıtma termostatı, yalıtım, kombi bakımı, petek havalandırması
   - Ulaşım → toplu taşıma, bisiklet, yürüme, araç paylaşımı, yakıt verimliliği
   - Gıda → et tüketimi azaltma, yerel ve mevsim ürünleri, yemek israfını önleme
   - Atık → geri dönüşüm, kompost, ambalaj azaltımı, sıfır atık alışkanlıkları
   - Malzeme → tamir, yeniden kullanım, ikinci el tercih
   - Alışveriş → gereksiz satın alma azaltımı, kalıcı ürün tercihi, geri dönüştürülebilir ambalaj
4. Doğrulanamayan iddiaları (buzul erimesi miktarı gibi) yazma. Sadece somut, günlük hayata uygulanabilir öneriler.
5. ${roleNote}

ZORUNLU JSON FORMATI (SADECE JSON, MARKDOWN KOD BLOĞU KULLANMA):
{
  "title": "Kişisel Azaltım Yol Haritanız",
  "steps": [
    {
      "kategori": "[Kategori Adı] %[oran] Azaltım Hedefi",
      "adimlar": [
        "Kısa açıklama: Bu hedefe ulaşmak için yapılabilecekler.",
        "1. Spesifik, uygulanabilir öneri.",
        "2. Spesifik, uygulanabilir öneri.",
        "3. Spesifik, uygulanabilir öneri."
      ]
    }
  ]
}

ÖNEMLİ: steps dizisinde YALNIZCA ${selectedNames} kategorileri olmalı. Toplam ${selected.length} bölüm üret.`;

        let response = await this.callGroq(prompt, true);
        if (!response) response = await this.callGemini(prompt, true);

        const fallback = {
            title: "Gelecek Ay Azaltım Yol Haritanız",
            steps: [
                "Seçtiğiniz hedeflere ulaşmak için enerji tasarruflu cihazları tercih edin.",
                "Ulaşımda haftada en az bir gün toplu taşımayı veya bisikleti tercih edin.",
                "Su tüketiminde debi sınırlayıcı aparatlar kullanarak tasarrufu arttırın."
            ]
        };

        if (!response) return fallback;

        try {
            const cleaned = response.replace(/```json|```/gi, '').trim();
            const parsed = JSON.parse(cleaned);
            return {
                title: parsed.title || "Gelecek Ay Azaltım Yol Haritanız",
                steps: parsed.steps || ["Adımları belirlemek için veri girişine devam edin."]
            };
        } catch (e) {
            return fallback;
        }
    }
}

module.exports = new AiService();
