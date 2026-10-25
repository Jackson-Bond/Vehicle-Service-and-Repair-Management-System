import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Home({ session, onLogout }) {
  const [workOrders, setWorkOrders] = useState([]);
  const [error, setError] = useState('');
  const isTechnician = session.role === 'technician';

  useEffect(() => {
    api('/api/work-orders', session.token)
      .then(setWorkOrders)
      .catch((err) => {
        // toekn expired
        if (err.status === 401) onLogout();
        else setError(err.message);
      });
  }, [session.token]);

  return (
    <div>
      <p>
        Logged in as {session.name} - {session.role}{' '}
        <button onClick={onLogout}>Log out</button>
      </p>

      <div>
        <Link to="/customers/new"><button>Register Customer</button></Link>
        <Link to="/vehicles/new"><button>Register vehicle</button></Link>
        <Link to="/work-orders/new"><button>Create Work Order</button></Link>
        {session.role === 'manager' && (
          <Link to="/users/new"><button>Add User</button></Link>
        )}
      </div>

      <h2>{isTechnician ? 'My Assigned Work Orders' : 'Work Orders'}</h2>
      {error && <p>{error}</p>}

      <table border="1">
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Customer</th>
            <th>Vehicle</th>
            <th>Technician</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {workOrders.map((workOrder) => (
            <tr key={workOrder.id}>
              <td><Link to={`/work-orders/${workOrder.id}`}>#{workOrder.id}</Link></td>
              <td>{workOrder.status}</td>
              <td>{workOrder.customer.name}</td>
              <td>{workOrder.vehicle.year} {workOrder.vehicle.make} {workOrder.vehicle.model}</td>
              <td>{workOrder.technician?.name ?? 'Unassigned'}</td>
              <td>{new Date(workOrder.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {workOrders.length === 0 && !error && (
        <p>{isTechnician ? 'No work orders are assigned to you.' : 'No work orders yet.'}</p>
      )}
    </div>
  );
}