-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'user';

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user';
