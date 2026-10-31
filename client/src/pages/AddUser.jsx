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
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <h1>Add user</h1>
          <p>The new employee logs in with the code shown after saving and the PIN you set.</p>
        </div>
      </div>

      <form className="panel form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" value={form.name} onChange={handleChange} required />
        </div>
        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input
            id="pin"
            className="pin-input"
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
          <span className="hint">Exactly 6 digits.</span>
        </div>
        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" name="role" value={form.role} onChange={handleChange}>
            <option value="technician">Technician</option>
            <option value="manager">Manager</option>
          </select>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving...' : 'Add user'}
          </button>
          <Link to="/" className="btn btn-secondary">Cancel</Link>
        </div>
        {error && <p className="message message-error" role="alert">{error}</p>}
        {success && <p className="message message-success" role="status">{success}</p>}
      </form>
    </div>
  );
}