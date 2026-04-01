"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { UpdateEmailDialog } from "@/components/settings/update-email-dialog";
import { UpdatePasswordDialog } from "@/components/settings/update-password-dialog";
import { PencilIcon, CheckIcon, XIcon, MailIcon, ClockIcon } from "lucide-react";

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
  // Check expiry every 30s
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
        <CardTitle>Account</CardTitle>
        <CardDescription>Manage your personal information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Name */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Label className="text-muted-foreground text-xs">Name</Label>
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-8"
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveName}>
                  <CheckIcon className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
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
          </div>
          {!editingName && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingName(true)}>
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Separator />

        {/* Email */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Label className="text-muted-foreground text-xs">Email</Label>
            <p className="text-sm font-medium">{user.email || "Not set"}</p>
            {hasPendingEmail && !pendingExpired && (
              <div className="flex items-center gap-2 mt-1.5">
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
              <div className="flex items-center gap-2 mt-1.5">
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
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setEmailDialogOpen(true)}
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* Password */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Label className="text-muted-foreground text-xs">Password</Label>
            <p className="text-sm font-medium">••••••••</p>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPasswordDialogOpen(true)}>
            <PencilIcon className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* Phone */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Label className="text-muted-foreground text-xs">Phone Number</Label>
            {editingPhone ? (
              <div className="flex items-center gap-2">
                <Input
                  value={phoneValue}
                  onChange={(e) => setPhoneValue(e.target.value)}
                  className="h-8"
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSavePhone}>
                  <CheckIcon className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
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
          </div>
          {!editingPhone && (
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingPhone(true)}>
              <PencilIcon className="h-4 w-4" />
            </Button>
          )}
        </div>

        <UpdateEmailDialog
          open={emailDialogOpen}
          onOpenChange={setEmailDialogOpen}
          currentEmail={user.email ?? ""}
        />
        <UpdatePasswordDialog
          open={passwordDialogOpen}
          onOpenChange={setPasswordDialogOpen}
        />
      </CardContent>
    </Card>
  );
}
