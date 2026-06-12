import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  User, ShieldCheck, Bell, SlidersHorizontal, Building2, Users, KeyRound,
  CreditCard, LogOut, ArrowLeft, Menu,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar } from "./primitives";
import { ProfileSection, SecuritySection, NotificationsSection, PreferencesSection } from "./AccountSections";
import { OrgGeneralSection, MembersSection, RolesSection, BillingSection } from "./OrgSections";
import "./settings.css";

type Section = "profile" | "security" | "notifications" | "preferences" | "org" | "members" | "roles" | "billing";

const ACCOUNT = [
  { id: "profile", icon: User, label: "Profile" },
  { id: "security", icon: ShieldCheck, label: "Security" },
  { id: "notifications", icon: Bell, label: "Notifications" },
  { id: "preferences", icon: SlidersHorizontal, label: "Preferences" },
] as const;

const ORG = [
  { id: "org", icon: Building2, label: "General" },
  { id: "members", icon: Users, label: "Members" },
  { id: "roles", icon: KeyRound, label: "Roles & permissions" },
  { id: "billing", icon: CreditCard, label: "Plan & billing" },
] as const;

const ORG_SECTIONS: Section[] = ["org", "members", "roles", "billing"];

export default function SettingsPage() {
  const [, navigate] = useLocation();
  const { session, org, role, profile, signOut } = useAuth();
  const isAdmin = role === "owner" || role === "admin";
  const [section, setSection] = useState<Section>("profile");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Non-admins can't view org sections.
  useEffect(() => {
    if (!isAdmin && ORG_SECTIONS.includes(section)) setSection("profile");
  }, [isAdmin, section]);

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const setTheme = (v: "light" | "dark") => {
    const dark = v === "dark";
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
  };

  const name = profile?.fullName || session?.user.email || "You";
  const email = session?.user.email ?? "";

  const Link = (s: { id: string; icon: any; label: string }) => {
    const Icon = s.icon;
    return (
      <button key={s.id} className={`tm-set-link${section === s.id ? " is-on" : ""}`} onClick={() => setSection(s.id as Section)}>
        <Icon size={16} />{s.label}
      </button>
    );
  };

  // Flat section list for the mobile dropdown (account + org when admin).
  const mobileSections: { id: Section; label: string }[] = [
    ...ACCOUNT.map((s) => ({ id: s.id as Section, label: s.label })),
    ...(isAdmin ? ORG.map((s) => ({ id: s.id as Section, label: s.label })) : []),
  ];

  return (
    <div className="h-screen w-screen flex bg-background overflow-hidden">
      <Sidebar
        activeView="map"
        onViewChange={() => {}}
        onHome={() => navigate("/")}
        projectOpen={false}
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
      />
      <div className="tm-settings" style={{ flex: 1, minWidth: 0 }}>
      <div className="tm-set-nav">
        <button className="tm-set-link" style={{ margin: "10px 6px 0" }} onClick={() => navigate("/")}>
          <ArrowLeft size={16} />Back to app
        </button>
        <div className="tm-set-nav__user">
          <Avatar name={name} tone="neutral" size={36} />
          <div style={{ minWidth: 0 }}>
            <div className="tm-set-nav__name">{name}</div>
            <div className="tm-set-nav__email">{email}</div>
          </div>
        </div>
        <div className="tm-set-group">Account</div>
        {ACCOUNT.map(Link)}
        {isAdmin && <><div className="tm-set-group">Organization</div>{ORG.map(Link)}</>}
        <div className="tm-set-foot">
          <button className="tm-set-link" onClick={() => signOut()}><LogOut size={16} />Sign out</button>
        </div>
      </div>

      <div className="tm-set-main">
        {/* Mobile header — hamburger opens the app nav; dropdown switches settings section */}
        <div className="tm-set-mobilebar">
          <button className="tm-set-burger" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <Select value={section} onValueChange={(v) => setSection(v as Section)}>
            <SelectTrigger className="flex-1 h-9 font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {mobileSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {section === "profile" && <ProfileSection />}
        {section === "security" && <SecuritySection />}
        {section === "notifications" && <NotificationsSection />}
        {section === "preferences" && <PreferencesSection theme={isDark ? "dark" : "light"} onTheme={setTheme} />}
        {section === "org" && isAdmin && <OrgGeneralSection />}
        {section === "members" && isAdmin && <MembersSection />}
        {section === "roles" && isAdmin && <RolesSection />}
        {section === "billing" && isAdmin && <BillingSection />}
      </div>
      </div>
    </div>
  );
}
