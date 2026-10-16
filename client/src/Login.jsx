import { useState } from 'react';

export default function Login({ onLogin }) {
  const [shopId, setShopId] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(submit) {
    // stop browser from reloading the page
    submit.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopId, employeeCode, pin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      // { token, role, name }
      onLogin(data);

    } catch {
      setError('Could not reach the server');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Login</h1>
      <div>
        <label>Shop ID </label>
        <input value={shopId} onChange={(change) => setShopId(change.target.value)} />
      </div>
      <div>
        <label>Employee Code </label>
        <input inputMode="numeric" value={employeeCode} onChange={(change) => setEmployeeCode(change.target.value)} />
      </div>
      <div>
        <label>PIN </label>
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
      </div>
      <button type="submit">Log In</button>
      {error && <p>{error}</p>}
    </form>
  );
}