import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const CONTACT_LABELS = { phone: 'Phone call', sms: 'Text message', email: 'Email' };

export default function Customers({ session, onLogout }) {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState([]);
    const [search, setSearch] = useState('');
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');

    // search on the server, after a short pause in typing
    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            api(`/api/customers?search=${encodeURIComponent(search)}`, session.token)
                .then((data) => {
                    if (cancelled) return;
                    setCustomers(data);
                    setLoaded(true);
                })
                .catch((err) => {
                    if (err.status === 401) onLogout();
                    else if (!cancelled) setError(err.message);
                });
        }, 250);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [search, session.token]);

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Customers</h1>
                    <p>Open a customer to see their vehicles and service history.</p>
                </div>
                <Link to="/customers/new" className="btn">Register customer</Link>
            </div>

            <div className="toolbar">
                <input
                    className="search"
                    type="search"
                    placeholder="Search by name, phone or email"
                    aria-label="Search customers"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {error && <p className="message message-error" role="alert">{error}</p>}

            <div className="table-wrap">
                {customers.length > 0 && (
                    <table className="data stack">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Phone</th>
                                <th>Email</th>
                                <th>Prefers</th>
                                <th className="num">Vehicles</th>
                                <th>Last visit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.map((customer) => (
                                <tr
                                    key={customer.id}
                                    className="clickable-row"
                                    onClick={() => navigate(`/customers/${customer.id}`)}
                                >
                                    <td>
                                        <Link
                                            to={`/customers/${customer.id}`}
                                            className="row-title"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {customer.name}
                                        </Link>
                                    </td>
                                    <td data-label="Phone">{customer.phone ?? <span className="muted">None</span>}</td>
                                    <td data-label="Email">{customer.email ?? <span className="muted">None</span>}</td>
                                    <td data-label="Prefers">
                                        {CONTACT_LABELS[customer.preferredContactMethod] ?? <span className="muted">No preference</span>}
                                    </td>
                                    <td className="num" data-label="Vehicles">{customer.vehicleCount}</td>
                                    <td data-label="Last visit">
                                        {customer.lastVisit
                                            ? new Date(customer.lastVisit).toLocaleDateString()
                                            : <span className="muted">Never</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                {loaded && customers.length === 0 && (
                    <div className="empty">
                        <p>{search ? 'No customers match that search.' : 'No customers yet.'}</p>
                        {!search && <Link to="/customers/new" className="btn">Register customer</Link>}
                    </div>
                )}

                {!loaded && !error && <div className="empty">Loading customers...</div>}
            </div>
        </div>
    );
}