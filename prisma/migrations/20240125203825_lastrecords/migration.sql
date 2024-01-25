-- CreateTable
CREATE TABLE "mailing_users" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "chat_id" INTEGER NOT NULL,

    CONSTRAINT "mailing_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records" (
    "id" SERIAL NOT NULL,
    "schedule" TEXT NOT NULL,
    "change" TEXT NOT NULL,

    CONSTRAINT "records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mailing_users_user_id_key" ON "mailing_users"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "mailing_users_chat_id_key" ON "mailing_users"("chat_id");
