/**
 * TokenManager
 * Token okuma, yazma ve silme işlemlerini merkezi olarak yönetir.
 */
export class TokenManager {
    static KEY = 'emission_token';

    static get() {
        return localStorage.getItem(this.KEY);
    }

    static set(token) {
        localStorage.setItem(this.KEY, token);
    }

    static remove() {
        localStorage.removeItem(this.KEY);
    }

    static exists() {
        return !!this.get();
        // Not: Gerçek expiry (süre) kontrolü jwt-decode tarzı bir kütüphane ile ileride yapılabilir.
    }
}
