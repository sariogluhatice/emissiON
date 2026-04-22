/**
 * TokenManager
 * Token okuma, yazma ve silme işlemlerini merkezi olarak yönetir.
 */
export class TokenManager {
    static KEY = 'emission_token';

    static get() {
        return localStorage.getItem(this.KEY) ?? sessionStorage.getItem(this.KEY);
    }

    // persistent=true  → localStorage  (tarayıcı kapatılsa bile kalır)
    // persistent=false → sessionStorage (sekme/pencere kapandığında silinir)
    static set(token, persistent = true) {
        if (persistent) {
            localStorage.setItem(this.KEY, token);
        } else {
            sessionStorage.setItem(this.KEY, token);
        }
    }

    static remove() {
        localStorage.removeItem(this.KEY);
        sessionStorage.removeItem(this.KEY);
    }

    static exists() {
        return !!this.get();
        // Not: Gerçek expiry (süre) kontrolü jwt-decode tarzı bir kütüphane ile ileride yapılabilir.
    }
}
