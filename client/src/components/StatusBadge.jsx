import { statusInfo } from '../statuses.js';

export default function StatusBadge({ status }) {
    const { label, tone } = statusInfo(status);
    return <span className={`status status-${tone}`}>{label}</span>;
}