import { useEffect, useState } from "react";
import { UserPlus, Send, Trash2, Check, Sparkles, CreditCard, Download } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Switch, FieldRow, SetCard, Pill, Btn, Avatar } from "./primitives";

const REGIONS = ["Middle East (GCC)", "North Africa", "Europe", "Global"];
const TEAM_SIZES = ["Just me", "2–10", "11–50", "51–200", "200+"];
const ROLES = ["owner", "admin", "member", "viewer"];

export function OrgGeneralSection() {
  const { org, refreshOrg } = useAuth();
  const [name, setName] = useState(org?.name ?? "");
  const [region, setRegion] = useState((org as any)?.region ?? REGIONS[0]);
  const [teamSize, setTeamSize] = useState((org as any)?.teamSize ?? TEAM_SIZES[1]);
  const [defaultRole, setDefaultRole] = useState((org as any)?.defaultRole ?? "member");
  const [require2fa, setRequire2fa] = useState((org as any)?.require2fa ?? false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setSaved(false); setError(null);
    try {
      await apiRequest("PUT", "/api/org", { name, region, teamSize, defaultRole, require2fa });
      await refreshOrg();
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tm-set-inner">
      <h1 className="tm-set-title">Organization</h1>
      <p className="tm-set-sub">Workspace-wide settings for {org?.name}.</p>
      {error && <div className="tm-set-error">{error}</div>}

      <SetCard>
        <FieldRow label="Organization name"><input className="tm-set-input" value={name} onChange={(e) => setName(e.target.value)} /></FieldRow>
        <FieldRow label="Primary region">
          <select className="tm-set-select" value={region} onChange={(e) => setRegion(e.target.value)}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
        </FieldRow>
        <FieldRow label="Team size">
          <select className="tm-set-select" value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>{TEAM_SIZES.map((s) => <option key={s}>{s}</option>)}</select>
        </FieldRow>
        <FieldRow label="Default role" hint="Assigned to newly invited members">
          <select className="tm-set-select" value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)}>
            <option value="member">Member</option><option value="viewer">Viewer</option><option value="admin">Admin</option>
          </select>
        </FieldRow>
        <FieldRow label="Require 2FA" hint="Coming soon"><Switch on={require2fa} onChange={setRequire2fa} disabled /></FieldRow>
      </SetCard>

      <div className="tm-set-actions">
        {saved && <span style={{ fontSize: 13, color: "#15803d", alignSelf: "center" }}>Saved</span>}
        <Btn onClick={save} disabled={busy}>{busy ? "Saving…" : "Save changes"}</Btn>
      </div>
    </div>
  );
}

interface Member {
  id: string;
  userId: string;
  email: string | null;
  role: string;
  lastLoginAt: string | null;
  profile: { fullName: string | null; jobTitle: string | null } | null;
}

export function MembersSection() {
  const { session } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    apiRequest("GET", "/api/org/members").then((r) => r.json()).then((d) => setMembers(d.members ?? [])).catch(() => {});
  };
  useEffect(load, []);

  const changeRole = async (id: string, role: string) => {
    setError(null);
    try {
      await apiRequest("PATCH", `/api/org/members/${id}`, { role });
      load();
    } catch (e: any) {
      setError(e?.message || "Failed to change role");
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await apiRequest("DELETE", `/api/org/members/${id}`);
      load();
    } catch (e: any) {
      setError(e?.message || "Failed to remove member");
    }
  };

  return (
    <div className="tm-set-inner" style={{ maxWidth: 820 }}>
      <h1 className="tm-set-title">Members</h1>
      <p className="tm-set-sub">Invite teammates and manage who can access the workspace.</p>
      {error && <div className="tm-set-error">{error}</div>}

      <div className="tm-invite">
        <UserPlus size={16} color="hsl(var(--muted-foreground))" />
        <input className="tm-set-input" style={{ flex: 1, maxWidth: "none" }} placeholder="name@company.com (invites coming soon)" disabled />
        <Btn disabled><Send size={14} />Send invite</Btn>
      </div>

      <SetCard pad>
        <div className="tm-mtable__head"><span>Member</span><span>Role</span><span>Status</span><span>Last active</span><span /></div>
        {members.map((m) => {
          const isYou = m.userId === session?.user.id;
          const name = m.profile?.fullName || m.email || "Member";
          return (
            <div className="tm-mrow" key={m.id}>
              <div className="tm-member">
                <Avatar name={name} tone={isYou ? "primary" : "neutral"} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div className="tm-member__nm">{name}{isYou && <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 400 }}> · You</span>}</div>
                  <div className="tm-member__em">{m.email}</div>
                </div>
              </div>
              <span>
                {m.role === "owner"
                  ? <Pill tone="neutral">Owner</Pill>
                  : <select className="tm-set-select" style={{ minWidth: 110, padding: "5px 8px", height: 32 }} value={m.role} onChange={(e) => changeRole(m.id, e.target.value)}>
                      {ROLES.filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                    </select>}
              </span>
              <span><Pill tone="verified">Active</Pill></span>
              <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString() : "—"}</span>
              {isYou ? <span /> : <button className="tm-proj-del" onClick={() => remove(m.id)}><Trash2 size={14} /></button>}
            </div>
          );
        })}
      </SetCard>
    </div>
  );
}

export function RolesSection() {
  const PERMS: [string, number[]][] = [
    ["View projects & map", [1, 1, 1, 1]],
    ["Create & run searches", [1, 1, 1, 0]],
    ["Edit company universe", [1, 1, 1, 0]],
    ["Export data to Excel", [1, 1, 1, 0]],
    ["Invite & manage members", [1, 1, 0, 0]],
    ["Manage roles & permissions", [1, 1, 0, 0]],
    ["Delete projects", [1, 1, 0, 0]],
    ["Manage plan & billing", [1, 0, 0, 0]],
  ];
  return (
    <div className="tm-set-inner" style={{ maxWidth: 820 }}>
      <h1 className="tm-set-title">Roles &amp; permissions</h1>
      <p className="tm-set-sub">What each role can do. Assign roles per member on the Members tab.</p>
      <SetCard pad>
        <div className="tm-perm-head">
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", color: "hsl(var(--muted-foreground))" }}>Permission</span>
          {["Owner", "Admin", "Member", "Viewer"].map((r) => <span className="role" key={r}>{r}</span>)}
        </div>
        {PERMS.map(([label, cells]) => (
          <div className="tm-perm-row" key={label}>
            <span style={{ fontWeight: 500 }}>{label}</span>
            <div className="tm-perm-cells">
              {cells.map((c, i) => (
                <span className="cell" key={i}>
                  {c ? <Check size={16} color="#15803d" /> : <span style={{ width: 12, height: 2, borderRadius: 2, background: "hsl(var(--border))" }} />}
                  <span className="tm-perm-cell-label">{["Owner", "Admin", "Member", "Viewer"][i]}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </SetCard>
    </div>
  );
}

export function BillingSection() {
  const invoices = [
    { d: "May 1, 2026", a: "$392.00", s: "Paid" },
    { d: "Apr 1, 2026", a: "$392.00", s: "Paid" },
    { d: "Mar 1, 2026", a: "$343.00", s: "Paid" },
  ];
  return (
    <div className="tm-set-inner">
      <h1 className="tm-set-title">Plan &amp; billing</h1>
      <p className="tm-set-sub">Manage your subscription and payment details.</p>
      <div className="tm-set-banner">Billing is a preview — no payment provider is connected yet.</div>

      <SetCard pad>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <span className="tm-pill-plan"><Sparkles size={12} />Team</span>
            <div style={{ fontSize: 22, fontWeight: 700, margin: "12px 0 2px" }}>$49 <span style={{ fontSize: 13, fontWeight: 400, color: "hsl(var(--muted-foreground))" }}>/ seat / month</span></div>
            <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>renews Jun 1, 2026</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}><Btn variant="outline" size="sm">Manage seats</Btn><Btn size="sm">Upgrade plan</Btn></div>
        </div>
      </SetCard>

      <SetCard title="Payment method" pad>
        <div className="tm-listrow" style={{ borderBottom: "none" }}>
          <div className="tm-listrow__ic"><CreditCard size={16} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>Visa ending 4242</div><div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>Expires 08 / 27</div></div>
          <Btn variant="ghost" size="sm">Update</Btn>
        </div>
      </SetCard>

      <SetCard title="Invoices" pad>
        {invoices.map((iv) => (
          <div className="tm-invoice" key={iv.d}>
            <span style={{ fontWeight: 500 }}>{iv.d}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="tm-mono">{iv.a}</span><Pill tone="verified">{iv.s}</Pill>
              <button className="tm-link"><Download size={13} /></button>
            </span>
          </div>
        ))}
      </SetCard>
    </div>
  );
}
