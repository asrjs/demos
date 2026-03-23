import React from 'react';

export function Widget({ title, children, actions, className = '', titleAttr }) {
  return (
    <section className={`panel-shell ${className}`} title={titleAttr}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="panel-title">{title}</div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="field-label">{label}</span>
        {hint ? <span className="text-[10px] font-mono text-slate-600">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function ToggleRow({ id, label, checked, disabled, onChange }) {
  return (
    <div className="compact-toggle">
      <label htmlFor={id}>{label}</label>
      <div className="relative inline-block w-10 align-middle">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="toggle-checkbox absolute block h-5 w-5 appearance-none rounded-full border-4 border-slate-300 bg-white cursor-pointer"
        />
        <label htmlFor={id} className="toggle-label block h-5 overflow-hidden rounded-full bg-slate-300" />
      </div>
    </div>
  );
}

export function MonoStat({ label, value, note }) {
  return (
    <div className="mono-row">
      <div className="flex items-center justify-between gap-2">
        <span className="mono-key">{label}</span>
        <span className="mono-value">{value}</span>
      </div>
      {note ? <span className="mono-note">{note}</span> : null}
    </div>
  );
}
