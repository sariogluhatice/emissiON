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

    async login(email, password) {
        const response = await this.api.post('/auth/login', { email, password });
        
        if (response && response.token) {
            TokenManager.set(response.token);
        }
        return response;
    }

    async register(name, email, password) {
        const response = await this.api.post('/auth/register', { name, email, password });
        
        if (response && response.token) {
            TokenManager.set(response.token);
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
