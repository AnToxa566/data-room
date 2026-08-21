/*
  Warnings:

  - You are about to drop the column `linkToken` on the `shares` table. All the data in the column will be lost.
  - Added the required column `mode` to the `shares` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ShareMode" AS ENUM ('EMAIL', 'PUBLIC');

-- DropIndex
DROP INDEX "shares_linkToken_key";

-- AlterTable
ALTER TABLE "shares" DROP COLUMN "linkToken",
ADD COLUMN     "mode" "ShareMode" NOT NULL;
