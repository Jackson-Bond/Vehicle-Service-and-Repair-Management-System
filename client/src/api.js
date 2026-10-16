export async function api(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      // let caller add or override headers
      ...options.headers,
    },
  });

  // parse response as JSON
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const err = new Error(data?.error || `Request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }

  return data;
}