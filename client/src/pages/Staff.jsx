import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

// FR-25: managers edit staff, reset PINs and deactivate accounts. Also holds the shop tax rate.
export default function Staff({ session, onLogout }) {
  const [staff, setStaff] = useState([]);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null); // { id, name, role, pin }
  const [taxPercent, setTaxPercent] = useState('');
  const [busy, setBusy] = useState(false);

  function fail(err) {
    if (err.status === 401) onLogout();
    else setMessage(err.message);
  }

  function load() {
    api('/api/users?includeInactive=true', session.token).then(setStaff).catch(fail);
  }

  useEffect(() => {
    load();
    api('/api/shop', session.token).then((shop) => setTaxPercent(String(+(shop.taxRate * 100).toFixed(4)))).catch(fail);
  }, []);

  // runs one save at a time, so a double click doesn't send the request twice
  async function run(task) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await task();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  function save(submit) {
    submit.preventDefault();
    const body = { name: editing.name, role: editing.role };
    if (editing.pin) body.pin = editing.pin;
    run(async () => {
      await api(`/api/users/${editing.id}`, session.token, { method: 'PATCH', body: JSON.stringify(body) });
      setEditing(null);
      load();
    });
  }

  function setActive(member, active) {
    if (!active && !window.confirm(`Deactivate ${member.name}? They will be logged out and cannot sign in.`)) return;
    run(async () => {
      await api(`/api/users/${member.id}`, session.token, { method: 'PATCH', body: JSON.stringify({ active }) });
      load();
    });
  }

  function saveTax(submit) {
    submit.preventDefault();
    run(async () => {
      await api('/api/shop', session.token, { method: 'PATCH', body: JSON.stringify({ taxRate: Number(taxPercent) / 100 }) });
      setMessage('Tax rate saved.');
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Staff</h1>
          <p>Edit accounts, reset PINs, and deactivate people who have left.</p>
        </div>
        <Link to="/users/new" className="btn">Add user</Link>
      </div>

      <section className="panel">
        <div className="table-wrap">
          <table className="data stack">
            <thead>
              <tr><th>Name</th><th>Role</th><th>Code</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td data-label="Role">{m.role}</td>
                  <td data-label="Code">{m.employeeCode}</td>
                  <td data-label="Status">{m.active ? 'Active' : 'Deactivated'}</td>
                  <td className="num row-actions">
                    <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setEditing({ id: m.id, name: m.name, role: m.role, pin: '' })}>Edit</button>
                    {m.active
                      ? <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setActive(m, false)}>Deactivate</button>
                      : <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setActive(m, true)}>Reactivate</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <form className="panel form" onSubmit={save}>
          <h2 className="section-head">Edit {editing.name}</h2>
          <div className="field">
            <label htmlFor="editName">Name</label>
            <input id="editName" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
          </div>
          <div className="field">
            <label htmlFor="editRole">Role</label>
            <select id="editRole" value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
              <option value="technician">Technician</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="editPin">New PIN (leave blank to keep)</label>
            <input
              id="editPin" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
              autoComplete="new-password" value={editing.pin}
              onChange={(e) => setEditing({ ...editing, pin: e.target.value })}
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <form className="panel form" onSubmit={saveTax}>
        <h2 className="section-head">Sales tax</h2>
        <div className="field">
          <label htmlFor="tax">Tax rate (%)</label>
          <input id="tax" type="number" step="0.01" min="0" max="25" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} required />
          <span className="hint">Used by new estimates and invoices.</span>
        </div>
        <div className="form-actions"><button type="submit" className="btn" disabled={busy}>{busy ? 'Saving...' : 'Save tax rate'}</button></div>
      </form>

      {message && <p className="message" role="status">{message}</p>}
    </div>
  );
}
