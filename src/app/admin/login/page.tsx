"use client";
import { PlatformLogin } from "@/components/platform-shell";
export default function AdminLoginPage() { return <PlatformLogin role="admin" title="Admin sign in" afterLogin="/admin/dashboard" />; }
