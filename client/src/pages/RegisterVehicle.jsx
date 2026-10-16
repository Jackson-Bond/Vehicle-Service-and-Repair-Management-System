import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function RegisterVehicle({ session, onLogout }) {
  const navigate = useNavigate();

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
      navigate('/');
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to="/">← Back</Link>
      <h1> Vehicle</h1>

      <form onSubmit={handleSubmit}>
        <div ref={pickerRef}>
          <label>Customer </label>
          <input
            value={search}
            onChange={handleSearchChange}
            onFocus={() => setOpen(true)}
            placeholder="Type to Search"
            autoComplete="off"
          />
          {selectedCustomer && <span>selected</span>}

          {open && (
            <ul>
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => selectCustomer(c)}>
                    {c.name}
                    {c.phone ? ` (${c.phone})` : ''}
                    {c.email ? ` ${c.email}` : ''}
                  </button>
                </li>
              ))}
              {results.length === 0 && <li>No Customers Found</li>}
            </ul>
          )}
        </div>

        <div>
          <label>VIN </label>
          <input name="vin" value={form.vin} onChange={handleChange} maxLength={17} required />
        </div>
        <div>
          <label>Make </label>
          <input name="make" value={form.make} onChange={handleChange} required />
        </div>
        <div>
          <label>Model </label>
          <input name="model" value={form.model} onChange={handleChange} required />
        </div>
        <div>
          <label>Year </label>
          <input name="year" type="number" value={form.year} onChange={handleChange} required />
        </div>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Register vehicle'}
        </button>
        {error && <p>{error}</p>}
      </form>
    </div>
  );
}