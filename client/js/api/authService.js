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

    async register(name, email, password) {
        const response = await this.api.post('/auth/register', { name, email, password });
        
        if (response && response.token) {
            TokenManager.set(response.token);
            if (response.user) {
                localStorage.setItem('user', JSON.stringify(response.user));
            }
        }
        return response;
    }

    logout() {
        TokenManager.remove();
    }

    isAuthenticated() {
        return TokenManager.exists();
    }
}
