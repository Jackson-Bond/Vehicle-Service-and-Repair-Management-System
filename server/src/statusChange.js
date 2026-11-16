// Writes one status_history row (FR-13). Always call inside the same transaction as the change.
export function recordStatus(tx, workOrder, toStatus, userId, note = null) {
  return tx.statusHistory.create({
    data: {
      workOrderId: workOrder.id,
      shopId: workOrder.shopId,
      fromStatus: workOrder.status ?? null,
      toStatus,
      changedBy: userId,
      note,
    },
  });
}
