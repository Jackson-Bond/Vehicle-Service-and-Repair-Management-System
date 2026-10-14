import { useState } from 'react';

export default function Login({ onLogin }) {
  const [shopId, setShopId] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault(); // stop the browser from reloading the page
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
      onLogin(data); // { token, role, name }
    } catch {
      setError('Could not reach the server');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Login</h1>
      <div>
        <label>Shop ID </label>
        <input value={shopId} onChange={(e) => setShopId(e.target.value)} />
      </div>
      <div>
        <label>Employee code </label>
        <input value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} />
      </div>
      <div>
        <label>PIN </label>
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
      </div>
      <button type="submit">Log in</button>
      {error && <p>{error}</p>}
    </form>
  );
}