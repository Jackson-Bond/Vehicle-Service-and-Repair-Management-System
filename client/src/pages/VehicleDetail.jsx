import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ServiceHistory from '../components/ServiceHistory.jsx';

export default function VehicleDetail({ session, onLogout }) {
    const { id } = useParams();
    const [vehicle, setVehicle] = useState(null);
    const [loadError, setLoadError] = useState('');

    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ text: '', ok: false });

    useEffect(() => {
        api(`/api/vehicles/${id}`, session.token)
            .then(setVehicle)
            .catch((err) => {
                if (err.status === 401) onLogout();
                else setLoadError(err.message);
            });
    }, [id, session.token]);

    function startEditing() {
        setForm({ make: vehicle.make, model: vehicle.model, year: String(vehicle.year) });
        setMessage({ text: '', ok: false });
        setEditing(true);
    }

    function handleChange(change) {
        setForm({ ...form, [change.target.name]: change.target.value });
    }

    async function handleSubmit(submit) {
        submit.preventDefault();
        setSaving(true);
        setMessage({ text: '', ok: false });
        try {
            const updated = await api(`/api/vehicles/${id}`, session.token, {
                method: 'PATCH',
                body: JSON.stringify(form),
            });
            setVehicle(updated);
            setEditing(false);
            setMessage({ text: 'Vehicle saved.', ok: true });
        } catch (err) {
            if (err.status === 401) onLogout();
            else setMessage({ text: err.message, ok: false });
        } finally {
            setSaving(false);
        }
    }

    if (loadError) {
        return (
            <div className="page">
                <Link to="/customers" className="back-link">Back to customers</Link>
                <p className="message message-error" role="alert">{loadError}</p>
            </div>
        );
    }

    if (!vehicle) return <div className="page"><p className="muted">Loading vehicle...</p></div>;

    // back to the owner when there's just one, otherwise to the customer list
    const backTo = vehicle.owners.length === 1
        ? { to: `/customers/${vehicle.owners[0].id}`, label: `Back to ${vehicle.owners[0].name}` }
        : { to: '/customers', label: 'Back to customers' };

    return (
        <div className="page">
            <Link to={backTo.to} className="back-link">{backTo.label}</Link>

            <div className="page-header">
                <div>
                    <h1>{vehicle.year} {vehicle.make} {vehicle.model}</h1>
                    <p>VIN {vehicle.vin}</p>
                </div>
                <Link to="/work-orders/new" className="btn">New work order</Link>
            </div>

            <div className="wo-layout">
                <div className="wo-main">
                    <ServiceHistory
                        endpoint={`/api/vehicles/${vehicle.id}/history`}
                        show="customer"
                        session={session}
                        onLogout={onLogout}
                    />
                </div>

                <aside className="wo-side">
                    <section className="panel">
                        <div className="section-head">
                            <h2>Details</h2>
                            {!editing && !vehicle.sharedWithOtherShop && (
                                <button type="button" className="btn btn-secondary" onClick={startEditing}>Edit</button>
                            )}
                        </div>

                        {editing ? (
                            <form className="form" onSubmit={handleSubmit}>
                                <div className="field">
                                    <label htmlFor="make">Make</label>
                                    <input id="make" name="make" value={form.make} onChange={handleChange} required />
                                </div>
                                <div className="field">
                                    <label htmlFor="model">Model</label>
                                    <input id="model" name="model" value={form.model} onChange={handleChange} required />
                                </div>
                                <div className="field">
                                    <label htmlFor="year">Year</label>
                                    <input id="year" name="year" type="number" value={form.year} onChange={handleChange} required />
                                </div>
                                <p className="hint muted">The VIN can't be changed. Register the vehicle again if it was entered wrong.</p>
                                <div className="form-actions">
                                    <button type="submit" className="btn" disabled={saving}>
                                        {saving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <dl className="facts">
                                <div><dt>Make</dt><dd>{vehicle.make}</dd></div>
                                <div><dt>Model</dt><dd>{vehicle.model}</dd></div>
                                <div><dt>Year</dt><dd>{vehicle.year}</dd></div>
                                <div><dt>VIN</dt><dd>{vehicle.vin}</dd></div>
                            </dl>
                        )}

                        {vehicle.sharedWithOtherShop && (
                            <p className="muted" style={{ marginTop: 16 }}>
                                This vehicle is also on file at another shop, so its details can't be edited here.
                            </p>
                        )}

                        {message.text && (
                            <p
                                className={`message ${message.ok ? 'message-success' : 'message-error'}`}
                                role={message.ok ? 'status' : 'alert'}
                                style={{ marginTop: 16 }}
                            >
                                {message.text}
                            </p>
                        )}
                    </section>

                    <section className="panel">
                        <h2 className="section-head">{vehicle.owners.length === 1 ? 'Owner' : 'Owners'}</h2>
                        <ul className="link-list">
                            {vehicle.owners.map((owner) => (
                                <li key={owner.id}>
                                    <Link to={`/customers/${owner.id}`}>
                                        <span className="row-title">{owner.name}</span>
                                        {(owner.phone || owner.email) && (
                                            <span className="muted">{[owner.phone, owner.email].filter(Boolean).join(', ')}</span>
                                        )}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </section>
                </aside>
            </div>
        </div>
    );
}