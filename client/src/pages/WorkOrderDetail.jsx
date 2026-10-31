import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';

const money = (value) => `$${Number(value).toFixed(2)}`;

export default function WorkOrderDetail({ session, onLogout }) {
  const { id } = useParams();

  const [workOrder, setWorkOrder] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [diagnosisForm, setDiagnosisForm] = useState({ diagnosis: '', recommendedRepairs: '' });
  const [diagnosisMessage, setDiagnosisMessage] = useState('');
  const [savingDiagnosis, setSavingDiagnosis] = useState(false);

  const [parts, setParts] = useState([]);
  const [partForm, setPartForm] = useState({ partId: '', quantity: '1' });
  const [partMessage, setPartMessage] = useState('');
  const [savingPart, setSavingPart] = useState(false);

  function handleApiError(err, setMessage) {
    if (err.status === 401) onLogout();
    else setMessage(err.message);
  }

  function showWorkOrder(data) {
    setWorkOrder(data);
    setDiagnosisForm({
      diagnosis: data.diagnosis ?? '',
      recommendedRepairs: data.notes ?? '',
    });
  }

  function loadParts() {
    api('/api/parts', session.token)
      .then(setParts)
      .catch((err) => handleApiError(err, setPartMessage));
  }

  useEffect(() => {
    api(`/api/work-orders/${id}`, session.token)
      .then(showWorkOrder)
      .catch((err) => handleApiError(err, setLoadError));
    loadParts();
  }, [id, session.token]);

  async function saveDiagnosis(submit) {
    submit.preventDefault();
    setDiagnosisMessage('');
    setSavingDiagnosis(true);
    try {
      const data = await api(`/api/work-orders/${id}/diagnosis`, session.token, {
        method: 'PATCH',
        body: JSON.stringify(diagnosisForm),
      });
      showWorkOrder(data);
      setDiagnosisMessage('Diagnosis saved.');
    } catch (err) {
      handleApiError(err, setDiagnosisMessage);
    } finally {
      setSavingDiagnosis(false);
    }
  }

  async function addPart(submit) {
    submit.preventDefault();
    setPartMessage('');
    if (!partForm.partId) {
      setPartMessage('Select a part');
      return;
    }
    setSavingPart(true);
    try {
      const data = await api(`/api/work-orders/${id}/parts`, session.token, {
        method: 'POST',
        body: JSON.stringify({ partId: Number(partForm.partId), quantity: Number(partForm.quantity) }),
      });
      showWorkOrder(data);
      setPartForm({ partId: '', quantity: '1' });
      loadParts();
    } catch (err) {
      handleApiError(err, setPartMessage);
    } finally {
      setSavingPart(false);
    }
  }

  async function removePart(partId) {
    setPartMessage('');
    try {
      const data = await api(`/api/work-orders/${id}/parts/${partId}`, session.token, {
        method: 'DELETE',
      });
      showWorkOrder(data);
      loadParts();
    } catch (err) {
      handleApiError(err, setPartMessage);
    }
  }

  if (loadError) {
    return (
      <div>
        <Link to="/">← Back</Link>
        <p>{loadError}</p>
      </div>
    );
  }

  if (!workOrder) return <div className="page"><p className="muted">Loading work order...</p></div>;

  const isClosed = ['completed', 'cancelled'].includes(workOrder.status);
  const editable = workOrder.canEdit && !isClosed;

  const partsTotal = workOrder.parts.reduce(
    (sum, line) => sum + Number(line.unitPrice) * line.quantity,
    0
  );
  const servicesTotal = workOrder.services.reduce((sum, line) => sum + Number(line.price), 0);
  const { vehicle, customer } = workOrder;

  return (
    <div className="page">
      <Link to="/" className="back-link">Back to work orders</Link>

      <div className="wo-header">
        <h1 className="ro ro-large">#{workOrder.id}</h1>
        <StatusBadge status={workOrder.status} />
      </div>
      <p className="wo-subtitle">
        {vehicle.year} {vehicle.make} {vehicle.model} for {customer.name}
      </p>

      <div className="wo-layout">
        <div className="wo-main">
          <section className="panel">
            <h2 className="section-head">Customer complaint</h2>
            {workOrder.customerComplaint
              ? <p className="complaint-block">{workOrder.customerComplaint}</p>
              : <p className="muted">No complaint recorded.</p>}
          </section>

          <section className="panel">
            <h2 className="section-head">Diagnosis</h2>
            {editable ? (
              <form className="form" onSubmit={saveDiagnosis}>
                <div className="field">
                  <label htmlFor="diagnosis">Findings</label>
                  <textarea
                    id="diagnosis"
                    rows="4"
                    placeholder="What you found when inspecting the vehicle"
                    value={diagnosisForm.diagnosis}
                    onChange={(e) => setDiagnosisForm({ ...diagnosisForm, diagnosis: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="recommendedRepairs">Recommended repairs</label>
                  <textarea
                    id="recommendedRepairs"
                    rows="3"
                    placeholder="Repairs to quote to the customer"
                    value={diagnosisForm.recommendedRepairs}
                    onChange={(e) => setDiagnosisForm({ ...diagnosisForm, recommendedRepairs: e.target.value })}
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn" disabled={savingDiagnosis}>
                    {savingDiagnosis ? 'Saving...' : 'Save diagnosis'}
                  </button>
                </div>
                {diagnosisMessage && (
                  <p
                    className={`message ${diagnosisMessage === 'Diagnosis saved.' ? 'message-success' : 'message-error'}`}
                    role="status"
                  >
                    {diagnosisMessage}
                  </p>
                )}
              </form>
            ) : (
              <div className="readout">
                <div>
                  <h3>Findings</h3>
                  <p>{workOrder.diagnosis ?? <span className="muted">Not recorded yet</span>}</p>
                </div>
                <div>
                  <h3>Recommended repairs</h3>
                  <p>{workOrder.notes ?? <span className="muted">None</span>}</p>
                </div>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>Parts used</h2>
              <span className="muted">{money(partsTotal)}</span>
            </div>

            {workOrder.parts.length > 0 ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th className="num">Qty</th>
                      <th className="num">Unit price</th>
                      <th className="num">Total</th>
                      {editable && <th><span className="sr-only">Remove</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {workOrder.parts.map((line) => (
                      <tr key={line.partId}>
                        <td>
                          <div>{line.part.name}</div>
                          <div className="muted">{line.part.partNumber}</div>
                        </td>
                        <td className="num">{line.quantity}</td>
                        <td className="num">{money(line.unitPrice)}</td>
                        <td className="num">{money(Number(line.unitPrice) * line.quantity)}</td>
                        {editable && (
                          <td className="num">
                            <button type="button" className="btn btn-quiet" onClick={() => removePart(line.partId)}>
                              Remove
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No parts recorded.</p>
            )}

            {editable && (
              <form className="add-part" onSubmit={addPart}>
                <div className="field">
                  <label htmlFor="partId">Add a part</label>
                  <select
                    id="partId"
                    value={partForm.partId}
                    onChange={(e) => setPartForm({ ...partForm, partId: e.target.value })}
                  >
                    <option value="">Choose a part</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id} disabled={p.quantityInStock === 0}>
                        {p.partNumber} {p.name}, {money(p.price)} ({p.quantityInStock} in stock)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="quantity">Qty</label>
                  <input
                    id="quantity"
                    type="number"
                    min="1"
                    step="1"
                    value={partForm.quantity}
                    onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn btn-secondary" disabled={savingPart}>
                  {savingPart ? 'Adding...' : 'Add part'}
                </button>
              </form>
            )}
            {partMessage && <p className="message message-error" role="alert" style={{ marginTop: 12 }}>{partMessage}</p>}
          </section>

          <section className="panel">
            <div className="section-head">
              <h2>Services</h2>
              <span className="muted">{money(servicesTotal)}</span>
            </div>
            {workOrder.services.length > 0 ? (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr><th>Service</th><th>Notes</th><th className="num">Price</th></tr>
                  </thead>
                  <tbody>
                    {workOrder.services.map((line) => (
                      <tr key={line.serviceId}>
                        <td>{line.service.name}</td>
                        <td className="muted">{line.notes ?? ''}</td>
                        <td className="num">{money(line.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No services recorded.</p>
            )}
          </section>
        </div>

        <aside className="wo-side">
          <section className="panel">
            <dl className="facts">
              <div>
                <dt>Customer</dt>
                <dd>
                  {customer.name}
                  {customer.phone && <div className="muted">{customer.phone}</div>}
                  {customer.email && <div className="muted">{customer.email}</div>}
                </dd>
              </div>
              <div>
                <dt>Vehicle</dt>
                <dd>
                  {vehicle.year} {vehicle.make} {vehicle.model}
                  <div className="muted">VIN {vehicle.vin}</div>
                </dd>
              </div>
              <div>
                <dt>Mileage in</dt>
                <dd>{workOrder.mileageIn != null ? workOrder.mileageIn.toLocaleString() : <span className="muted">Not recorded</span>}</dd>
              </div>
              <div>
                <dt>Technician</dt>
                <dd>{workOrder.technician?.name ?? <span className="muted">Unassigned</span>}</dd>
              </div>
              <div>
                <dt>Opened</dt>
                <dd>
                  {new Date(workOrder.createdAt).toLocaleString()}
                  {workOrder.creator?.user?.name && <div className="muted">by {workOrder.creator.user.name}</div>}
                </dd>
              </div>
              {workOrder.completedAt && (
                <div>
                  <dt>Completed</dt>
                  <dd>{new Date(workOrder.completedAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="panel">
            <h2 className="section-head">Charges</h2>
            <dl className="totals">
              <div><dt>Parts</dt><dd>{money(partsTotal)}</dd></div>
              <div><dt>Services</dt><dd>{money(servicesTotal)}</dd></div>
              <div className="grand"><dt>Total</dt><dd>{money(partsTotal + servicesTotal)}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}