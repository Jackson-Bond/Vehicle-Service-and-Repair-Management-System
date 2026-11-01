import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import StatusBadge from './StatusBadge.jsx';

const money = (value) => `$${Number(value).toFixed(2)}`;
const NO_FILTERS = { from: '', to: '', serviceId: '' };

export default function ServiceHistory({ endpoint, show, session, onLogout }) {
    const [history, setHistory] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [services, setServices] = useState([]);
    const [filters, setFilters] = useState(NO_FILTERS);

    const filtered = Object.values(filters).some(Boolean);

    // services for the filter dropdown
    useEffect(() => {
        api('/api/services', session.token)
            .then(setServices)
            .catch((err) => {
                if (err.status === 401) onLogout();
            });
    }, [session.token]);

    // reload the history whenever a filter changes
    useEffect(() => {
        const params = new URLSearchParams(
            Object.entries(filters).filter(([, value]) => value)
        );
        let cancelled = false;
        setError('');

        api(`${endpoint}?${params}`, session.token)
            .then((data) => {
                if (cancelled) return;
                setHistory(data);
                setLoaded(true);
            })
            .catch((err) => {
                if (err.status === 401) onLogout();
                else if (!cancelled) setError(err.message);
            });

        return () => {
            cancelled = true;
        };
    }, [endpoint, filters, session.token]);

    function handleFilterChange(change) {
        setFilters({ ...filters, [change.target.name]: change.target.value });
    }

    const total = history.reduce((sum, wo) => sum + wo.total, 0);

    return (
        <section className="panel">
            <div className="section-head">
                <h2>Service history</h2>
                {history.length > 0 && (
                    <span className="muted">
                        {history.length} {history.length === 1 ? 'visit' : 'visits'}, {money(total)}
                    </span>
                )}
            </div>

            <div className="history-filters">
                <div className="field">
                    <label htmlFor="history-from">From</label>
                    <input id="history-from" name="from" type="date" value={filters.from} onChange={handleFilterChange} />
                </div>
                <div className="field">
                    <label htmlFor="history-to">To</label>
                    <input id="history-to" name="to" type="date" value={filters.to} onChange={handleFilterChange} />
                </div>
                <div className="field">
                    <label htmlFor="history-service">Service</label>
                    <select id="history-service" name="serviceId" value={filters.serviceId} onChange={handleFilterChange}>
                        <option value="">All services</option>
                        {services.map((service) => (
                            <option key={service.id} value={service.id}>{service.name}</option>
                        ))}
                    </select>
                </div>
                {filtered && (
                    <button type="button" className="btn btn-secondary" onClick={() => setFilters(NO_FILTERS)}>
                        Clear filters
                    </button>
                )}
            </div>

            {error && <p className="message message-error" role="alert">{error}</p>}

            {history.length > 0 && (
                <div className="table-wrap">
                    <table className="data stack">
                        <thead>
                            <tr>
                                <th>Work order</th>
                                <th>Opened</th>
                                {show === 'vehicle' && <th>Vehicle</th>}
                                {show === 'customer' && <th>Customer</th>}
                                <th>Services</th>
                                <th>Status</th>
                                <th className="num">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((wo) => (
                                <tr key={wo.id}>
                                    <td><Link to={`/work-orders/${wo.id}`} className="ro">#{wo.id}</Link></td>
                                    <td className="nowrap" data-label="Opened">
                                        {new Date(wo.createdAt).toLocaleDateString()}
                                        {wo.mileageIn != null && <div className="muted">{wo.mileageIn.toLocaleString()} mi</div>}
                                    </td>
                                    {show === 'vehicle' && (
                                        <td className="nowrap" data-label="Vehicle">
                                            <Link to={`/vehicles/${wo.vehicle.id}`}>
                                                {wo.vehicle.year} {wo.vehicle.make} {wo.vehicle.model}
                                            </Link>
                                        </td>
                                    )}
                                    {show === 'customer' && (
                                        <td className="nowrap" data-label="Customer">
                                            <Link to={`/customers/${wo.customer.id}`}>{wo.customer.name}</Link>
                                        </td>
                                    )}
                                    <td data-label="Services">
                                        {wo.services.length > 0
                                            ? wo.services.map((s) => s.name).join(', ')
                                            : <span className="muted">{wo.customerComplaint ?? 'None yet'}</span>}
                                    </td>
                                    <td><StatusBadge status={wo.status} /></td>
                                    <td className="num" data-label="Total">{money(wo.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {loaded && history.length === 0 && !error && (
                <p className="muted">
                    {filtered ? 'No work orders match these filters.' : 'No work orders yet.'}
                </p>
            )}
        </section>
    );
}