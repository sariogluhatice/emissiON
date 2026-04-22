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
}

module.exports = new AiService();
