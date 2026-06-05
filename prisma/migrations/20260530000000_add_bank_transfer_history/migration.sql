-- Track bank-to-bank transfers without treating them as spends.
CREATE TABLE "BankTransfer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fromAccountId" TEXT NOT NULL,
  "toAccountId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "notes" TEXT,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BankTransfer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankTransfer_userId_date_idx" ON "BankTransfer"("userId", "date");
CREATE INDEX "BankTransfer_fromAccountId_idx" ON "BankTransfer"("fromAccountId");
CREATE INDEX "BankTransfer_toAccountId_idx" ON "BankTransfer"("toAccountId");

ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransfer" ADD CONSTRAINT "BankTransfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
