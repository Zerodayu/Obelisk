-- Role request approval workflow
-- Users self-select a requested role at sign-up; a system_admin confirms it.
-- Until confirmed, the user's effective role stays `user`.

-- Create new enum type
CREATE TYPE "RoleRequestStatus" AS ENUM ('none', 'pending', 'approved', 'denied');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "requested_role" "UserRole";
ALTER TABLE "user" ADD COLUMN "role_request_status" "RoleRequestStatus" NOT NULL DEFAULT 'none';
