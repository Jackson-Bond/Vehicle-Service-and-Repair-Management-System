import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, currentToken } from '../api.js';
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

  // check-in, approval, assignment, history, notifications, invoice
  const [checkIn, setCheckIn] = useState({ mileageIn: '', conditionNotes: '' });
  const [approvalMethod, setApprovalMethod] = useState('in_person');
  const [approvalNote, setApprovalNote] = useState('');
  const [technicians, setTechnicians] = useState([]);
  const [technicianId, setTechnicianId] = useState('');
  const [history, setHistory] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [invoiceMessage, setInvoiceMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [version, setVersion] = useState(0);

  function handleApiError(err, setMessage) {
    if (err.status === 401) onLogout();
    else setMessage(err.message);
  }

  function showWorkOrder(data) {
    setVersion((v) => v + 1);
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

  const isManager = session.role === 'manager';

  // history, notification log and invoice refresh after every change to the work order
  useEffect(() => {
    if (!workOrder) return;
    api(`/api/work-orders/${id}/history`, session.token).then(setHistory).catch(() => {});
    api(`/api/work-orders/${id}/notifications`, session.token).then(setNotifications).catch(() => {});
    if (isManager && ['completed', 'closed'].includes(workOrder.status)) {
      api(`/api/work-orders/${id}/invoice`, session.token)
        .then(setInvoice)
        .catch((err) => { if (err.status === 404) setInvoice(null); });
    } else {
      setInvoice(null);
    }
  }, [version]);

  useEffect(() => {
    if (!isManager) return;
    api('/api/users?role=technician', session.token).then(setTechnicians).catch(() => {});
  }, [isManager, session.token]);

  async function assignTechnician(submit) {
    submit.preventDefault();
    if (!technicianId) return setStatusMessage('Choose a technician');
    setStatusMessage('');
    try {
      showWorkOrder(await api(`/api/work-orders/${id}/technician`, session.token, {
        method: 'PATCH',
        body: JSON.stringify({ technicianId: Number(technicianId) }),
      }));
      setTechnicianId('');
    } catch (err) {
      handleApiError(err, setStatusMessage);
    }
  }

  async function checkInVehicle(submit) {
    submit.preventDefault();
    await changeStatus('checked_in', {
      mileageIn: checkIn.mileageIn === '' ? undefined : Number(checkIn.mileageIn),
      conditionNotes: checkIn.conditionNotes,
    });
  }

  async function createInvoice() {
    setInvoiceMessage('');
    try {
      setInvoice(await api(`/api/work-orders/${id}/invoice`, session.token, { method: 'POST' }));
      setVersion((v) => v + 1);
    } catch (err) {
      handleApiError(err, setInvoiceMessage);
    }
  }

  async function recordPayment(status) {
    setInvoiceMessage('');
    try {
      setInvoice(await api(`/api/work-orders/${id}/invoice/payment`, session.token, {
        method: 'PATCH',
        body: JSON.stringify({ status, method: status === 'paid' ? paymentMethod : undefined }),
      }));
    } catch (err) {
      handleApiError(err, setInvoiceMessage);
    }
  }

  async function openInvoicePdf() {
    setInvoiceMessage('');
    try {
      const response = await fetch(`/api/work-orders/${id}/invoice/pdf`, {
        headers: { Authorization: `Bearer ${currentToken(session.token)}` },
      });
      if (!response.ok) throw new Error('Could not load the invoice PDF');
      const url = URL.createObjectURL(await response.blob());
      window.open(url, '_blank');
    } catch (err) {
      setInvoiceMessage(err.message);
    }
  }

  async function emailInvoice() {
    setInvoiceMessage('');
    try {
      const result = await api(`/api/work-orders/${id}/invoice/email`, session.token, { method: 'POST' });
      setInvoiceMessage(result.result === 'sent' ? 'Invoice emailed to the customer.'
        : result.result === 'logged' ? 'Email gateway is not configured, so the message was logged only.'
        : 'Email delivery failed; see the notification log.');
      setVersion((v) => v + 1);
    } catch (err) {
      handleApiError(err, setInvoiceMessage);
    }
  }

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
  // services and parts may still be added during repair; the server then asks for a new approval
  const canAddItems = workOrder.canEdit && ['diagnosis', 'in_repair'].includes(status);
  const hadApproval = workOrder.approvals.some((a) => a.decision === 'approved');
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
            // handled by the check-in form, the approval panel and the invoice panel
            .filter((nextStatus) => !(nextStatus === 'checked_in'))
            .filter((nextStatus) => !(status === 'customer_approval' && ['declined', 'in_repair'].includes(nextStatus)))
            .filter((nextStatus) => !(['declined', 'closed'].includes(nextStatus) && !isManager))
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
          {status === 'service_requested' && (
            <section className="panel">
              <h2 className="section-head">Check in vehicle</h2>
              <form className="form" onSubmit={checkInVehicle}>
                <div className="field">
                  <label htmlFor="checkInMileage">Current mileage</label>
                  <input
                    id="checkInMileage"
                    type="number"
                    min="0"
                    step="1"
                    value={checkIn.mileageIn}
                    onChange={(e) => setCheckIn({ ...checkIn, mileageIn: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="conditionNotes">Condition notes</label>
                  <textarea
                    id="conditionNotes"
                    rows="2"
                    placeholder="Scratches, warning lights, items left in the car"
                    value={checkIn.conditionNotes}
                    onChange={(e) => setCheckIn({ ...checkIn, conditionNotes: e.target.value })}
                  />
                </div>
                <div className="form-actions"><button type="submit" className="btn">Check in</button></div>
              </form>
            </section>
          )}

          {status === 'customer_approval' && (
            <section className="panel">
              <h2 className="section-head">Customer approval</h2>
              {isManager ? (
                <>
                  <p className="muted">
                    Estimate {money(workOrder.estimate.total)}
                    {workOrder.approvedTotal != null && ` (previously approved ${money(workOrder.approvedTotal)})`}.
                    Tick the services below, record how the customer answered, then approve or decline.
                  </p>
                  <div className="field">
                    <label htmlFor="approvalMethod">Customer answered by</label>
                    <select id="approvalMethod" value={approvalMethod} onChange={(e) => setApprovalMethod(e.target.value)}>
                      <option value="in_person">In person</option>
                      <option value="phone">Phone</option>
                      <option value="sms">SMS</option>
                      <option value="email">Email</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="approvalNote">Note (optional)</label>
                    <input id="approvalNote" value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} />
                  </div>
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn"
                      disabled={selectedServiceIds.length === 0}
                      onClick={() => changeStatus('approved', { approvedServiceIds: selectedServiceIds, approvalMethod, note: approvalNote })}
                    >
                      Record approval
                    </button>
                    {hadApproval ? (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => changeStatus('in_repair', { approvalMethod, note: approvalNote })}
                      >
                        Decline extra work, continue repair
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => window.confirm('Record that the customer declined?') && changeStatus('declined', { approvalMethod, note: approvalNote })}
                      >
                        Record decline
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="muted">Waiting for the front desk to record the customer's answer.</p>
              )}
            </section>
          )}

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

            {canAddItems && (
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
                <p>Select the services the customer approves, then record the decision in the approval panel above.</p>
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
                {canAddItems && (
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
                <dd>
                  {workOrder.technician?.name ?? <span className="muted">Unassigned</span>}
                  {isManager && !['completed', 'closed', 'declined', 'cancelled'].includes(status) && (
                    <form className="add-part" onSubmit={assignTechnician} style={{ marginTop: 8 }}>
                      <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)} aria-label="Technician">
                        <option value="">{workOrder.technician ? 'Reassign to...' : 'Assign to...'}</option>
                        {technicians.filter((t) => t.id !== workOrder.assignedTechnician).map((t) => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button type="submit" className="btn btn-secondary">Save</button>
                    </form>
                  )}
                </dd>
              </div>
              {workOrder.conditionNotes && (
                <div>
                  <dt>Condition notes</dt>
                  <dd>{workOrder.conditionNotes}</dd>
                </div>
              )}
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
            <h2 className="section-head">Estimate</h2>
            <dl className="totals">
              <div><dt>Labor</dt><dd>{money(workOrder.estimate.labor)}</dd></div>
              <div><dt>Parts</dt><dd>{money(workOrder.estimate.parts)}</dd></div>
              <div><dt>Tax ({(workOrder.estimate.taxRate * 100).toFixed(2)}%)</dt><dd>{money(workOrder.estimate.tax)}</dd></div>
              <div className="grand"><dt>Total</dt><dd>{money(workOrder.estimate.total)}</dd></div>
              {workOrder.approvedTotal != null && (
                <div><dt>Approved</dt><dd>{money(workOrder.approvedTotal)}</dd></div>
              )}
            </dl>
          </section>

          {isManager && ['completed', 'closed'].includes(status) && (
            <section className="panel">
              <h2 className="section-head">Invoice</h2>
              {!invoice ? (
                <button type="button" className="btn" onClick={createInvoice}>Generate invoice</button>
              ) : (
                <>
                  <dl className="totals">
                    <div><dt>Subtotal</dt><dd>{money(invoice.subtotal)}</dd></div>
                    <div><dt>Tax</dt><dd>{money(invoice.tax)}</dd></div>
                    <div className="grand"><dt>Total</dt><dd>{money(invoice.total)}</dd></div>
                    <div>
                      <dt>Payment</dt>
                      <dd>{invoice.paymentStatus === 'paid' ? `Paid (${invoice.paymentMethod})` : 'Unpaid'}</dd>
                    </div>
                  </dl>
                  <div className="form-actions">
                    <button type="button" className="btn btn-secondary" onClick={openInvoicePdf}>View / print PDF</button>
                    <button type="button" className="btn btn-secondary" onClick={emailInvoice}>Email PDF</button>
                  </div>
                  {status !== 'closed' && (
                    invoice.paymentStatus === 'paid' ? (
                      <button type="button" className="btn btn-quiet" onClick={() => recordPayment('unpaid')}>Mark unpaid</button>
                    ) : (
                      <div className="add-part">
                        <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label="Payment method">
                          <option value="card">Card</option>
                          <option value="cash">Cash</option>
                          <option value="check">Check</option>
                          <option value="other">Other</option>
                        </select>
                        <button type="button" className="btn" onClick={() => recordPayment('paid')}>Record payment</button>
                      </div>
                    )
                  )}
                </>
              )}
              {invoiceMessage && <p className="message" role="status">{invoiceMessage}</p>}
            </section>
          )}

          <section className="panel">
            <h2 className="section-head">Status history</h2>
            {history.length === 0 ? <p className="muted">No history yet.</p> : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {history.map((h) => (
                  <li key={h.id} style={{ marginBottom: 8 }}>
                    <strong>{STATUS_LABELS[h.toStatus] ?? h.toStatus}</strong>
                    <div className="muted">
                      {new Date(h.changedAt).toLocaleString()} by {h.changedByName}
                      {h.note ? ` - ${h.note}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="section-head">Customer notifications</h2>
            {notifications.length === 0 ? <p className="muted">None sent yet.</p> : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {notifications.map((n) => (
                  <li key={n.id} style={{ marginBottom: 8 }}>
                    <strong>{n.event.replace(/_/g, ' ')}</strong> via {n.channel}: {n.result}
                    <div className="muted">{new Date(n.sentAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}