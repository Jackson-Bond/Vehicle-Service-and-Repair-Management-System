export const TEMPLATES = {
  service_requested: (d) =>
    `Hi ${d.name}, ${d.shop} received your service request for your ${d.vehicle}. We'll update you as it progresses.`,
  checked_in: (d) =>
    `Hi ${d.name}, your ${d.vehicle} has been checked in at ${d.shop}.`,
  customer_approval: (d) =>
    `Hi ${d.name}, the diagnosis for your ${d.vehicle} is ready. Please contact ${d.shop} to review and approve the work.`,
  approved: (d) =>
    `Thanks ${d.name}, your approval is recorded. ${d.shop} will begin work on your ${d.vehicle}.`,
  completed: (d) =>
    `Good news ${d.name}, the repair on your ${d.vehicle} is complete and ready for pickup at ${d.shop}.`,
  declined: (d) =>
    `Hi ${d.name}, we've recorded that you declined the work on your ${d.vehicle}. Contact ${d.shop} if that changes.`,
  cancelled: (d) =>
    `Hi ${d.name}, the work order for your ${d.vehicle} at ${d.shop} has been cancelled.`,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}


export function formatEmailHtml({ shop, vehicle, text, workOrderId }) {
  const font = "'Barlow','Segoe UI',Arial,sans-serif";
  const condensed = "'Barlow Semi Condensed','Arial Narrow','Segoe UI',Arial,sans-serif";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(shop)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f2f3ef;font-family:${font};color:#1c2b36;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f2f3ef;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #d6dad8;">
            <tr>
              <td style="padding:16px 24px;background-color:#1c2b36;color:#ffffff;font-family:${condensed};font-size:18px;font-weight:bold;">
                ${escapeHtml(shop)}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 24px 8px;font-size:16px;line-height:1.6;color:#1c2b36;">
                ${escapeHtml(text)}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 28px;font-size:16px;line-height:1.5;color:#1c2b36;">
                <br>${escapeHtml(shop)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}