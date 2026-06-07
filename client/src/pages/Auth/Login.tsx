import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Brandmark, BrandPanel, SsoButtons, PasswordField } from "./components";
import "./auth.css";

export default function Login() {
  const [, navigate] = useLocation();
  const { signInPassword, signInOAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInPassword(email, pw);
      // AuthProvider picks up the session; the gate in App routes onward.
    } catch (e: any) {
      setError(e?.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tm-auth">
      <div className="tm-auth__form">
        <div className="tm-auth__card">
          <Brandmark />
          <h1 className="tm-auth__title">Welcome back</h1>
          <p className="tm-auth__sub">Sign in to your ALAC workspace.</p>

          {error && <div className="tm-auth__error">{error}</div>}

          <SsoButtons verb="Continue" onGoogle={() => signInOAuth("google")} onMicrosoft={() => signInOAuth("azure")} />
          <div className="tm-or"><span>or</span></div>

          <div className="tm-afield">
            <div className="tm-alabel"><span>Work email</span></div>
            <input
              className="tm-ainput"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <PasswordField label="Password" value={pw} onChange={(e) => setPw(e.target.value)} />

          <button className="tm-auth__btn" onClick={submit} disabled={busy || !email || !pw}>
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="tm-auth__foot">
            New to ALAC Partners?{" "}
            <span className="tm-link-inline" onClick={() => navigate("/signup")}>Create an organization</span>
          </p>
          <p className="tm-auth__legal">
            By continuing you agree to our <a>Terms</a> and <a>Privacy Policy</a>.
          </p>
        </div>
      </div>
      <BrandPanel variant="login" />
    </div>
  );
}
