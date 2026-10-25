import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login.jsx';
import Home from './pages/Home.jsx';
import RegisterCustomer from './pages/RegisterCustomer.jsx';
import RegisterVehicle from './pages/RegisterVehicle.jsx';
import CreateWorkOrder from './pages/CreateWorkOrder.jsx';
import WorkOrderDetail from './pages/WorkOrderDetail.jsx';
import AddUser from './pages/AddUser.jsx';

export default function App() {
  const [session, setSession] = useState(null); // { token, role, name }

  if (!session) return <Login onLogin={setSession} />;

  const logout = () => setSession(null);

  return (
    <Routes>
      <Route path="/" element={<Home session={session} onLogout={logout} />} />
      <Route path="/customers/new" element={<RegisterCustomer session={session} onLogout={logout} />} />
      <Route path="/vehicles/new" element={<RegisterVehicle session={session} />} />
      <Route path="/work-orders/new" element={<CreateWorkOrder session={session} onLogout={logout} />} />
      <Route path="/work-orders/:id" element={<WorkOrderDetail session={session} onLogout={logout} />} />
      {session.role === 'manager' && (
        <Route path="/users/new" element={<AddUser session={session} onLogout={logout} />} />
      )}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}