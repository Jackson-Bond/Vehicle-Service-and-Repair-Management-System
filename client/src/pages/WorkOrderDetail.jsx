import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { STATUS_LABELS, PROGRESS_LABELS } from '../statuses.js';
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
  const [statusMessage, setStatusMessage] = useState('');

  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState('');
  const [serviceMessage, setServiceMessage] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);

  function handleApiError(err, setMessage) {
    if (err.status === 401) onLogout();
    else setMessage(err.message);
  }

  function showWorkOrder(data) {
    setWorkOrder(data);
    setSelectedServiceIds(data.services.map((l) => l.serviceId));
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

  function loadServices() {
    api('/api/services', session.token)
      .then(setServices)
      .catch((err) => handleApiError(err, setServiceMessage));
  }

  useEffect(() => {
    api(`/api/work-orders/${id}`, session.token)
      .then(showWorkOrder)
      .catch((err) => handleApiError(err, setLoadError));
    loadParts();
    loadServices();
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

  async function addService(submit) {
    submit.preventDefault();
    setServiceMessage('');
    if (!serviceId) return setServiceMessage('Select a service');
    try {
      const data = await api(`/api/work-orders/${id}/services`, session.token, {
        method: 'POST',
        body: JSON.stringify({ serviceId: Number(serviceId) }),
      });
      showWorkOrder(data);
      setServiceId('');
    } catch (err) {
      handleApiError(err, setServiceMessage);
    }
  }

  async function removeService(sid) {
    setServiceMessage('');
    try {
      showWorkOrder(await api(`/api/work-orders/${id}/services/${sid}`, session.token, { method: 'DELETE' }));
    } catch (err) {
      handleApiError(err, setServiceMessage);
    }
  }

  async function setProgress(sid, progress) {
    setServiceMessage('');
    try {
      showWorkOrder(await api(`/api/work-orders/${id}/services/${sid}/progress`, session.token, {
        method: 'PATCH',
        body: JSON.stringify({ progress }),
      }));
    } catch (err) {
      handleApiError(err, setServiceMessage);
    }
  }

  function toggleService(sid) {
    setSelectedServiceIds((ids) =>
      ids.includes(sid) ? ids.filter((x) => x !== sid) : [...ids, sid]
    );
  }

  async function changeStatus(status, extra = {}) {
    setStatusMessage('');
    if (status === 'cancelled' && !window.confirm('Cancel this work order?')) return;
    if (status === 'completed' && !window.confirm('Mark this repair as completed?')) return;
    try {
      const data = await api(`/api/work-orders/${id}/status`, session.token, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...extra }),
      });
      showWorkOrder(data);
    } catch (err) {
      handleApiError(err, setStatusMessage);
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

  const status = workOrder.status;
  const canEditServices = workOrder.canEdit && status === 'diagnosis';
  const canEditProgress = workOrder.canEdit && status === 'in_repair';
  const showTodo = ['approved', 'in_repair', 'completed', 'closed'].includes(status);
  const todo = workOrder.services.filter((line) => line.approved);
  const pendingTodo = todo.some((line) => line.progress !== 'completed');
  const billable = showTodo ? todo : workOrder.services;
  const servicesTotal = billable.reduce((sum, line) => sum + Number(line.price), 0);

  const editable = workOrder.canEdit && workOrder.status === 'diagnosis';

  const partsTotal = workOrder.parts.reduce(
    (sum, line) => sum + Number(line.unitPrice) * line.quantity,
    0
  );
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

      {workOrder.allowedNextStatuses?.length > 0 && (
        <div className="form-actions status-actions">
          <span className="muted">Move to:</span>
          {workOrder.allowedNextStatuses
            .filter((nextStatus) => nextStatus !== 'approved')
            .map((nextStatus) => (
              <button
                key={nextStatus}
                type="button"
                className="btn btn-secondary"
                onClick={() => changeStatus(nextStatus)}
                disabled={nextStatus === 'completed' && pendingTodo}
              >
                {STATUS_LABELS[nextStatus] ?? nextStatus}
              </button>
            ))}
        </div>
      )}
      {statusMessage && <p className="message message-error" role="alert">{statusMessage}</p>}

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
            {status === 'customer_approval' ? (
              <div>
                <p>Select the services the customer approves:</p>
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr><th></th><th>Service</th><th className="num">Price</th></tr></thead>
                    <tbody>
                      {workOrder.services.map((line) => (
                        <tr key={line.serviceId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedServiceIds.includes(line.serviceId)}
                              onChange={() => toggleService(line.serviceId)}
                            />
                          </td>
                          <td>{line.service.name}</td>
                          <td className="num">{money(line.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  type="button"
                  className="btn"
                  onClick={() => changeStatus('approved', { approvedServiceIds: selectedServiceIds })}
                  disabled={selectedServiceIds.length === 0}
                >
                  Approve selected services
                </button>
              </div>
            ) : (
              <>
                {workOrder.services.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data">
                      <thead>
                        <tr>
                          <th>Service</th>
                          <th>Notes</th>
                          {showTodo && <th>Customer</th>}
                          <th className="num">Price</th>
                          {canEditServices && <th><span className="sr-only">Remove</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {workOrder.services.map((line) => (
                          <tr key={line.serviceId}>
                            <td>{line.service.name}</td>
                            <td className="muted">{line.notes ?? ''}</td>
                            {showTodo && <td>{line.approved ? 'Approved' : 'Not approved'}</td>}
                            <td className="num">{money(line.price)}</td>
                            {canEditServices && (
                              <td className="num">
                                <button type="button" className="btn btn-quiet" onClick={() => removeService(line.serviceId)}>
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
                  <p className="muted">No services recorded.</p>
                )}
                {canEditServices && (
                  <form className="add-part" onSubmit={addService}>
                    <div className="field">
                      <label htmlFor="serviceId">Add a service</label>
                      <select id="serviceId" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                        <option value="">Choose a service</option>
                        {services
                          .filter((service) => !workOrder.services.some((line) => line.serviceId === service.id))
                          .map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}, {money(service.defaultPrice)}
                            </option>
                          ))}
                      </select>
                    </div>
                    <button type="submit" className="btn btn-secondary">Add service</button>
                  </form>
                )}
              </>
            )}
            {serviceMessage && <p className="message message-error" role="alert">{serviceMessage}</p>}
          </section>

          {showTodo && (
            <section className="panel">
              <h2 className="section-head">To-do</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Service</th><th>Progress</th></tr></thead>
                  <tbody>
                    {todo.map((line) => (
                      <tr key={line.serviceId}>
                        <td>{line.service.name}</td>
                        <td>
                          {canEditProgress ? (
                            <select
                              value={line.progress}
                              onChange={(e) => setProgress(line.serviceId, e.target.value)}
                            >
                              {Object.entries(PROGRESS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          ) : (
                            PROGRESS_LABELS[line.progress]
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {status === 'in_repair' && pendingTodo && (
                <p className="muted">All services must be completed to complete this repair.</p>
              )}
            </section>
          )}
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