import { Link, NavLink } from 'react-router-dom';

// App bar and navigation shared by every page after login
export default function Layout({ session, onLogout, children }) {
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
                        {session.role === 'manager' && <NavLink to="/staff">Staff</NavLink>}
                        {session.role === 'manager' && <NavLink to="/audit">Audit Log</NavLink>}
                    </nav>

                    <div className="user-menu">
                        <span>
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