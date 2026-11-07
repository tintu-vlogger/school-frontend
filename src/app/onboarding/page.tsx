'use client';

/*
 * Company setup, shown once after sign-up (while setup_complete is false).
 * Step 1 needs the company name and a free web address; step 2 is optional.
 * Saved with POST /company/onboarding; then the person continues on the
 * company's own address.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MapPin, ChevronLeft, ChevronRight, Check, LogOut } from 'lucide-react';
import { api, API_BASE, moveToCompanyHost } from '@/lib/api';
import { useToast } from '@/lib/toast-context';

const STEPS = [
  { label: 'Company', icon: Building2, sub: 'Your company name and the address your team will use to sign in.' },
  { label: 'Contact and address', icon: MapPin, sub: 'Where your company is registered. You can change this later.' },
];

const INDUSTRIES = [
  'IT and software services', 'Manufacturing', 'Retail and e-commerce', 'Healthcare', 'Education', 'Banking and financial services',
  'Construction and real estate', 'Logistics and transport', 'Hospitality', 'Professional services', 'Non-profit', 'Other',
];
const SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1,000', '1,000+'];
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

const inp = 'h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-primary/50';
const lab = 'mb-1.5 block text-[12.5px] text-muted';

type Me = { email: string; full_name: string; picture?: string };

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [size, setSize] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [check, setCheck] = useState<{ state: 'idle' | 'checking' | 'ok' | 'bad'; msg?: string; suggestion?: string }>({ state: 'idle' });

  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');

  // Who is signed in, and anything already saved.
  useEffect(() => {
    api.get<Me>('/auth/me').then(setMe).catch(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get<any>('/company/profile').then((p) => {
      const cfg = p?.config || {};
      if (p?.company_name) setName(p.company_name);
      if (p?.slug) { setSlug(p.slug); setSlugEdited(true); }
      setPhone(p?.phone || '');
      setLine1(p?.address || ''); setLine2(cfg.address_line_2 || ''); setCity(p?.city || ''); setState(p?.state || ''); setZip(p?.pincode || '');
      setIndustry(p?.industry || ''); setSize(p?.employee_count_band || '');
    }).catch(() => {});
  }, []);

  // The web address follows the company name until edited: "Acme Tools Pvt Ltd" → "acme-tools-pvt-ltd".
  const autoSlug = name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  const effectiveSlug = slugEdited ? slug : autoSlug;

  // Is the address free? (debounced)
  useEffect(() => {
    if (!effectiveSlug) { setCheck({ state: 'idle' }); return; }
    setCheck({ state: 'checking' });
    const t = setTimeout(() => {
      api.get<{ available: boolean; reason?: string; suggestion?: string }>(`/company/slug-check?slug=${encodeURIComponent(effectiveSlug)}`)
        .then((r) => setCheck(r.available ? { state: 'ok' } : { state: 'bad', msg: r.reason, suggestion: r.suggestion }))
        .catch(() => setCheck({ state: 'bad', msg: 'Could not check this address. Try again.' }));
    }, 400);
    return () => clearTimeout(t);
  }, [effectiveSlug]);

  const roots = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? 'nextgenhrms.com,lvh.me,localhost').split(',').map((r) => r.trim()).filter(Boolean);
  const loc = typeof window !== 'undefined' ? window.location : null;
  const root = loc ? roots.find((r) => loc.hostname === r || loc.hostname.endsWith('.' + r)) || loc.hostname : 'nextgenhrms.com';
  const suffix = `.${root}${loc?.port ? ':' + loc.port : ''}`;
  const scheme = loc ? `${loc.protocol}//` : 'https://';

  const last = step === STEPS.length - 1;

  function validate() {
    if (step !== 0) return true;
    if (!name.trim()) { setError('Enter your company name.'); return false; }
    if (!effectiveSlug) { setError('Choose a web address for your company.'); return false; }
    if (check.state !== 'ok') { setError('Pick a web address that is available.'); return false; }
    setError(null);
    return true;
  }

  async function next() {
    if (!validate()) return;
    if (!last) { setStep(step + 1); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post('/company/onboarding', {
        name: name.trim(),
        slug: effectiveSlug,
        phone,
        address: line1, address_line_2: line2, city, state, pincode: zip, country: 'India',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        industry, employee_count_band: size,
      });
      toast.success('Your company is set up. Welcome to Next Gen HRMS.');
      // The web address may have changed with the name: continue there.
      const tok = localStorage.getItem('hrms_token');
      const saved = tok ? await fetch(`${API_BASE}/company/profile`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
      if (saved?.slug && tok && moveToCompanyHost(saved.slug, tok, '/dashboard')) return;
      router.push('/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setSaving(false);
    }
  }

  const Current = STEPS[step];

  return (
    <div className="flex min-h-screen items-start justify-center bg-canvas px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Next Gen HRMS" className="h-9" />
          {me && (
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-[13.5px] text-ink">{me.full_name || me.email}</p>
                {me.full_name && <p className="text-[12px] text-faint">{me.email}</p>}
              </div>
              <button onClick={() => { localStorage.removeItem('hrms_token'); router.push('/login'); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-faint hover:bg-sunken hover:text-ink" title="Sign out" aria-label="Sign out">
                <LogOut size={16} strokeWidth={1.4} />
              </button>
            </div>
          )}
        </div>

        <p className="text-[12px] uppercase tracking-[0.08em] text-faint">Step {step + 1} of {STEPS.length}</p>
        <h1 className="mt-1 text-[28px] font-extralight text-ink">Set up your company</h1>
        <p className="mt-1.5 text-[14.5px] text-muted">{Current.sub}</p>

        <div className="mt-6 flex gap-2">
          {STEPS.map((s, i) => (
            <div key={s.label} className="flex-1">
              <div className={`h-[3px] rounded-full ${i <= step ? 'bg-primary' : 'bg-line'}`} />
              <p className={`mt-2 flex items-center gap-1.5 text-[12.5px] ${i === step ? 'text-ink' : 'text-faint'}`}>
                <s.icon size={14} strokeWidth={1.4} /> {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface">
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700 sm:col-span-2">{error}</p>}

            {step === 0 && (
              <>
                <div className="sm:col-span-2">
                  <label htmlFor="co-name" className={lab}>Company name</label>
                  <input id="co-name" className={inp} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="e.g. Acme Tools Private Limited" />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="co-slug" className={lab}>Web address</label>
                  <div className={`flex h-10 items-center overflow-hidden rounded-lg border bg-surface ${check.state === 'bad' ? 'border-rose-300' : check.state === 'ok' ? 'border-emerald-300' : 'border-line'}`}>
                    <span className="whitespace-nowrap border-r border-line bg-sunken px-3 py-2.5 text-[13px] text-faint">{scheme}</span>
                    <input id="co-slug" className="h-full min-w-0 flex-1 bg-transparent px-3 text-[14px] text-ink outline-none" value={effectiveSlug} placeholder="your-company"
                      onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugEdited(true); setError(null); }} />
                    <span className="whitespace-nowrap border-l border-line bg-sunken px-3 py-2.5 text-[13px] text-faint">{suffix}</span>
                  </div>
                  <p className="mt-1.5 min-h-[18px] text-[12.5px]">
                    {check.state === 'checking' && <span className="text-faint">Checking…</span>}
                    {check.state === 'ok' && <span className="text-emerald-700">Available. Your team will sign in at {scheme}{effectiveSlug}{suffix}</span>}
                    {check.state === 'bad' && (
                      <span className="text-rose-600">
                        {check.msg}
                        {check.suggestion && <> Try <button type="button" onClick={() => { setSlug(check.suggestion!); setSlugEdited(true); }} className="underline">{check.suggestion}</button></>}
                      </span>
                    )}
                    {check.state === 'idle' && <span className="text-faint">Fills in from your company name. You can change it.</span>}
                  </p>
                </div>
                <div>
                  <label htmlFor="co-industry" className={lab}>Industry</label>
                  <select id="co-industry" className={inp} value={industry} onChange={(e) => setIndustry(e.target.value)}>
                    <option value="">Choose…</option>
                    {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="co-size" className={lab}>Number of employees</label>
                  <select id="co-size" className={inp} value={size} onChange={(e) => setSize(e.target.value)}>
                    <option value="">Choose…</option>
                    {SIZES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="sm:col-span-2">
                  <label htmlFor="co-phone" className={lab}>Company phone</label>
                  <input id="co-phone" type="tel" className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="co-line1" className={lab}>Registered address</label>
                  <input id="co-line1" className={inp} value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="Building, street" />
                </div>
                <div className="sm:col-span-2">
                  <input id="co-line2" aria-label="Address line 2" className={inp} value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Area, landmark (optional)" />
                </div>
                <div>
                  <label htmlFor="co-city" className={lab}>City</label>
                  <input id="co-city" className={inp} value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="co-state" className={lab}>State</label>
                  <select id="co-state" className={inp} value={state} onChange={(e) => setState(e.target.value)}>
                    <option value="">Choose…</option>
                    {STATES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="co-zip" className={lab}>PIN code</label>
                  <input id="co-zip" inputMode="numeric" maxLength={6} className={inp} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} />
                </div>
                <p className="text-[12.5px] text-faint sm:col-span-2">The state decides which state rules (Professional Tax, Labour Welfare Fund, holidays) apply by default.</p>
              </>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-line px-6 py-4">
            {step > 0 ? (
              <button type="button" onClick={() => setStep(step - 1)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-4 text-[14px] text-ink hover:border-line-strong">
                <ChevronLeft size={16} strokeWidth={1.5} /> Back
              </button>
            ) : <span />}
            <button type="button" onClick={next} disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[14px] text-white hover:bg-primary-dark disabled:opacity-40">
              {last ? (saving ? 'Saving…' : 'Finish setup') : 'Next'}
              {last ? !saving && <Check size={16} strokeWidth={1.6} /> : <ChevronRight size={16} strokeWidth={1.6} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
