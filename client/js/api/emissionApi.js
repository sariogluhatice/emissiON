import { ApiClient } from './apiClient.js';

const client = new ApiClient();

export const emissionApi = {
    getAll:         ()         => client.get('/emissions'),
    getById:        (id)       => client.get(`/emissions/${id}`),
    create:         (data)     => client.post('/emissions', data),
    update:         (id, data) => client.put(`/emissions/${id}`, data),
    remove:         (id)       => client.delete(`/emissions/${id}`),
    extractOcr:     (ocrText)  => client.post('/emissions/extract-ocr', { ocrText }),
    extractOcrFromImage: (imageBase64) => client.post('/emissions/extract-ocr-image', { imageBase64 }),
    getSmartInsights: ()       => client.get('/emissions/smart-insights'),
    getSimulationRoadmap: (reductions) => client.post('/emissions/simulation-roadmap', { reductions }),
    parseOcrGroq:   (ocrText)  => client.post('/emissions/parse-ocr-groq', { ocrText }),
    calculateEmission: (payload) => client.post('/emissions/calculate', payload),
    scanShoppingReceipt: (file) => {
        const formData = new FormData();
        formData.append('receipt', file);
        return client.request('/ocr/shopping', { method: 'POST', body: formData });
    },
};
