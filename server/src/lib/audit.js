import prisma from './prisma.js';

// FR-26: record who did what. Pass a transaction client to make it part of the same commit.
export async function audit(user, action, entityType, entityId, details = null, client = prisma) {
  await client.auditLog.create({
    data: {
      shopId: user.shopId,
      userId: user.userId,
      action,
      entityType,
      entityId: entityId ?? null,
      details: details ?? undefined,
    },
  });
}

// For routes where an audit failure should not turn a saved change into an error.
export async function auditSafe(...args) {
  try {
    await audit(...args);
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}
