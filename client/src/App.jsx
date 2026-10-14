import { useState } from 'react';
import Login from './Login.jsx';

export default function App() {
  // { token, role, name }
  const [session, setSession] = useState(null);

  if (!session) {
    return <Login onLogin={setSession} />;
  }

  return (
    <div>
      <p>Logged in as {session.name} ({session.role})</p>
      <button onClick={() => setSession(null)}>Log out</button>
    </div>
  );
}