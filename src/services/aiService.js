


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
    /**
     * 4. Simülasyon Yol Haritası (What-If Roadmap)
     */
    async generateSimulationRoadmap(reductions, role = 'individual') {
        const reductionsText = Object.entries(reductions)
            .filter(([_, val]) => val < 0)
            .map(([cat, val]) => `${cat}: %${val}`)
            .join(', ');

        if (!reductionsText) {
            return {
                title: "Karbon Azaltım Planı",
                steps: ["Sürgüleri sola kaydırarak gelecek ay emisyon azaltma hedeflerinizi belirleyin, size özel yol haritasını üretelim!"]
            };
        }

        const prompt = `Görevin: Bir kullanıcının karbon emisyon simülasyonunda seçtiği azaltma yüzdelerine göre, bu azaltmaları nasıl sağlayabileceğine dair İNANILMAZ DERECEDE İLGİ ÇEKİCİ, DETAYLI ve ETKİLEYİCİ bir yol haritası (roadmap) üret. Sığ ve genelgeçer cümleler yerine, şaşırtıcı çevresel analojiler, finansal kazançlar ve spesifik teknik tüyolar kullan.
        
KULLANICI VERİLERİ:
- Azaltım Hedefleri: ${reductionsText}
- Kullanıcı Rolü: ${role}

ZORUNLU KURALLAR:
1. Sadece kullanıcının gerçekten azalttığı kategorileri (yukarıda belirtilenleri) ele al. Azaltmadığı kategoriler hakkında konuşma.
2. Belirtilen azaltım oranlarını gerçekleştirmek için gereken somut, pratik, teknik ve şaşırtıcı adımları söyle. Örneğin: "%20 Elektrik tasarrufu için; kettle'da sadece ihtiyacınız kadar su kaynatmak yılda 120 kg CO2 önler. Stand-by modundaki cihazlar faturanızın %10'unu yutar." gibi şaşırtıcı ve detaylı bilgiler ver.
3. Her kategorinin ilk adımı olarak mutlaka o azaltım oranının dünyamız için neye denk geldiğini anlatan (buzul erimesi, araba yolculuğu, telefon şarjı vb.) ŞAŞIRTICI ve ETKİLEYİCİ bir bilimsel kıyaslama/analoji yaz.
4. Rol uyumuna dikkat et (company ise şirket ofisleri ve filo verimliliği, household ise aile içi işbirliği, individual ise kişisel alışkanlıklar).

ZORUNLU JSON FORMATI (SADECE JSON):
{
  "title": "Gelecek Ay Azaltım Yol Haritanız",
  "steps": [
    {
      "kategori": "Kategori İsmi (örn: Enerji %X azaltım hedefi için)",
      "adimlar": [
        "Bilimsel Kıyaslama: Bu azaltım hedefiniz, dünyamızda X kg buzul erimesini önlemeye veya X km araba sürüşünü sıfırlamaya eşdeğer!",
        "1. spesifik, detaylı, şaşırtıcı teknik ve pratik öneri (ayrıntılı anlatım)",
        "2. spesifik, detaylı, şaşırtıcı teknik ve pratik öneri (ayrıntılı anlatım)"
      ]
    }
  ]
}`;

        let response = await this.callGroq(prompt, true);
        if (!response) response = await this.callGemini(prompt, true);

        try {
            const cleaned = response.replace(/```json|```/gi, '').trim();
            const parsed = JSON.parse(cleaned);
            return {
                title: parsed.title || "Gelecek Ay Azaltım Yol Haritanız",
                steps: parsed.steps || ["Adımları belirlemek için veri girişine devam edin."]
            };
        } catch (e) {
            return {
                title: "Gelecek Ay Azaltım Yol Haritanız",
                steps: [
                    "Seçtiğiniz hedeflere ulaşmak için enerji tasarruflu cihazları tercih edin.",
                    "Ulaşımda haftada en az bir gün toplu taşımayı veya bisikleti tercih edin.",
                    "Su tüketiminde debi sınırlayıcı aparatlar kullanarak tasarrufu arttırın."
                ]
            };
        }
    }
}

module.exports = new AiService();
