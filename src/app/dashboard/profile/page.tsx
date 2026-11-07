"use client";

import { useState, useEffect } from "react";
import { Camera, Mail, Phone, Lock, Eye, EyeOff, Save, User } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { TimezoneCard, TimezoneSuggestion } from "@/components/account/timezone";
import { CelebrationPrivacyCard } from "@/components/engagement/celebration-privacy";
import { ProfileChangeModal } from "../inbox/profile-change";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui-kit";
import { ProfileView } from "@/components/people/profile-view";

/** Everyone with an employee record (the company owner included) sees it (self service) and
 *  their account settings; an account without one sees the account settings only. */
export default function ProfilePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"record" | "account">("record");
  if (!user?.employee_id) return <AccountSettings />;
  return (
    <div>
      <PageHeader eyebrow="Account" title="My profile" description="Your employee record, documents and account. Some details need HR's approval to change." />
      <Tabs value={tab} onChange={setTab} items={[{ value: "record", label: "My record" }, { value: "account", label: "Account and password" }]} className="mb-6" />
      {tab === "record" ? <ProfileView self /> : <AccountSettings embedded />}
    </div>
  );
}

function AccountSettings({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [askingChange, setAskingChange] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Profile form
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{ full_name?: string; email?: string; phone?: string; config?: Record<string, unknown> }>("/auth/me");
        setFullName(data.full_name || "");
        setEmail(data.email || "");
        const biz = await api.get<{ phone?: string; config?: { avatar?: string } }>("/company/profile");
        setPhone(biz.phone || "");
        if (biz.config?.avatar) setAvatar(biz.config.avatar);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSaveProfile() {
    setSaving(true);
    try {
      await api.put("/company/profile", {
        config: { owner_name: fullName },
        phone: phone,
      });
      toast.success("Profile updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    const errors: Record<string, string> = {};
    if (!currentPassword) errors.current = "Current password is required";
    if (!newPassword) errors.new = "New password is required";
    else if (newPassword.length < 6) errors.new = "Minimum 6 characters";
    if (!confirmPassword) errors.confirm = "Please confirm password";
    else if (newPassword !== confirmPassword) errors.confirm = "Passwords don't match";
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setChangingPassword(true);
    try {
      // Verify current password by trying to login
      await api.post("/auth/login", { email, password: currentPassword });
      // Use forgot-password flow to reset
      const res = await api.post<{ code?: string }>("/auth/forgot-password", { email });
      const code = res.code;
      if (code) {
        await api.post("/auth/reset-password", { email, code, new_password: newPassword });
        toast.success("Password changed successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordErrors({});
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password";
      if (msg.toLowerCase().includes("invalid")) {
        setPasswordErrors({ current: "Current password is incorrect" });
      } else {
        toast.error(msg);
      }
    } finally {
      setChangingPassword(false);
    }
  }

  const initials = fullName
    ? fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {!embedded && <PageHeader eyebrow="Account" title="My profile" description="Your name, photo, contact number and password." />}
      <TimezoneSuggestion />

      {/* Profile Picture & Name */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="flex items-start gap-6">
          {/* Avatar with upload */}
          <div className="relative shrink-0">
            {avatar ? (
              <img src={avatar} alt="Profile" className="h-24 w-24 rounded-full object-cover border border-line" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary-soft text-2xl font-extralight text-primary">
                {initials}
              </div>
            )}
            <label className={`absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-surface border border-line shadow-sm hover:bg-gray-50 transition-colors ${uploadingAvatar ? "opacity-50 pointer-events-none" : ""}`}>
              {uploadingAvatar ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-line-strong border-t-transparent" />
              ) : (
                <Camera size={14} className="text-muted" />
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) {
                    toast.error("Image must be under 2MB");
                    return;
                  }
                  setUploadingAvatar(true);
                  try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const token = localStorage.getItem("hrms_token");
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/company/profile/avatar`, {
                      method: "POST",
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                      body: formData,
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({ detail: "Upload failed" }));
                      throw new Error(err.detail);
                    }
                    const data = await res.json();
                    setAvatar(data.avatar);
                    toast.success("Profile picture updated");
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Upload failed");
                  } finally {
                    setUploadingAvatar(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>

          {/* Name & Role */}
          <div className="flex-1 pt-2">
            <h2 className="text-xl font-light text-ink">{fullName || "Your Name"}</h2>
            <p className="text-[14px] text-muted">{email}</p>
            <span className="mt-2 inline-block rounded-full border border-primary/30 px-3 py-0.5 text-[12px] text-primary">
              {user?.role === "admin" ? "HR admin" : "Employee"}
            </span>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <h3 className="text-[15px] text-ink mb-4">Personal details</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] text-muted mb-1.5">
              Full name <span className="text-error">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface pl-11 pr-4 py-2.5 text-[14px] text-ink focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                placeholder="Your full name"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] text-muted mb-1.5">
              Email <span className="text-faint">(Read only)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <input
                type="email"
                value={email}
                disabled
                className="w-full rounded-lg border border-line bg-sunken pl-11 pr-4 py-2.5 text-[14px] text-muted cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-[13px] text-muted mb-1.5">
              Phone <span className="text-faint">(Optional)</span>
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface pl-11 pr-4 py-2.5 text-[14px] text-ink focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none transition-all"
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[14px] text-white hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {user?.employee_id && !embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-6 py-4">
          <div>
            <p className="text-[15px] text-ink">Change your recorded details</p>
            <p className="text-[13.5px] text-muted">Name, phone or timezone changes on your employee record go to HR for approval.</p>
          </div>
          <button onClick={() => setAskingChange(true)} className="inline-flex h-9 items-center rounded-lg border border-line px-4 text-[14px] text-ink hover:border-line-strong">
            Request a change
          </button>
        </div>
      )}
      {askingChange && <ProfileChangeModal onClose={() => setAskingChange(false)} onSent={() => { setAskingChange(false); router.push("/dashboard/inbox?tab=mine"); }} />}

      <TimezoneCard />

      {user?.employee_id && <CelebrationPrivacyCard />}


      {/* Change Password */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <h3 className="text-[15px] text-ink mb-4">Change password</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] text-muted mb-1.5">
              Current password <span className="text-error">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => { setCurrentPassword(e.target.value); setPasswordErrors((p) => ({ ...p, current: "" })); }}
                className={`w-full rounded-lg border bg-surface pl-11 pr-11 py-2.5 text-[14px] text-ink focus:ring-2 focus:outline-none transition-all ${passwordErrors.current ? "border-error focus:ring-error/20" : "border-line focus:border-primary/60 focus:ring-primary/10"}`}
                placeholder="Enter current password"
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink">
                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordErrors.current && <p className="mt-1 text-xs text-error">{passwordErrors.current}</p>}
          </div>

          <div>
            <label className="block text-[13px] text-muted mb-1.5">
              New password <span className="text-error">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPasswordErrors((p) => ({ ...p, new: "" })); }}
                className={`w-full rounded-lg border bg-surface pl-11 pr-11 py-2.5 text-[14px] text-ink focus:ring-2 focus:outline-none transition-all ${passwordErrors.new ? "border-error focus:ring-error/20" : "border-line focus:border-primary/60 focus:ring-primary/10"}`}
                placeholder="Enter new password (min 6 characters)"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink">
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordErrors.new && <p className="mt-1 text-xs text-error">{passwordErrors.new}</p>}
          </div>

          <div>
            <label className="block text-[13px] text-muted mb-1.5">
              Confirm new password <span className="text-error">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setPasswordErrors((p) => ({ ...p, confirm: "" })); }}
                className={`w-full rounded-lg border bg-surface pl-11 pr-11 py-2.5 text-[14px] text-ink focus:ring-2 focus:outline-none transition-all ${passwordErrors.confirm ? "border-error focus:ring-error/20" : "border-line focus:border-primary/60 focus:ring-primary/10"}`}
                placeholder="Confirm new password"
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-ink">
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {passwordErrors.confirm && <p className="mt-1 text-xs text-error">{passwordErrors.confirm}</p>}
          </div>

          <button
            onClick={handleChangePassword}
            disabled={changingPassword}
            className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-[14px] text-white hover:bg-ink/90 transition-colors disabled:opacity-50"
          >
            <Lock size={16} />
            {changingPassword ? "Changing…" : "Change password"}
          </button>
        </div>
      </div>

      {/* Account Info */}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <h3 className="text-[15px] text-ink mb-3">Account</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted">Company</p>
            <p className="text-ink">{user?.company_name || "--"}</p>
          </div>
          <div>
            <p className="text-muted">Role</p>
            <p className="text-ink">{user?.role === "admin" ? "HR admin" : "Employee"}</p>
          </div>
          <div>
            <p className="text-muted">Email</p>
            <p className="text-ink">{user?.email || "--"}</p>
          </div>
          <div>
            <p className="text-muted">Company ID</p>
            <p className="text-ink">{user?.company_id || "--"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
