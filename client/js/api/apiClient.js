import { Environment } from './env.js';
import { TokenManager } from './tokenManager.js';

export class ApiClient {
    constructor(baseURL = Environment.BASE_URL) {
        this.baseURL = baseURL;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const token = TokenManager.get();
        
        const headers = {
            ...(!(options.body instanceof FormData) && { 'Content-Type': 'application/json' }),
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers,
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers,
            });

            // Güvenli public rotalar (bu rotalarda hata alınırsa oturum silinmez)
            const PUBLIC_ENDPOINTS = ['/auth/login', '/auth/register', '/auth/verify-email', '/auth/resend-code', '/auth/forgot-password', '/auth/reset-password'];
            const isPublic = PUBLIC_ENDPOINTS.some(p => endpoint === p);

            if (response.status === 401 && !isPublic) {
                TokenManager.remove();
                window.location.replace('/pages/login.html');
                throw new Error('SESSION_EXPIRED');
            }

            const data = await response.json();

            if (!response.ok) {
                const err = new Error(data.message || data.error || 'API isteğinde hata oluştu.');
                if (data.accountDeleted)   err.accountDeleted   = true;
                if (data.emailNotVerified) err.emailNotVerified = true;
                throw err;
            }

            return data;
        } catch (error) {
            console.error(`API İsteği Başarısız (${endpoint}):`, error.message);
            throw error;
        }
    }

    get(endpoint, options = {}) { return this.request(endpoint, { ...options, method: 'GET' }); }
    post(endpoint, body, options = {}) { return this.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }); }
    put(endpoint, body, options = {}) { return this.request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }); }
    delete(endpoint, body = null, options = {}) {
        const opts = { ...options, method: 'DELETE' };
        if (body !== null) opts.body = JSON.stringify(body);
        return this.request(endpoint, opts);
    }
}
