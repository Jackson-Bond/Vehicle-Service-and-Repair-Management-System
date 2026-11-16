-- AlterTable
ALTER TABLE "shop" ADD COLUMN "tax_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.0825;
ALTER TABLE "shop_user" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "work_order" ADD COLUMN "condition_notes" TEXT;

-- CreateTable
CREATE TABLE "status_history" (
    "status_history_id" SERIAL NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "changed_by" INTEGER NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "status_history_pkey" PRIMARY KEY ("status_history_id")
);

CREATE TABLE "approval" (
    "approval_id" SERIAL NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "approved_total" DECIMAL(10,2) NOT NULL,
    "recorded_by" INTEGER NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "approval_pkey" PRIMARY KEY ("approval_id")
);

CREATE TABLE "invoice" (
    "invoice_id" SERIAL NOT NULL,
    "work_order_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax_rate" DECIMAL(6,4) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'unpaid',
    "payment_method" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_pkey" PRIMARY KEY ("invoice_id")
);

CREATE TABLE "notification_log" (
    "notification_id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "work_order_id" INTEGER,
    "customer_id" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("notification_id")
);

CREATE TABLE "audit_log" (
    "audit_id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("audit_id")
);

-- CreateIndex
CREATE INDEX "status_history_work_order_id_idx" ON "status_history"("work_order_id");
CREATE INDEX "approval_work_order_id_idx" ON "approval"("work_order_id");
CREATE UNIQUE INDEX "invoice_work_order_id_key" ON "invoice"("work_order_id");
CREATE INDEX "invoice_shop_id_idx" ON "invoice"("shop_id");
CREATE INDEX "notification_log_shop_id_sent_at_idx" ON "notification_log"("shop_id", "sent_at");
CREATE INDEX "notification_log_work_order_id_idx" ON "notification_log"("work_order_id");
CREATE INDEX "audit_log_shop_id_created_at_idx" ON "audit_log"("shop_id", "created_at");
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("work_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval" ADD CONSTRAINT "approval_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("work_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("work_order_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_work_order_id_fkey" FOREIGN KEY ("work_order_id") REFERENCES "work_order"("work_order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Status history, approvals and audit rows can never be changed or removed (NFR-08)
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are insert-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER status_history_insert_only BEFORE UPDATE OR DELETE ON "status_history"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER approval_insert_only BEFORE UPDATE OR DELETE ON "approval"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER audit_log_insert_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
