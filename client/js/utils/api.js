const BASE_URL = 'http://localhost:3000';

/**
 * Backend'e POST isteği atar.
 * @param {string} path  - örn. '/api/auth/register'
 * @param {object} body  - JSON olarak gönderilecek veri
 * @returns {Promise<{ ok: boolean, data: object }>}
 */
export async function apiFetch(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}
