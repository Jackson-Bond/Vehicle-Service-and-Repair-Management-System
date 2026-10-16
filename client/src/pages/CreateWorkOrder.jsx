import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function CreateWorkOrder({ session, onLogout }) {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    vehicleId: '',
    assignedTechnician: '',
    mileageIn: '',
    customerComplaint: '',
  });

  // customer picker state
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  // if customer picker is open
  const [open, setOpen] = useState(false);
  // used to detect click off
  const pickerRef = useRef(null);

  const [vehicles, setVehicles] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function handleChange(change) {
    setForm({ ...form, [change.target.name]: change.target.value });
  }

  function handleApiError(error) {
    if (error.status === 401) onLogout(); // session expired
    else setError(error.message);
  }

  // load technicians once
  useEffect(() => {
    api('/api/users?role=technician', session.token)
      .then(setTechnicians)
      .catch(handleApiError);
  }, [session.token]);

  // load up to 5 matching customers while the dropdown is open
  useEffect(() => {
    if (!open) return;

    // ignore responses that arrive after a newer search started
    let cancelled = false;
    api(`/api/customers?search=${encodeURIComponent(search)}&limit=5`, session.token)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(handleApiError);

    return () => {
      cancelled = true;
    };
  }, [open, search, session.token]);

  // load that customer's vehicles whenever the selected customer changes
  useEffect(() => {
    setVehicles([]);
    setForm((form) => ({ ...form, vehicleId: '' }));
    if (!selectedCustomer) return;

    let cancelled = false;
    api(`/api/customers/${selectedCustomer.id}/vehicles`, session.token)
      .then((data) => {
        if (!cancelled) setVehicles(data);
      })
      .catch(handleApiError);

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer, session.token]);

  // close the dropdown when clicking outside it
  useEffect(() => {
    function handleClickOutside(click) {
      if (pickerRef.current && !pickerRef.current.contains(click.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSearchChange(change) {
    setSearch(change.target.value);
    setSelectedCustomer(null);
    setOpen(true);
  }

  function selectCustomer(customer) {
    setSelectedCustomer(customer);
    setSearch(customer.name);
    setOpen(false);
  }

  // submit forn
  async function handleSubmit(submit) {
    submit.preventDefault();
    setError('');

    if (!selectedCustomer) {
      setError('Select a customer from the list');
      return;
    }

    setSaving(true);
    try {
      const workOrder = await api('/api/work-orders', session.token, {
        method: 'POST',
        body: JSON.stringify({ ...form, customerId: selectedCustomer.id }),
      });
      navigate(`/work-orders/${workOrder.id}`);
    } catch (err) {
      handleApiError(err);
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to="/">← Back</Link>
      <h1>Create work order</h1>

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
              {results.length === 0 && <li>No customers found</li>}
            </ul>
          )}
        </div>

        <div>
          <label>Vehicle </label>
          <select
            name="vehicleId"
            value={form.vehicleId}
            onChange={handleChange}
            disabled={!selectedCustomer}
            required
          >
            <option value="">
              {!selectedCustomer
                ? '(select a customer first)'
                : vehicles.length === 0
                  ? '(no vehicles registered)'
                  : '(select a vehicle)'}
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.year} {v.make} {v.model} - {v.vin}
              </option>
            ))}
          </select>
          {selectedCustomer && vehicles.length === 0 && (
            <span> <Link to="/vehicles/new">Register a vehicle</Link></span>
          )}
        </div>

        <div>
          <label>Assigned technician </label>
          <select
            name="assignedTechnician"
            value={form.assignedTechnician}
            onChange={handleChange}
          >
            <option value="">(unassigned)</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Mileage in </label>
          <input
            name="mileageIn"
            type="number"
            min="0"
            value={form.mileageIn}
            onChange={handleChange}
          />
        </div>

        <div>
          <label>Customer complaint </label>
          <div>
            <textarea
              name="customerComplaint"
              rows="4"
              cols="40"
              value={form.customerComplaint}
              onChange={handleChange}
            />
          </div>
        </div>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Create work order'}
        </button>
        {error && <p>{error}</p>}
      </form>
    </div>
  );
}