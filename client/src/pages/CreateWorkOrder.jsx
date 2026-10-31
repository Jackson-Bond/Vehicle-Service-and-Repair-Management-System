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
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <h1>New work order</h1>
          <p>Open a work order when a customer brings in a vehicle.</p>
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
          <label htmlFor="vehicleId">Vehicle</label>
          <select
            id="vehicleId"
            name="vehicleId"
            value={form.vehicleId}
            onChange={handleChange}
            disabled={!selectedCustomer}
            required
          >
            <option value="">
              {!selectedCustomer
                ? 'Choose a customer first'
                : vehicles.length === 0
                  ? 'No vehicles registered'
                  : 'Choose a vehicle'}
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.year} {v.make} {v.model} - {v.vin}
              </option>
            ))}
          </select>
          {selectedCustomer && vehicles.length === 0 && (
            <span className="hint">
              This customer has no vehicles yet. <Link to="/vehicles/new">Register a vehicle</Link>
            </span>
          )}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="assignedTechnician">Technician</label>
            <select
              id="assignedTechnician"
              name="assignedTechnician"
              value={form.assignedTechnician}
              onChange={handleChange}
            >
              <option value="">Assign later</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="mileageIn">Mileage in</label>
            <input
              id="mileageIn"
              name="mileageIn"
              type="number"
              min="0"
              value={form.mileageIn}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="customerComplaint">Customer complaint</label>
          <textarea
            id="customerComplaint"
            name="customerComplaint"
            rows="4"
            placeholder="What the customer says is wrong, in their words"
            value={form.customerComplaint}
            onChange={handleChange}
          />
        </div>

        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving...' : 'Create work order'}
          </button>
          <Link to="/" className="btn btn-secondary">Cancel</Link>
        </div>
        {error && <p className="message message-error" role="alert">{error}</p>}
      </form>
    </div>
  );
}