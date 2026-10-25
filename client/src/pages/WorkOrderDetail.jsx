import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';

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

  if (!workOrder) return <p>Loading...</p>;

  const isClosed = ['completed', 'cancelled'].includes(workOrder.status);
  const editable = workOrder.canEdit && !isClosed;

  const partsTotal = workOrder.parts.reduce(
    (sum, line) => sum + Number(line.unitPrice) * line.quantity,
    0
  );
  const servicesTotal = workOrder.services.reduce((sum, line) => sum + Number(line.price), 0);

  return (
    <div>
      <Link to="/">← Back</Link>
      <h1>Work Order #{workOrder.id}</h1>

      <table border="1">
        <tbody>
          <tr><th>Status</th><td>{workOrder.status}</td></tr>
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
      <table border="1">
        <thead>
          <tr><th>Service</th><th>Price</th><th>Notes</th></tr>
        </thead>
        <tbody>
          {workOrder.services.map((line) => (
            <tr key={line.serviceId}>
              <td>{line.service.name}</td>
              <td>{money(line.price)}</td>
              <td>{line.notes ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {workOrder.services.length === 0 && <p>No services recorded.</p>}
      <p>Services total: {money(servicesTotal)}</p>
    </div>
  );
}