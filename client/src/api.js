// The server sends a fresh login token while the user is active (NFR-03: 30 minutes of
// inactivity, not 30 minutes after login). The newest one is kept here and used for every
// request, so pages can keep passing session.token.
let latestToken = null;

export function setLatestToken(token) {
  latestToken = token;
}

export function currentToken(token) {
  return latestToken ?? token;
}

function keepRenewedToken(response, sentToken) {
  const renewed = response.headers.get('X-Session-Token');
  // ignore it if someone else logged in while the request was running
  if (!renewed || currentToken(sentToken) !== sentToken) return;
  latestToken = renewed;
  // also update the saved login, so a page refresh uses the new token
  try {
    const saved = JSON.parse(sessionStorage.getItem('session'));
    if (saved) sessionStorage.setItem('session', JSON.stringify({ ...saved, token: renewed }));
  } catch {
    // storage blocked: the renewed token still works until the page is refreshed
  }
}

export async function api(path, token, options = {}) {
  const sentToken = currentToken(token);
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sentToken}`,
      // let caller add or override headers
      ...options.headers,
    },
  });
  keepRenewedToken(response, sentToken);

  // parse response as JSON
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const err = new Error(data?.error || `Request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }

  return data;
}