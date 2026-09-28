"use client";

import { LogOutIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { signOut } from "@/server/actions/auth";

/**
 * Standalone sign-out button for auth-adjacent pages (e.g. `/onboarding`).
 * Opens a small confirm menu with an explicit Cancel option before firing the
 * `signOut` server action (clears the session and redirects to `/login`).
 */
export const SignOutButton = () => (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button variant="default" className="w-full font-bold">
        <LogOutIcon />
        Sign-out
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader
        description="Log-out on this Account?"
        title="Confirm log-out process"
      />
      <AlertDialogFooter className="w-full">
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogClose asChild>
          <AlertDialogAction variant="destructive" onClick={() => signOut()}>
            <LogOutIcon />
            Logout
          </AlertDialogAction>
        </AlertDialogClose>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
