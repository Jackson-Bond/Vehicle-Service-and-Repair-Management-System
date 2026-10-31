import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { statusInfo } from '../statuses.js';

export default function Home({ session, onLogout }) {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const isTechnician = session.role === 'technician';

  useEffect(() => {
    api('/api/work-orders', session.token)
      .then((data) => {
        setWorkOrders(data);
        setLoaded(true);
      })
      .catch((err) => {
        // toekn expired
        if (err.status === 401) onLogout();
        else setError(err.message);
      });
  }, [session.token]);

  // one filter button per status that appears in the list, with a count
  const statusCounts = useMemo(() => {
    const counts = new Map();
    for (const wo of workOrders) counts.set(wo.status, (counts.get(wo.status) ?? 0) + 1);
    return [...counts.entries()];
  }, [workOrders]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (statusFilter !== 'all' && wo.status !== statusFilter) return false;
      if (!term) return true;
      const text = [
        `#${wo.id}`,
        wo.customer.name,
        `${wo.vehicle.year} ${wo.vehicle.make} ${wo.vehicle.model}`,
        wo.technician?.name ?? '',
        wo.customerComplaint ?? '',
      ].join(' ').toLowerCase();
      return text.includes(term);
    });
  }, [workOrders, search, statusFilter]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{isTechnician ? 'My work orders' : 'Work orders'}</h1>
          <p>
            {isTechnician
              ? 'Work orders assigned to you, newest first.'
              : 'Every work order in the shop, newest first.'}
          </p>
        </div>
        <Link to="/work-orders/new" className="btn">New work order</Link>
      </div>

      {error && <p className="message message-error" role="alert">{error}</p>}

      {workOrders.length > 0 && (
        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Search customer, vehicle, technician or #"
            aria-label="Search work orders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="filters" role="group" aria-label="Filter by status">
            <button
              type="button"
              className="filter"
              aria-pressed={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
            >
              All<span className="count">{workOrders.length}</span>
            </button>
            {statusCounts.map(([status, count]) => (
              <button
                key={status}
                type="button"
                className="filter"
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {statusInfo(status).label}<span className="count">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrap">
        {visible.length > 0 && (
          <table className="data stack">
            <thead>
              <tr>
                <th>Work order</th>
                <th>Status</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Technician</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((workOrder) => (
                <tr
                  key={workOrder.id}
                  className="clickable-row"
                  onClick={() => navigate(`/work-orders/${workOrder.id}`)}
                >
                  <td>
                    <Link
                      to={`/work-orders/${workOrder.id}`}
                      className="ro"
                      onClick={(e) => e.stopPropagation()}
                    >
                      #{workOrder.id}
                    </Link>
                  </td>
                  <td><StatusBadge status={workOrder.status} /></td>
                  <td>
                    <div>{workOrder.customer.name}</div>
                    {workOrder.customerComplaint && (
                      <div className="complaint" title={workOrder.customerComplaint}>
                        {workOrder.customerComplaint}
                      </div>
                    )}
                  </td>
                  <td data-label="Vehicle">
                    {workOrder.vehicle.year} {workOrder.vehicle.make} {workOrder.vehicle.model}
                  </td>
                  <td data-label="Technician">
                    {workOrder.technician?.name ?? <span className="muted">Unassigned</span>}
                  </td>
                  <td data-label="Created">{new Date(workOrder.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {loaded && workOrders.length === 0 && (
          <div className="empty">
            <p>
              {isTechnician
                ? 'No work orders are assigned to you yet.'
                : 'No work orders yet. Create one when a customer brings in a vehicle.'}
            </p>
            {!isTechnician && <Link to="/work-orders/new" className="btn">New work order</Link>}
          </div>
        )}

        {workOrders.length > 0 && visible.length === 0 && (
          <div className="empty">
            <p>No work orders match these filters.</p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => { setSearch(''); setStatusFilter('all'); }}
            >
              Clear filters
            </button>
          </div>
        )}

        {!loaded && !error && <div className="empty">Loading work orders...</div>}
      </div>
    </div>
  );
}