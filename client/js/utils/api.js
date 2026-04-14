export async function apiFetch(endpoint, body) {
  try {
    const res  = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { message: 'Network error — is the server running?' } };
  }
}
