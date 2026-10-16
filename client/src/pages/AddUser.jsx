import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

const EMPTY_FORM = { name: '', pin: '', role: 'technician' };

export default function AddUser({ session, onLogout }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  function handleChange(change) {
    // change field while keeping others
    setForm({ ...form, [change.target.name]: change.target.value });
  }

  async function handleSubmit(submit) {
    // stop browser from reloading page and clear old messages
    submit.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      // send form data and session token
      const user = await api('/api/users', session.token, {
        method: 'POST',
        body: JSON.stringify(form),
      });

      setSuccess(`Added ${user.name} as ${user.role}. Their employee code is ${user.employeeCode}.`);
      setForm(EMPTY_FORM);

    } catch (err) {
      if (err.status === 401) onLogout();
      else setError(err.message);
    }
    setSaving(false);
  }

  return (
    <div>
      <Link to="/">← Back</Link>
      <h1>Add user</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Name </label>
          <input name="name" value={form.name} onChange={handleChange} required />
        </div>
        <div>
          <label>PIN (6 digits) </label>
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={form.pin}
            onChange={handleChange}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label>Role </label>
          <select name="role" value={form.role} onChange={handleChange}>
            <option value="technician">Technician</option>
            <option value="manager">Manager</option>
          </select>
        </div>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Add user'}
        </button>
        {error && <p>{error}</p>}
        {success && <p>{success}</p>}
      </form>
    </div>
  );
}