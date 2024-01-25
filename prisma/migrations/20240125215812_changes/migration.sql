/*
  Warnings:

  - You are about to drop the column `chat_id` on the `mailing_users` table. All the data in the column will be lost.
  - Added the required column `user_id` to the `records` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "mailing_users_chat_id_key";

-- AlterTable
ALTER TABLE "mailing_users" DROP COLUMN "chat_id";

-- AlterTable
ALTER TABLE "records" ADD COLUMN     "user_id" INTEGER NOT NULL;
