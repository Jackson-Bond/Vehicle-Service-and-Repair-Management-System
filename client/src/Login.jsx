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
    <div className="login-screen">
      <section className="login-side">
        <h1>Shop Manager</h1>
        <p>Track every vehicle from service request to completed repair.</p>
      </section>

      <main className="login-main">
        <form className="login-form form" onSubmit={handleSubmit}>
          <div>
            <h2>Log in</h2>
            <p className="muted">Use the employee code and PIN your manager gave you.</p>
          </div>

          <div className="field">
            <label htmlFor="shopId">Shop ID</label>
            <input
              id="shopId"
              inputMode="numeric"
              value={shopId}
              onChange={(change) => setShopId(change.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="employeeCode">Employee code</label>
            <input
              id="employeeCode"
              inputMode="numeric"
              value={employeeCode}
              onChange={(change) => setEmployeeCode(change.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pin">PIN</label>
            <input
              id="pin"
              className="pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn">Log in</button>
          {error && <p className="message message-error" role="alert">{error}</p>}
        </form>
      </main>
    </div>
  );
}