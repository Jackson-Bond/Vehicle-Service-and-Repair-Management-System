-- CreateTable
CREATE TABLE "shop" (
    "shop_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "next_employee_number" INTEGER NOT NULL DEFAULT 1001,

    CONSTRAINT "shop_pkey" PRIMARY KEY ("shop_id")
);

-- CreateTable
CREATE TABLE "user" (
    "user_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "shop_user" (
    "shop_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "employee_code" INTEGER NOT NULL,

    CONSTRAINT "shop_user_pkey" PRIMARY KEY ("shop_id","user_id")
);

-- CreateTable
CREATE TABLE "customer" (
    "customer_id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "preferred_contact_method" TEXT,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "vehicle" (
    "vehicle_id" SERIAL NOT NULL,
    "vin" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,

    CONSTRAINT "vehicle_pkey" PRIMARY KEY ("vehicle_id")
);

-- CreateTable
CREATE TABLE "customer_vehicle" (
    "customer_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,

    CONSTRAINT "customer_vehicle_pkey" PRIMARY KEY ("customer_id","vehicle_id")
);

-- CreateTable
CREATE TABLE "work_order" (
    "work_order_id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "assigned_technician" INTEGER,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "mileage_in" INTEGER,
    "customer_complaint" TEXT,
    "diagnosis" TEXT,
    "notes" TEXT,

    CONSTRAINT "work_order_pkey" PRIMARY KEY ("work_order_id")
);

-- CreateTable
CREATE TABLE "part" (
    "part_id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "part_number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "quantity_in_stock" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "part_pkey" PRIMARY KEY ("part_id")
);

-- CreateTable
CREATE TABLE "work_order_part" (
    "work_order_id" INTEGER NOT NULL,
    "part_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "work_order_part_pkey" PRIMARY KEY ("work_order_id","part_id")
);

-- CreateTable
CREATE TABLE "service" (
    "service_id" SERIAL NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "service_pkey" PRIMARY KEY ("service_id")
);

-- CreateTable
CREATE TABLE "work_order_service" (
    "work_order_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "shop_id" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "work_order_service_pkey" PRIMARY KEY ("work_order_id","service_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_user_shop_id_employee_code_key" ON "shop_user"("shop_id", "employee_code");

-- CreateIndex
CREATE INDEX "customer_shop_id_idx" ON "customer"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_customer_id_shop_id_key" ON "customer"("customer_id", "shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_vin_key" ON "vehicle"("vin");

-- CreateIndex
CREATE INDEX "customer_vehicle_vehicle_id_idx" ON "customer_vehicle"("vehicle_id");

-- CreateIndex
CREATE INDEX "work_order_shop_id_status_idx" ON "work_order"("shop_id", "status");

-- CreateIndex
CREATE INDEX "work_order_shop_id_created_at_idx" ON "work_order"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "work_order_customer_id_idx" ON "work_order"("customer_id");

-- CreateIndex
CREATE INDEX "work_order_vehicle_id_idx" ON "work_order"("vehicle_id");

-- CreateIndex
CREATE INDEX "work_order_assigned_technician_idx" ON "work_order"("assigned_technician");

-- CreateIndex
CREATE UNIQUE INDEX "work_order_work_order_id_shop_id_key" ON "work_order"("work_order_id", "shop_id");

-- CreateIndex
CREATE INDEX "part_shop_id_idx" ON "part"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "part_part_id_shop_id_key" ON "part"("part_id", "shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "part_shop_id_part_number_key" ON "part"("shop_id", "part_number");

-- CreateIndex
CREATE INDEX "work_order_part_part_id_idx" ON "work_order_part"("part_id");

-- CreateIndex
CREATE INDEX "work_order_part_shop_id_idx" ON "work_order_part"("shop_id");

-- CreateIndex
CREATE INDEX "service_shop_id_idx" ON "service"("shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_service_id_shop_id_key" ON "service"("service_id", "shop_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_shop_id_name_key" ON "service"("shop_id", "name");

-- CreateIndex
CREATE INDEX "work_order_service_service_id_idx" ON "work_order_service"("service_id");

-- CreateIndex
CREATE INDEX "work_order_service_shop_id_idx" ON "work_order_service"("shop_id");

-- AddForeignKey
ALTER TABLE "shop_user" ADD CONSTRAINT "shop_user_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shop"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_user" ADD CONSTRAINT "shop_user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shop"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_vehicle" ADD CONSTRAINT "customer_vehicle_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_vehicle" ADD CONSTRAINT "customer_vehicle_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shop"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_customer_id_shop_id_fkey" FOREIGN KEY ("customer_id", "shop_id") REFERENCES "customer"("customer_id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_customer_id_vehicle_id_fkey" FOREIGN KEY ("customer_id", "vehicle_id") REFERENCES "customer_vehicle"("customer_id", "vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicle"("vehicle_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_shop_id_created_by_fkey" FOREIGN KEY ("shop_id", "created_by") REFERENCES "shop_user"("shop_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order" ADD CONSTRAINT "work_order_assigned_technician_fkey" FOREIGN KEY ("assigned_technician") REFERENCES "user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part" ADD CONSTRAINT "part_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shop"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_part" ADD CONSTRAINT "work_order_part_work_order_id_shop_id_fkey" FOREIGN KEY ("work_order_id", "shop_id") REFERENCES "work_order"("work_order_id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_part" ADD CONSTRAINT "work_order_part_part_id_shop_id_fkey" FOREIGN KEY ("part_id", "shop_id") REFERENCES "part"("part_id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service" ADD CONSTRAINT "service_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shop"("shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_service" ADD CONSTRAINT "work_order_service_work_order_id_shop_id_fkey" FOREIGN KEY ("work_order_id", "shop_id") REFERENCES "work_order"("work_order_id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_service" ADD CONSTRAINT "work_order_service_service_id_shop_id_fkey" FOREIGN KEY ("service_id", "shop_id") REFERENCES "service"("service_id", "shop_id") ON DELETE RESTRICT ON UPDATE CASCADE;
