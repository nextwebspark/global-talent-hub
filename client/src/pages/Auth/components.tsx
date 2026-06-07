import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import AuthGlobe from "./AuthGlobe";

export function Brandmark({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className={onDark ? "wmk" : "tm-auth__brandmark"}>
      <span className="mk">AL</span>
      <span className="wm">
        ALAC<small>Global Talent Map</small>
      </span>
    </div>
  );
}

export function BrandPanel({ variant }: { variant: "login" | "signup" }) {
  const copy =
    variant === "signup"
      ? {
          h: "Build your talent universe in minutes.",
          p: "Set up your workspace, invite your team, and start mapping the executives that move your markets.",
        }
      : {
          h: "Map the talent that moves markets.",
          p: "AI-driven market intelligence and executive search, visualised across the Gulf and beyond.",
        };
  return (
    <div className="tm-auth__brand">
      <AuthGlobe />
      <div className="tm-auth__brandmid">
        <Brandmark onDark />
        <div className="tm-auth__copy">
          <h2>{copy.h}</h2>
          <p>{copy.p}</p>
        </div>
      </div>
      <div className="tm-auth__quote">
        <p>"We compress weeks of desk research into an afternoon. The map is how our consultants think now."</p>
        <div className="who">
          <span className="av">SL</span>
          <div>
            <div className="nm">Sami Laremi</div>
            <div className="ti">Managing Partner, ALAC</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SsoButtons({
  verb,
  onGoogle,
  onMicrosoft,
}: {
  verb: string;
  onGoogle: () => void;
  onMicrosoft: () => void;
}) {
  return (
    <div className="tm-sso">
      <button className="tm-sso-btn" type="button" onClick={onGoogle}>
        <span className="tm-sso-glyph" style={{ background: "#1a2233" }}>G</span>
        {verb} with Google
      </button>
      <button className="tm-sso-btn" type="button" onClick={onMicrosoft}>
        <span className="tm-sso-glyph" style={{ background: "#1a2233" }}>M</span>
        {verb} with Microsoft
      </button>
    </div>
  );
}

export function PasswordField({
  value,
  onChange,
  placeholder = "••••••••",
  label,
  extra,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label: string;
  extra?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="tm-afield">
      <div className="tm-alabel">
        <span>{label}</span>
        {extra}
      </div>
      <div className="tm-pw">
        <input className="tm-ainput" type={show ? "text" : "password"} value={value} onChange={onChange} placeholder={placeholder} />
        <button className="tm-pw__toggle" onClick={() => setShow((s) => !s)} type="button">
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
