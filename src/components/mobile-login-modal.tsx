"use client";

import { useState, useEffect } from "react";
import { X, Smartphone, RefreshCw, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";

interface MobileLoginModalProps {
  open: boolean;
  onClose: () => void;
}

export function MobileLoginModal({ open, onClose }: MobileLoginModalProps) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  async function generateCode() {
    setLoading(true);
    try {
      const res = await api.post<{ code: string; expires_in: number }>("/auth/mobile/generate-qr-code");
      setCode(res.code);
      setCountdown(res.expires_in);
    } catch {
      setCode(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !code) generateCode();
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          setCode(null);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  if (!open) return null;

  const qrValue = code ? JSON.stringify({ type: "hrms_mobile_login", code }) : "";
  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Smartphone size={16} className="text-primary" />
            </div>
            <h3 className="font-semibold text-gray-900">Login to Mobile</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : code ? (
            <>
              <p className="text-sm text-gray-500 text-center">
                Open the Campusly mobile app and scan this QR code to login
              </p>

              <div className="flex justify-center rounded-xl border border-primary/10 bg-primary/5 p-6">
                <QRCodeSVG value={qrValue} size={200} level="M" bgColor="#ffffff" fgColor="#0d9488" />
              </div>

              <div className="text-center">
                <p className="text-xs text-gray-400">
                  Expires in <span className="font-mono font-semibold text-gray-600">{minutes}:{String(seconds).padStart(2, "0")}</span>
                </p>
              </div>

              <button
                onClick={() => { setCode(null); generateCode(); }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <RefreshCw size={14} />
                Generate New Code
              </button>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-4">QR code expired</p>
              <button onClick={generateCode}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark">
                <RefreshCw size={14} />
                Generate New Code
              </button>
            </div>
          )}

          <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              1. Open the Campusly app on your phone<br />
              2. Tap "Scan QR Code" on the login screen<br />
              3. Point your camera at this QR code<br />
              4. You'll be logged in automatically
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
