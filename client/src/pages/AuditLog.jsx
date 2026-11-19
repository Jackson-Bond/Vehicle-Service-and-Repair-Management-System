import { useEffect, useState } from 'react';
import { api } from '../api.js';

// FR-26: read-only audit trail for managers
export default function AuditLog({ session, onLogout }) {
  const [rows, setRows] = useState([]);
  const [entityType, setEntityType] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const query = entityType ? `?entityType=${entityType}` : '';
    api(`/api/audit${query}`, session.token)
      .then(setRows)
      .catch((err) => (err.status === 401 ? onLogout() : setError(err.message)));
  }, [entityType]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Audit log</h1>
          <p>Who created, changed or approved what. Entries cannot be edited or deleted.</p>
        </div>
      </div>
      <div className="field">
        <label htmlFor="entityType">Show</label>
        <select id="entityType" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">Everything</option>
          <option value="work_order">Work orders</option>
          <option value="customer">Customers</option>
          <option value="vehicle">Vehicles</option>
          <option value="invoice">Invoices</option>
          <option value="part">Parts</option>
          <option value="user">Staff</option>
          <option value="shop">Settings</option>
        </select>
      </div>
      {error && <p className="message message-error" role="alert">{error}</p>}
      <section className="panel">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.userName}</td>
                  <td>{r.action.replace(/_/g, ' ')}</td>
                  <td>{r.entityType.replace(/_/g, ' ')} {r.entityId ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="muted">No entries.</p>}
      </section>
    </div>
  );
}
