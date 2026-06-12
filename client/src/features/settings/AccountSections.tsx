import { useEffect, useState } from "react";
import { Monitor, Lock, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Switch, FieldRow, SetCard, SetSeg, Pill, Btn } from "./primitives";

const TIMEZONES = ["Asia/Dubai (GST)", "Asia/Riyadh (AST)", "Africa/Cairo (EET)", "Europe/London (GMT)"];
const LANGUAGES = ["English", "العربية", "Français"];

interface Prefs {
  density?: string;
  defaultView?: string;
  mapMetric?: string;
}

export function ProfileSection() {
  const { profile, session, refreshProfile } = useAuth();
  const email = session?.user.email ?? "";
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [jobTitle, setJobTitle] = useState(profile?.jobTitle ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [timezone, setTimezone] = useState(profile?.timezone ?? TIMEZONES[0]);
  const [language, setLanguage] = useState(profile?.language ?? LANGUAGES[0]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      await apiRequest("PUT", "/api/profile", { fullName, jobTitle, phone, timezone, language });
      await refreshProfile();
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  const display = fullName || email || "You";

  return (
    <div className="tm-set-inner">
      <h1 className="tm-set-title">Profile</h1>
      <p className="tm-set-sub">How you appear to your team across the Global Talent Map.</p>

      <SetCard pad>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div className="tm-avatar-lg">{display.slice(0, 2).toUpperCase()}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{display}</div>
            <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{jobTitle || "—"}</div>
          </div>
        </div>
      </SetCard>

      <SetCard>
        <FieldRow label="Full name"><input className="tm-set-input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></FieldRow>
        <FieldRow label="Job title"><input className="tm-set-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></FieldRow>
        <FieldRow label="Email" hint="Used for sign-in and notifications">
          <span style={{ fontSize: 13 }}>{email}</span>
          <Pill tone="verified"><Check size={10} />Verified</Pill>
        </FieldRow>
        <FieldRow label="Phone"><input className="tm-set-input" value={phone} onChange={(e) => setPhone(e.target.value)} /></FieldRow>
        <FieldRow label="Timezone">
          <select className="tm-set-select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </FieldRow>
        <FieldRow label="Language">
          <select className="tm-set-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
          </select>
        </FieldRow>
      </SetCard>

      <div className="tm-set-actions">
        {saved && <span style={{ fontSize: 13, color: "#15803d", alignSelf: "center" }}>Saved</span>}
        <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Btn>
      </div>
    </div>
  );
}

interface LoginEvent { id: string; at: string; ip: string | null; userAgent: string | null; }

export function SecuritySection() {
  const { lastLoginAt } = useAuth();
  const [events, setEvents] = useState<LoginEvent[]>([]);

  useEffect(() => {
    apiRequest("GET", "/api/auth/login-events")
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .catch(() => {});
  }, []);

  return (
    <div className="tm-set-inner">
      <h1 className="tm-set-title">Security</h1>
      <p className="tm-set-sub">Protect your account and review where you're signed in.</p>

      <SetCard title="Password" sub="Managed via your identity provider." pad>
        <Btn variant="outline" size="sm"><Lock size={13} />Change password</Btn>
        <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginLeft: 10 }}>Coming soon</span>
      </SetCard>

      <SetCard pad>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <h3 className="tm-set-cardh">Two-factor authentication</h3>
            <p className="tm-set-cardsub" style={{ marginBottom: 0 }}>Require a one-time code at sign-in. Coming soon.</p>
          </div>
          <Switch on={false} onChange={() => {}} disabled />
        </div>
      </SetCard>

      <SetCard title="Recent sign-ins" sub={lastLoginAt ? `Last login ${new Date(lastLoginAt).toLocaleString()}.` : "Your recent login activity."} pad>
        {events.length === 0 && <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>No login events recorded yet.</div>}
        {events.map((e) => (
          <div className="tm-listrow" key={e.id}>
            <div className="tm-listrow__ic"><Monitor size={17} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{e.userAgent?.slice(0, 60) || "Unknown device"}</div>
              <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{e.ip || "—"} · {new Date(e.at).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </SetCard>
    </div>
  );
}

export function NotificationsSection() {
  const EVENTS = [
    ["New executive matches", "When AI surfaces new executives in your projects"],
    ["Project shared with me", "When a teammate gives you access"],
    ["Enrichment complete", "When a bulk enrichment run finishes"],
    ["Weekly mapping digest", "A summary of activity across your projects"],
    ["Comments & mentions", "When someone @mentions you on a profile"],
  ];
  const [state, setState] = useState(EVENTS.map(() => ({ email: true, app: true })));
  const set = (i: number, k: "email" | "app", v: boolean) => setState((s) => s.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="tm-set-inner">
      <h1 className="tm-set-title">Notifications</h1>
      <p className="tm-set-sub">Choose how you want to be notified. Delivery is coming soon.</p>
      <div className="tm-set-banner">Notification delivery is not wired yet — these preferences are a preview.</div>
      <SetCard pad>
        <div className="tm-notif-head"><span>Event</span><span>Email</span><span>In-app</span></div>
        {EVENTS.map(([t, d], i) => (
          <div className="tm-notif-row" key={t}>
            <div><div style={{ fontWeight: 500 }}>{t}</div><div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{d}</div></div>
            <div className="tm-cc"><Switch on={state[i].email} onChange={(v) => set(i, "email", v)} /></div>
            <div className="tm-cc"><Switch on={state[i].app} onChange={(v) => set(i, "app", v)} /></div>
          </div>
        ))}
      </SetCard>
    </div>
  );
}

export function PreferencesSection({ theme, onTheme }: { theme: "light" | "dark"; onTheme: (v: "light" | "dark") => void }) {
  const { profile, refreshProfile } = useAuth();
  const prefs = (profile?.preferences as Prefs) ?? {};
  const [density, setDensity] = useState(prefs.density ?? "comfortable");
  const [view, setView] = useState(prefs.defaultView ?? "map");
  const [metric, setMetric] = useState(prefs.mapMetric ?? "revenue");

  // Persist preference changes to the profile (theme is applied immediately via onTheme).
  const persist = async (next: Prefs) => {
    await apiRequest("PUT", "/api/profile", { preferences: { density, defaultView: view, mapMetric: metric, ...next } });
    await refreshProfile();
  };

  return (
    <div className="tm-set-inner">
      <h1 className="tm-set-title">Preferences</h1>
      <p className="tm-set-sub">Tune how the Global Talent Map looks and opens for you.</p>
      <SetCard>
        <FieldRow label="Appearance" hint="Light or dark">
          <SetSeg value={theme} onChange={(v) => onTheme(v)} options={[{ v: "light", l: "Light" }, { v: "dark", l: "Dark" }]} />
        </FieldRow>
        <FieldRow label="Density">
          <SetSeg value={density} onChange={(v) => { setDensity(v); persist({ density: v }); }} options={[{ v: "comfortable", l: "Comfortable" }, { v: "compact", l: "Compact" }]} />
        </FieldRow>
        <FieldRow label="Default view" hint="Where a project opens">
          <select className="tm-set-select" value={view} onChange={(e) => { setView(e.target.value); persist({ defaultView: e.target.value }); }}>
            <option value="map">Map</option><option value="table">Table</option><option value="dashboard">Dashboard</option>
          </select>
        </FieldRow>
        <FieldRow label="Map scaling" hint="Size company nodes by">
          <SetSeg value={metric} onChange={(v) => { setMetric(v); persist({ mapMetric: v }); }} options={[{ v: "revenue", l: "Revenue" }, { v: "employees", l: "Employees" }]} />
        </FieldRow>
      </SetCard>
    </div>
  );
}
