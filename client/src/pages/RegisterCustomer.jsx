import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function RegisterCustomer({ session, onLogout }) {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
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
      const customer = await api('/api/customers', session.token, {
        method: 'POST',
        body: JSON.stringify(form),
      });
      // open the new customer's page so their vehicle can be added next
      navigate(`/customers/${customer.id}`);

    } catch (err) {
      // session expired
      if (err.status === 401) onLogout();
      else setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <h1>Register customer</h1>
          <p>Add the customer first, then register their vehicle.</p>
        </div>
      </div>

      <form className="panel form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" value={form.name} onChange={handleChange} required />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input name="email" type="email" value={form.email} onChange={handleChange} required />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving...' : 'Register customer'}
          </button>
          <Link to="/customers" className="btn btn-secondary">Cancel</Link>
        </div>
        {error && <p className="message message-error" role="alert">{error}</p>}
      </form>
    </div>
  );
}