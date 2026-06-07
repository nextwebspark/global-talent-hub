import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  User, ShieldCheck, Bell, SlidersHorizontal, Building2, Users, KeyRound,
  CreditCard, LogOut, ArrowLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import Sidebar from "@/components/layout/Sidebar";
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

export default function Settings() {
  const [, navigate] = useLocation();
  const { session, org, role, profile, signOut } = useAuth();
  const isAdmin = role === "owner" || role === "admin";
  const [section, setSection] = useState<Section>("profile");

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

  return (
    <div className="h-screen w-screen flex bg-background overflow-hidden">
      <Sidebar
        activeView="map"
        onViewChange={() => {}}
        onHome={() => navigate("/")}
        projectOpen={false}
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
