-- Track which account funded lend/borrow records and support partial settlements.
ALTER TABLE "MoneyLink" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "MoneyLink" ADD COLUMN "settledAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX "MoneyLink_bankAccountId_idx" ON "MoneyLink"("bankAccountId");

ALTER TABLE "MoneyLink"
ADD CONSTRAINT "MoneyLink_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
