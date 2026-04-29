import { ApiClient } from './apiClient.js';
import { TokenManager } from './tokenManager.js';

/**
 * AuthService Sınıfı
 * Login ve Register işlemlerini üstlenir.
 */
export class AuthService {
    constructor() {
        this.api = new ApiClient();
    }

    async login(email, password, remember = true) {
        const response = await this.api.post('/auth/login', { email, password });

        if (response && response.token) {
            TokenManager.set(response.token, remember);
            if (response.user) {
                localStorage.setItem('user', JSON.stringify(response.user));
            }
        }
        return response;
    }

    async register(name, email, password, role) {
        const response = await this.api.post('/auth/register', { name, email, password, role });
        // Kayıttan sonra otomatik giriş yapma, kullanıcının login sayfasına gitmesini bekliyoruz.
        return response;
    }

    async verifyEmail(email, code) {
        return await this.api.post('/auth/verify-email', { email, code });
    }

    async resendCode(email) {
        return await this.api.post('/auth/resend-code', { email });
    }

    async forgotPassword(email) {
        return await this.api.post('/auth/forgot-password', { email });
    }

    async resetPassword(uid, token, newPassword) {
        return await this.api.post('/auth/reset-password', { uid, token, newPassword });
    }

    logout() {
        TokenManager.remove();
    }

    isAuthenticated() {
        return TokenManager.exists();
    }
}
