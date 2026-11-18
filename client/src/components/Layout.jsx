import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { api } from '../api.js';

// App bar and navigation shared by every page after login
export default function Layout({ session, onLogout, stockVersion, children }) {
    const location = useLocation();
    const [lowStock, setLowStock] = useState(0);

    // FR-17: managers see how many parts are low on stock. Rechecked on every page change
    // and whenever the Parts page changes stock.
    useEffect(() => {
        if (session.role !== 'manager') return;
        api('/api/parts?lowStock=true', session.token)
            .then((parts) => setLowStock(parts.length))
            .catch(() => { });
    }, [location.pathname, stockVersion, session.token, session.role]);

    return (
        <>
            <header className="app-bar">
                <div className="app-bar-inner">
                    <Link to="/" className="brand">Shop Manager</Link>

                    <nav className="main-nav" aria-label="Main">
                        <NavLink to="/" end>Work Orders</NavLink>
                        <NavLink to="/work-orders/new">New Work Order</NavLink>
                        <NavLink to="/customers">Customers</NavLink>
                        <NavLink to="/vehicles/new">Register Vehicle</NavLink>
                        <NavLink to="/parts">
                            Parts
                            {lowStock > 0 && (
                                <span className="nav-badge" title={`${lowStock} low on stock`}>
                                    {lowStock}<span className="sr-only"> low on stock</span>
                                </span>
                            )}
                        </NavLink>
                        {session.role === 'manager' && <NavLink to="/staff">Staff</NavLink>}
                        {session.role === 'manager' && <NavLink to="/audit">Audit Log</NavLink>}
                    </nav>

                    <div className="user-menu">
                        <span className="user-id">
                            <span className="user-name">{session.name}</span>{' '}
                            <span className="user-role">{session.role}</span>
                        </span>
                        <button type="button" className="btn btn-secondary" onClick={onLogout}>
                            Log Out
                        </button>
                    </div>
                </div>
            </header>

            <main>{children}</main>
        </>
    );
}