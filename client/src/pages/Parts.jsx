import { useEffect, useState } from 'react';
import { api } from '../api.js';

const money = (value) => `$${Number(value).toFixed(2)}`;
const EMPTY_PART = { partNumber: '', name: '', description: '', price: '', quantityInStock: '0', reorderLevel: '5' };

// Everyone can look; only managers add, edit and restock.
export default function Parts({ session, onLogout, onStockChange }) {
    const isManager = session.role === 'manager';
    const [parts, setParts] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [search, setSearch] = useState('');
    const [lowOnly, setLowOnly] = useState(false);
    const [message, setMessage] = useState({ text: '', ok: false });

    // the open form: { mode: 'add' } | { mode: 'edit', part } | { mode: 'restock', part }
    const [form, setForm] = useState(null);
    const [values, setValues] = useState(EMPTY_PART);
    const [restockQty, setRestockQty] = useState('');
    const [saving, setSaving] = useState(false);

    function fail(err) {
        if (err.status === 401) onLogout();
        else setMessage({ text: err.message, ok: false });
    }

    function load() {
        return api('/api/parts', session.token)
            .then((data) => {
                setParts(data);
                setLoaded(true);
            })
            .catch(fail);
    }

    useEffect(() => {
        load();
    }, [session.token]);

    function openAdd() {
        setValues(EMPTY_PART);
        setForm({ mode: 'add' });
        setMessage({ text: '', ok: false });
    }

    function openEdit(part) {
        setValues({
            partNumber: part.partNumber,
            name: part.name,
            description: part.description ?? '',
            price: String(Number(part.price)),
            quantityInStock: String(part.quantityInStock),
            reorderLevel: String(part.reorderLevel),
        });
        setForm({ mode: 'edit', part });
        setMessage({ text: '', ok: false });
    }

    function openRestock(part) {
        setRestockQty('');
        setForm({ mode: 'restock', part });
        setMessage({ text: '', ok: false });
    }

    function handleChange(change) {
        setValues({ ...values, [change.target.name]: change.target.value });
    }

    async function submitForm(submit) {
        submit.preventDefault();
        setSaving(true);
        setMessage({ text: '', ok: false });
        try {
            let saved;
            if (form.mode === 'restock') {
                saved = await api(`/api/parts/${form.part.id}/restock`, session.token, {
                    method: 'POST',
                    body: JSON.stringify({ quantity: Number(restockQty) }),
                });
            } else {
                const body = {
                    ...values,
                    price: Number(values.price),
                    quantityInStock: Number(values.quantityInStock),
                    reorderLevel: Number(values.reorderLevel),
                };
                saved = await api(form.mode === 'add' ? '/api/parts' : `/api/parts/${form.part.id}`, session.token, {
                    method: form.mode === 'add' ? 'POST' : 'PATCH',
                    body: JSON.stringify(body),
                });
            }
            const done = { add: 'added', edit: 'saved', restock: `restocked, now ${saved.quantityInStock} in stock` }[form.mode];
            setMessage({ text: `${saved.name} ${done}.`, ok: true });
            setForm(null);
            await load();
            onStockChange?.();
        } catch (err) {
            fail(err);
        } finally {
            setSaving(false);
        }
    }

    const lowCount = parts.filter((p) => p.lowStock).length;
    const term = search.trim().toLowerCase();
    const visible = parts.filter((p) =>
        (!lowOnly || p.lowStock) &&
        (!term || `${p.partNumber} ${p.name}`.toLowerCase().includes(term))
    );

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h1>Parts</h1>
                    <p>{isManager ? 'Stock on hand. Restock parts when they run low.' : 'Stock on hand for each part.'}</p>
                </div>
                {isManager && <button type="button" className="btn" onClick={openAdd}>Add part</button>}
            </div>

            {lowCount > 0 && (
                <div className="stock-alert" role="status">
                    <strong>{lowCount} {lowCount === 1 ? 'part is' : 'parts are'} low on stock.</strong>
                    {' '}
                    {!lowOnly && (
                        <button type="button" className="link-button" onClick={() => setLowOnly(true)}>Show only those</button>
                    )}
                </div>
            )}

            {message.text && (
                <p className={`message ${message.ok ? 'message-success' : 'message-error'}`} role={message.ok ? 'status' : 'alert'}>
                    {message.text}
                </p>
            )}

            {form && (
                <form className="panel form parts-form" onSubmit={submitForm}>
                    <h2>
                        {form.mode === 'add' && 'Add part'}
                        {form.mode === 'edit' && `Edit ${form.part.partNumber}`}
                        {form.mode === 'restock' && `Restock ${form.part.name}`}
                    </h2>

                    {form.mode === 'restock' ? (
                        <div className="field restock-field">
                            <label htmlFor="restockQty">Quantity received</label>
                            <input
                                id="restockQty"
                                type="number"
                                min="1"
                                step="1"
                                value={restockQty}
                                onChange={(e) => setRestockQty(e.target.value)}
                                required
                                autoFocus
                            />
                            <span className="hint">
                                {form.part.quantityInStock} in stock now
                                {Number(restockQty) > 0 && `, ${form.part.quantityInStock + Number(restockQty)} after restocking`}.
                            </span>
                        </div>
                    ) : (
                        <>
                            <div className="field-row">
                                <div className="field">
                                    <label htmlFor="partNumber">Part number</label>
                                    <input id="partNumber" name="partNumber" value={values.partNumber} onChange={handleChange} required />
                                </div>
                                <div className="field">
                                    <label htmlFor="name">Name</label>
                                    <input id="name" name="name" value={values.name} onChange={handleChange} required />
                                </div>
                            </div>
                            <div className="field">
                                <label htmlFor="description">Description</label>
                                <input id="description" name="description" value={values.description} onChange={handleChange} />
                            </div>
                            <div className="field-row">
                                <div className="field">
                                    <label htmlFor="price">Price ($)</label>
                                    <input id="price" name="price" type="number" min="0" step="0.01" value={values.price} onChange={handleChange} required />
                                </div>
                                <div className="field">
                                    <label htmlFor="quantityInStock">{form.mode === 'add' ? 'In stock' : 'In stock (after a count)'}</label>
                                    <input id="quantityInStock" name="quantityInStock" type="number" min="0" step="1" value={values.quantityInStock} onChange={handleChange} required />
                                </div>
                                <div className="field">
                                    <label htmlFor="reorderLevel">Reorder at</label>
                                    <input id="reorderLevel" name="reorderLevel" type="number" min="0" step="1" value={values.reorderLevel} onChange={handleChange} required />
                                </div>
                            </div>
                            <p className="hint muted">A part is flagged as low when its stock is at or below the reorder level.</p>
                        </>
                    )}

                    <div className="form-actions">
                        <button type="submit" className="btn" disabled={saving}>
                            {saving ? 'Saving...' : { add: 'Add part', edit: 'Save', restock: 'Restock' }[form.mode]}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={() => setForm(null)}>Cancel</button>
                    </div>
                </form>
            )}

            {parts.length > 0 && (
                <div className="toolbar">
                    <input
                        className="search"
                        type="search"
                        placeholder="Search by name or part number"
                        aria-label="Search parts"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className="filters" role="group" aria-label="Filter by stock">
                        <button type="button" className="filter" aria-pressed={!lowOnly} onClick={() => setLowOnly(false)}>
                            All<span className="count">{parts.length}</span>
                        </button>
                        <button type="button" className="filter" aria-pressed={lowOnly} onClick={() => setLowOnly(true)}>
                            Low stock<span className="count">{lowCount}</span>
                        </button>
                    </div>
                </div>
            )}

            <div className="table-wrap">
                {visible.length > 0 && (
                    <table className="data stack parts">
                        <thead>
                            <tr>
                                <th>Part</th>
                                <th className="num">Price</th>
                                <th className="num">In stock</th>
                                <th className="num">Reorder at</th>
                                <th>Status</th>
                                {isManager && <th><span className="sr-only">Actions</span></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((part) => (
                                <tr key={part.id} className={part.lowStock ? 'row-low' : undefined}>
                                    <td>
                                        <div className="row-title">{part.name}</div>
                                        <div className="muted">{part.partNumber}{part.description ? ` · ${part.description}` : ''}</div>
                                    </td>
                                    <td className="num" data-label="Price">{money(part.price)}</td>
                                    <td className="num" data-label="In stock">{part.quantityInStock}</td>
                                    <td className="num" data-label="Reorder at">{part.reorderLevel}</td>
                                    <td>
                                        <span className={`status ${part.quantityInStock === 0 ? 'status-stopped' : part.lowStock ? 'status-waiting' : 'status-done'}`}>
                                            {part.quantityInStock === 0 ? 'Out of stock' : part.lowStock ? 'Low stock' : 'In stock'}
                                        </span>
                                    </td>
                                    {isManager && (
                                        <td className="num row-actions">
                                            <button type="button" className="btn btn-secondary" onClick={() => openRestock(part)}>Restock</button>
                                            <button type="button" className="btn btn-quiet" onClick={() => openEdit(part)}>Edit</button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {loaded && parts.length === 0 && <div className="empty">No parts yet.</div>}
                {loaded && parts.length > 0 && visible.length === 0 && (
                    <div className="empty">{lowOnly && !term ? 'Nothing is low on stock.' : 'No parts match.'}</div>
                )}
                {!loaded && <div className="empty">Loading parts...</div>}
            </div>
        </div>
    );
}