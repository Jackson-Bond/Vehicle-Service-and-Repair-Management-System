import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function RegisterCustomer({ session, onLogout }) {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    preferredContactMethod: '',
  });

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // change one aspect of form and keep others
  function handleChange(change) {
    setForm({ ...form, [change.target.name]: change.target.value });
  }

  async function handleSubmit(submit) {
    // prevent page from reloading
    submit.preventDefault();
    setError('');
    setSaving(true);

    try {
      await api('/api/customers', session.token, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      navigate('/');

    } catch (err) {
      // session expired
      if (err.status === 401) onLogout();
      else setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to="/">← Back</Link>
      <h1>Register Customer</h1>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Name </label>
          <input name="name" value={form.name} onChange={handleChange} required />
        </div>
        <div>
          <label>Phone </label>
          <input name="phone" type="tel" value={form.phone} onChange={handleChange} />
        </div>
        <div>
          <label>Email </label>
          <input name="email" type="email" value={form.email} onChange={handleChange} />
        </div>
        <div>
          <label>Preferred Contact Method </label>
          <select
            name="preferredContactMethod"
            value={form.preferredContactMethod}
            onChange={handleChange}
          >
            <option value="">(none)</option>
            <option value="phone">Phone</option>
            <option value="sms">Text message</option>
            <option value="email">Email</option>
          </select>
        </div>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Register customer'}
        </button>
        {error && <p>{error}</p>}
      </form>
    </div>
  );
}