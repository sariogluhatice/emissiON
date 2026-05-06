import { ApiClient } from './apiClient.js';

const client = new ApiClient();

export const emissionService = {
    getAll:         ()         => client.get('/emissions'),
    create:         (data)     => client.post('/emissions', data),
    update:         (id, data) => client.put(`/emissions/${id}`, data),
    remove:         (id)       => client.delete(`/emissions/${id}`),
    extractOcr:     (ocrText)  => client.post('/emissions/extract-ocr', { ocrText }),
    extractOcrFromImage: (imageBase64) => client.post('/emissions/extract-ocr-image', { imageBase64 }),
    getSmartInsights: ()       => client.get('/emissions/smart-insights'),
    getSimulationRoadmap: (reductions) => client.post('/emissions/simulation-roadmap', { reductions }),
};
