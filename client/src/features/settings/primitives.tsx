import type { ReactNode } from "react";

export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`tm-switch ${on ? "on" : "off"}`}
      onClick={() => !disabled && onChange(!on)}
      role="switch"
      aria-checked={on}
      disabled={disabled}
    >
      <span className="k" />
    </button>
  );
}

export function FieldRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="tm-frow">
      <div className="tm-frow__l">{label}{hint && <small>{hint}</small>}</div>
      <div className="tm-frow__c">{children}</div>
    </div>
  );
}

export function SetCard({ title, sub, pad, children }: { title?: string; sub?: string; pad?: boolean; children: ReactNode }) {
  return (
    <div className={`tm-set-card${pad ? " pad" : ""}`}>
      {title && <h3 className="tm-set-cardh" style={{ paddingTop: pad ? 0 : 16 }}>{title}</h3>}
      {sub && <p className="tm-set-cardsub">{sub}</p>}
      {children}
    </div>
  );
}

export function SetSeg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tm-seg">
      {options.map((o) => (
        <button key={o.v} type="button" className={value === o.v ? "is-on" : ""} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ name, tone = "neutral", size = 34 }: { name: string; tone?: "neutral" | "primary"; size?: number }) {
  return (
    <span className={`tm-avatar tm-avatar--${tone}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name)}
    </span>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "verified" | "inferred" | "neutral"; children: ReactNode }) {
  return <span className={`tm-pill tm-pill--${tone}`}>{children}</span>;
}

export function Btn({
  children,
  variant,
  size,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  variant?: "outline" | "ghost";
  size?: "sm";
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const cls = ["tm-btn", variant && `tm-btn--${variant}`, size && `tm-btn--${size}`].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
