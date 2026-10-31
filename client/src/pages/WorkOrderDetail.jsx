import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { STATUS_LABELS, PROGRESS_LABELS } from '../statuses.js';

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

  if (!workOrder) return <p>Loading...</p>;

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
  return (
    <div>
      <Link to="/">← Back</Link>
      <h1>Work Order #{workOrder.id}</h1>

      <table border="1">
        <tbody>
          <tr>
            <th>Customer</th>
            <td>
              {workOrder.customer.name}
              {workOrder.customer.phone ? ` (${workOrder.customer.phone})` : ''}
              {workOrder.customer.email ? ` ${workOrder.customer.email}` : ''}
            </td>
          </tr>
          <tr>
            <th>Vehicle</th>
            <td>
              {workOrder.vehicle.year} {workOrder.vehicle.make} {workOrder.vehicle.model} - VIN {workOrder.vehicle.vin}
            </td>
          </tr>
          <tr>
            <th>Status</th>
            <td>
              {STATUS_LABELS[workOrder.status] ?? workOrder.status}
            </td>
          </tr>
          <tr><th>Mileage in</th><td>{workOrder.mileageIn ?? '-'}</td></tr>
          <tr><th>Technician</th><td>{workOrder.technician?.name ?? 'Unassigned'}</td></tr>
          <tr><th>Created by</th><td>{workOrder.creator?.user?.name ?? '-'}</td></tr>
          <tr><th>Created</th><td>{new Date(workOrder.createdAt).toLocaleString()}</td></tr>
          {workOrder.completedAt && (
            <tr><th>Completed</th><td>{new Date(workOrder.completedAt).toLocaleString()}</td></tr>
          )}
          <tr><th>Customer complaint</th><td>{workOrder.customerComplaint ?? '-'}</td></tr>
        </tbody>
      </table>

      {workOrder.allowedNextStatuses?.length > 0 && (
      <div>
        <p>Move to:</p>
        {workOrder.allowedNextStatuses
          ?.filter((s) => s !== 'approved')
          .map((s) => (
          <button
            key={s}
            onClick={() => changeStatus(s)}
            disabled={s === 'completed' && pendingTodo}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    )}
    {statusMessage && <p>{statusMessage}</p>}

      <h2>Diagnosis</h2>
      {editable ? (
        <form onSubmit={saveDiagnosis}>
          <div>
            <label>Diagnosis</label>
            <div>
              <textarea
                rows="4"
                cols="50"
                value={diagnosisForm.diagnosis}
                onChange={(e) => setDiagnosisForm({ ...diagnosisForm, diagnosis: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label>Recommended repairs</label>
            <div>
              <textarea
                rows="4"
                cols="50"
                value={diagnosisForm.recommendedRepairs}
                onChange={(e) => setDiagnosisForm({ ...diagnosisForm, recommendedRepairs: e.target.value })}
              />
            </div>
          </div>
          <button type="submit" disabled={savingDiagnosis}>
            {savingDiagnosis ? 'Saving...' : 'Save diagnosis'}
          </button>
          {diagnosisMessage && <p>{diagnosisMessage}</p>}
        </form>
      ) : (
        <div>
          <p><strong>Diagnosis:</strong> {workOrder.diagnosis ?? 'Not recorded yet'}</p>
          <p><strong>Recommended repairs:</strong> {workOrder.notes ?? 'None'}</p>
        </div>
      )}

      <h2>Parts Used</h2>
      <table border="1">
        <thead>
          <tr>
            <th>Part #</th>
            <th>Name</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Line total</th>
            {editable && <th></th>}
          </tr>
        </thead>
        <tbody>
          {workOrder.parts.map((line) => (
            <tr key={line.partId}>
              <td>{line.part.partNumber}</td>
              <td>{line.part.name}</td>
              <td>{line.quantity}</td>
              <td>{money(line.unitPrice)}</td>
              <td>{money(Number(line.unitPrice) * line.quantity)}</td>
              {editable && (
                <td><button onClick={() => removePart(line.partId)}>Remove</button></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {workOrder.parts.length === 0 && <p>No parts recorded.</p>}
      <p>Parts total: {money(partsTotal)}</p>

      {editable && (
        <form onSubmit={addPart}>
          <select
            value={partForm.partId}
            onChange={(e) => setPartForm({ ...partForm, partId: e.target.value })}
          >
            <option value="">(select a part)</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id} disabled={p.quantityInStock === 0}>
                {p.partNumber} - {p.name} - {money(p.price)} ({p.quantityInStock} in stock)
              </option>
            ))}
          </select>{' '}
          <input
            type="number"
            min="1"
            step="1"
            value={partForm.quantity}
            onChange={(e) => setPartForm({ ...partForm, quantity: e.target.value })}
            style={{ width: '4em' }}
          />{' '}
          <button type="submit" disabled={savingPart}>
            {savingPart ? 'Adding...' : 'Add part'}
          </button>
          {partMessage && <p>{partMessage}</p>}
        </form>
      )}

      <h2>Services</h2>

      {status === 'customer_approval' ? (
        <div>
          <p>Select the services the customer approves:</p>
          <table border="1">
            <thead><tr><th></th><th>Service</th><th>Price</th></tr></thead>
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
                  <td>{money(line.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => changeStatus('approved', { approvedServiceIds: selectedServiceIds })}
            disabled={selectedServiceIds.length === 0}
          >
            Approve selected services
          </button>
        </div>
      ) : (
        <table border="1">
          <thead>
            <tr>
              <th>Service</th>
              <th>Price</th>
              <th>Notes</th>
              {showTodo && <th>Customer</th>}
              {canEditServices && <th></th>}
            </tr>
          </thead>
          <tbody>
            {workOrder.services.map((line) => (
              <tr key={line.serviceId}>
                <td>{line.service.name}</td>
                <td>{money(line.price)}</td>
                <td>{line.notes ?? ''}</td>
                {showTodo && <td>{line.approved ? 'Approved' : 'Not Approved'}</td>}
                {canEditServices && (
                  <td><button onClick={() => removeService(line.serviceId)}>Remove</button></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {workOrder.services.length === 0 && <p>No services recorded.</p>}
      <p>Services total: {money(servicesTotal)}</p>

      {canEditServices && (
        <form onSubmit={addService}>
          <select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">(select a service)</option>
            {services
              .filter((service) => !workOrder.services.some((line) => line.serviceId === service.id))
              .map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} - {money(service.defaultPrice)}
                </option>
              ))}
          </select>{' '}
          <button type="submit">Add service</button>
        </form>
      )}
      {serviceMessage && <p>{serviceMessage}</p>}

      {showTodo && (
        <div>
          <h2>To-do</h2>
          <table border="1">
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
          {status === 'in_repair' && pendingTodo && <p>All services must be completed to complete this repair.</p>}
        </div>
      )}
    </div>
  );
}