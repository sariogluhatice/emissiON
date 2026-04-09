export class Environment {
    static get BASE_URL() {
        return '/api'; // Şu an test_proxy.js ile 3000'e Proxy ediliyor.

        /* 
        // VITE ORTAMINA GEÇİLİRSE ÜSTTEKİ SATIRI SİLİP AŞAĞIDAKİ KODU AÇABİLİRSİNİZ:
        // return import.meta.env.VITE_API_BASE_URL;
        */
    }
}
