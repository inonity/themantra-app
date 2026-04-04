"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UpdateEmailDialog } from "@/components/settings/update-email-dialog";
import { UpdatePasswordDialog } from "@/components/settings/update-password-dialog";
import { PhoneInput } from "@/components/ui/phone-input";
import { Badge } from "@/components/ui/badge";
import {
  PencilIcon,
  CheckIcon,
  XIcon,
  MailIcon,
  ClockIcon,
  UserIcon,
  PhoneIcon,
  LockIcon,
} from "lucide-react";

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return (email?.[0] ?? "?").toUpperCase();
}

type FieldRowProps = {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
};

function FieldRow({ icon, label, children, action }: FieldRowProps) {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {children}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function AccountSection({ user }: { user: Doc<"users"> }) {
  const updateProfile = useMutation(api.users.updateProfile);
  const cancelPendingEmail = useMutation(api.users.cancelPendingEmail);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user.name ?? "");
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneValue, setPhoneValue] = useState(user.phone ?? "");

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const hasPendingEmail = !!user.pendingEmail;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const pendingExpired = user.pendingEmailExpiresAt
    ? now > user.pendingEmailExpiresAt
    : false;

  async function handleSaveName() {
    try {
      await updateProfile({ name: nameValue });
      toast.success("Name updated");
      setEditingName(false);
    } catch {
      toast.error("Failed to update name");
    }
  }

  async function handleSavePhone() {
    try {
      await updateProfile({ phone: phoneValue });
      toast.success("Phone number updated");
      setEditingPhone(false);
    } catch {
      toast.error("Failed to update phone number");
    }
  }

  async function handleCancelPendingEmail() {
    try {
      await cancelPendingEmail();
      toast.success("Pending email change cancelled");
    } catch {
      toast.error("Failed to cancel pending email change");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-lg font-semibold">
            {getInitials(user.name, user.email)}
          </div>
          <div>
            <CardTitle>Account</CardTitle>
            <CardDescription>Manage your personal information</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="divide-y px-6 pb-2">
        {/* Name */}
        <FieldRow
          icon={<UserIcon className="h-4 w-4" />}
          label="Name"
          action={
            !editingName ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setEditingName(true)}
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </Button>
            ) : undefined
          }
        >
          {editingName ? (
            <div className="flex items-center gap-2 pt-0.5">
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                className="h-8"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSaveName}>
                <CheckIcon className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  setEditingName(false);
                  setNameValue(user.name ?? "");
                }}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-sm font-medium">{user.name || "Not set"}</p>
          )}
        </FieldRow>

        {/* Email */}
        <FieldRow
          icon={<MailIcon className="h-4 w-4" />}
          label="Email"
          action={
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setEmailDialogOpen(true)}
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </Button>
          }
        >
          <p className="text-sm font-medium">{user.email || "Not set"}</p>
          {hasPendingEmail && !pendingExpired && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 text-xs">
                <MailIcon className="h-3 w-3" />
                Changing to: {user.pendingEmail}
              </Badge>
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                <ClockIcon className="h-3 w-3" />
                Awaiting confirmation
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={handleCancelPendingEmail}
              >
                Cancel
              </Button>
            </div>
          )}
          {hasPendingEmail && pendingExpired && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="destructive" className="gap-1 text-xs">
                Expired
              </Badge>
              <span className="text-xs text-muted-foreground">
                Change to {user.pendingEmail} has expired.
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground"
                onClick={handleCancelPendingEmail}
              >
                Dismiss
              </Button>
            </div>
          )}
        </FieldRow>

        {/* Password */}
        <FieldRow
          icon={<LockIcon className="h-4 w-4" />}
          label="Password"
          action={
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => setPasswordDialogOpen(true)}
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </Button>
          }
        >
          <p className="text-sm font-medium tracking-widest">••••••••</p>
        </FieldRow>

        {/* Phone */}
        <FieldRow
          icon={<PhoneIcon className="h-4 w-4" />}
          label="Phone Number"
          action={
            !editingPhone ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setEditingPhone(true)}
              >
                <PencilIcon className="h-3.5 w-3.5" />
              </Button>
            ) : undefined
          }
        >
          {editingPhone ? (
            <div className="flex items-center gap-2 pt-0.5">
              <PhoneInput value={phoneValue} onChange={setPhoneValue} />
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSavePhone}>
                <CheckIcon className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  setEditingPhone(false);
                  setPhoneValue(user.phone ?? "");
                }}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-sm font-medium">{user.phone || "Not set"}</p>
          )}
        </FieldRow>
      </CardContent>

      <UpdateEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
        currentEmail={user.email ?? ""}
      />
      <UpdatePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
      />
    </Card>
  );
}
