import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

export default function RegisterVehicle({ session, onLogout }) {
  const navigate = useNavigate();
  // set when opened from a customer's page with "Add vehicle"
  const [searchParams] = useSearchParams();
  const presetCustomerId = searchParams.get('customerId');

  const [form, setForm] = useState({
    vin: '',
    make: '',
    model: '',
    year: '',
  });

  // Customer picker state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleChange(change) {
    setForm({ ...form, [change.target.name]: change.target.value });
  }

  // pre-select the customer when coming from their page
  useEffect(() => {
    if (!presetCustomerId) return;
    api(`/api/customers/${presetCustomerId}`, session.token)
      .then((customer) => {
        setSelectedCustomer(customer);
        setSearch(customer.name);
      })
      .catch((err) => {
        if (err.status === 401) onLogout();
      });
  }, [presetCustomerId, session.token]);

  // load up to 5 matching customers whenever the dropdown is open or the search text changes
  useEffect(() => {
    if (!open) return;

    // ignore responses that arrive after a newer search started
    let cancelled = false;

    const timer = setTimeout(() => {
      api(`/api/customers?search=${encodeURIComponent(search)}&limit=5`, session.token)
        .then((data) => {
          if (!cancelled) setResults(data);
        })
        .catch((error) => {
          if (error.status === 401) onLogout();
          else if (!cancelled) setError(error.message);
        });
      // wait for a pause in typing before searching
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search, session.token]);

  // close the dropdown when clicked outside
  useEffect(() => {
    function handleClickOutside(click) {
      if (pickerRef.current && !pickerRef.current.contains(click.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSearchChange(search) {
    setSearch(search.target.value);
    // clear field
    setSelectedCustomer(null);
    setOpen(true);
  }

  function selectCustomer(customer) {
    setSelectedCustomer(customer);
    setSearch(customer.name);
    setOpen(false);
  }

  async function handleSubmit(submit) {
    submit.preventDefault();
    setError('');

    if (!selectedCustomer) {
      setError('Please select a customer from the list');
      return;
    }

    setSaving(true);
    try {
      await api('/api/vehicles', session.token, {
        method: 'POST',
        body: JSON.stringify({ ...form, customerId: selectedCustomer.id }),
      });
      // back to the customer, where the new vehicle now shows
      navigate(`/customers/${selectedCustomer.id}`);
    } catch (err) {
      if (err.status === 401) onLogout();
      else setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <h1>Register vehicle</h1>
          <p>Link a vehicle to an existing customer.</p>
        </div>
      </div>

      <form className="panel form" onSubmit={handleSubmit}>
        <div className="field" ref={pickerRef}>
          <label htmlFor="customer-search">Customer</label>
          <input
            id="customer-search"
            value={search}
            onChange={handleSearchChange}
            onFocus={() => setOpen(true)}
            placeholder="Search by name, phone or email"
            autoComplete="off"
          />
          {selectedCustomer && <span className="picker-selected">Customer selected</span>}

          {open && (
            <ul className="picker-list">
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => selectCustomer(c)}>
                    <div>{c.name}</div>
                    {(c.phone || c.email) && (
                      <div className="picker-detail">{[c.phone, c.email].filter(Boolean).join(', ')}</div>
                    )}
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="picker-empty">
                  No customers found. <Link to="/customers/new">Register a customer</Link>
                </li>
              )}
            </ul>
          )}
        </div>

        <div className="field">
          <label htmlFor="vin">VIN</label>
          <input
            id="vin"
            name="vin"
            value={form.vin}
            onChange={handleChange}
            maxLength={17}
            style={{ textTransform: 'uppercase' }}
            required
          />
          <span className="hint">17 characters. The letters I, O and Q are never used.</span>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="make">Make</label>
            <input id="make" name="make" value={form.make} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="model">Model</label>
            <input id="model" name="model" value={form.model} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="year">Year</label>
            <input id="year" name="year" type="number" value={form.year} onChange={handleChange} required />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving...' : 'Register vehicle'}
          </button>
          <Link to={presetCustomerId ? `/customers/${presetCustomerId}` : '/customers'} className="btn btn-secondary">Cancel</Link>
        </div>
        {error && <p className="message message-error" role="alert">{error}</p>}
      </form>
    </div>
  );
}