import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login.jsx';
import Home from './pages/Home.jsx';
import RegisterCustomer from './pages/RegisterCustomer.jsx';
import RegisterVehicle from './pages/RegisterVehicle.jsx';
import CreateWorkOrder from './pages/CreateWorkOrder.jsx';
import WorkOrderDetail from './pages/WorkOrderDetail.jsx';
import AddUser from './pages/AddUser.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import VehicleDetail from './pages/VehicleDetail.jsx';
import Staff from './pages/Staff.jsx';
import AuditLog from './pages/AuditLog.jsx';
import Parts from './pages/Parts.jsx';

import Layout from './components/Layout.jsx';

export default function App() {
  const [session, setSession] = useState(null); // { token, role, name }
  const [stockVersion, setStockVersion] = useState(0);

  if (!session) return <Login onLogin={setSession} />;

  const logout = () => setSession(null);

  return (
    <Layout session={session} onLogout={logout} stockVersion={stockVersion}>
      <Routes>
        <Route path="/" element={<Home session={session} onLogout={logout} />} />
        <Route path="/customers" element={<Customers session={session} onLogout={logout} />} />
        <Route path="/customers/new" element={<RegisterCustomer session={session} onLogout={logout} />} />
        <Route path="/customers/:id" element={<CustomerDetail session={session} onLogout={logout} />} />
        <Route path="/vehicles/new" element={<RegisterVehicle session={session} onLogout={logout} />} />
        <Route path="/vehicles/:id" element={<VehicleDetail session={session} onLogout={logout} />} />
        <Route path="/work-orders/new" element={<CreateWorkOrder session={session} onLogout={logout} />} />
        <Route path="/work-orders/:id" element={<WorkOrderDetail session={session} onLogout={logout} />} />
        <Route path="/parts" element={<Parts session={session} onLogout={logout} onStockChange={() => setStockVersion((v) => v + 1)} />} />
        {session.role === 'manager' && (
          <Route path="/users/new" element={<AddUser session={session} onLogout={logout} />} />
        )}
        {session.role === 'manager' && (
          <Route path="/staff" element={<Staff session={session} onLogout={logout} />} />
        )}
        {session.role === 'manager' && (
          <Route path="/audit" element={<AuditLog session={session} onLogout={logout} />} />
        )}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}