import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import ServiceHistory from '../components/ServiceHistory.jsx';

const CONTACT_LABELS = { phone: 'Phone call', sms: 'Text message', email: 'Email' };

function formFrom(customer) {
    return {
        name: customer.name,
        phone: customer.phone ?? '',
        email: customer.email ?? '',
        preferredContactMethod: customer.preferredContactMethod ?? '',
    };
}

export default function CustomerDetail({ session, onLogout }) {
    const { id } = useParams();
    const [customer, setCustomer] = useState(null);
    const [loadError, setLoadError] = useState('');

    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ text: '', ok: false });

    useEffect(() => {
        api(`/api/customers/${id}`, session.token)
            .then(setCustomer)
            .catch((err) => {
                if (err.status === 401) onLogout();
                else setLoadError(err.message);
            });
    }, [id, session.token]);

    function startEditing() {
        setForm(formFrom(customer));
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
            const updated = await api(`/api/customers/${id}`, session.token, {
                method: 'PATCH',
                body: JSON.stringify(form),
            });
            setCustomer({ ...customer, ...updated });
            setEditing(false);
            setMessage({ text: 'Customer saved.', ok: true });
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

    if (!customer) return <div className="page"><p className="muted">Loading customer...</p></div>;

    return (
        <div className="page">
            <Link to="/customers" className="back-link">Back to customers</Link>

            <div className="page-header">
                <div>
                    <h1>{customer.name}</h1>
                    <p>
                        {customer.vehicles.length} {customer.vehicles.length === 1 ? 'vehicle' : 'vehicles'} on file
                    </p>
                </div>
                <Link to="/work-orders/new" className="btn">New work order</Link>
            </div>

            <div className="wo-layout">
                <div className="wo-main">
                    <section className="panel">
                        <div className="section-head">
                            <h2>Vehicles</h2>
                            <Link to={`/vehicles/new?customerId=${customer.id}`} className="btn btn-secondary">
                                Add vehicle
                            </Link>
                        </div>
                        {customer.vehicles.length > 0 ? (
                            <ul className="link-list">
                                {customer.vehicles.map((vehicle) => (
                                    <li key={vehicle.id}>
                                        <Link to={`/vehicles/${vehicle.id}`}>
                                            <span className="row-title">{vehicle.year} {vehicle.make} {vehicle.model}</span>
                                            <span className="muted">VIN {vehicle.vin}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="muted">No vehicles registered yet.</p>
                        )}
                    </section>

                    <ServiceHistory
                        endpoint={`/api/customers/${customer.id}/history`}
                        show="vehicle"
                        session={session}
                        onLogout={onLogout}
                    />
                </div>

                <aside className="wo-side">
                    <section className="panel">
                        <div className="section-head">
                            <h2>Contact</h2>
                            {!editing && (
                                <button type="button" className="btn btn-secondary" onClick={startEditing}>Edit</button>
                            )}
                        </div>

                        {editing ? (
                            <form className="form" onSubmit={handleSubmit}>
                                <div className="field">
                                    <label htmlFor="name">Name</label>
                                    <input id="name" name="name" value={form.name} onChange={handleChange} required />
                                </div>
                                <div className="field">
                                    <label htmlFor="phone">Phone</label>
                                    <input id="phone" name="phone" type="tel" value={form.phone} onChange={handleChange} />
                                </div>
                                <div className="field">
                                    <label htmlFor="email">Email</label>
                                    <input id="email" name="email" type="email" value={form.email} onChange={handleChange} />
                                </div>
                                <div className="field">
                                    <label htmlFor="preferredContactMethod">Preferred contact method</label>
                                    <select
                                        id="preferredContactMethod"
                                        name="preferredContactMethod"
                                        value={form.preferredContactMethod}
                                        onChange={handleChange}
                                    >
                                        <option value="">No preference</option>
                                        <option value="phone">Phone call</option>
                                        <option value="sms">Text message</option>
                                        <option value="email">Email</option>
                                    </select>
                                </div>
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
                                <div>
                                    <dt>Phone</dt>
                                    <dd>{customer.phone ?? <span className="muted">None</span>}</dd>
                                </div>
                                <div>
                                    <dt>Email</dt>
                                    <dd>{customer.email ?? <span className="muted">None</span>}</dd>
                                </div>
                                <div>
                                    <dt>Preferred contact</dt>
                                    <dd>{CONTACT_LABELS[customer.preferredContactMethod] ?? <span className="muted">No preference</span>}</dd>
                                </div>
                            </dl>
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
                </aside>
            </div>
        </div>
    );
}