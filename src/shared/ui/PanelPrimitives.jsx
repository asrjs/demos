import React from 'react';

export function Widget({ title, children, actions, className = '', titleAttr, variant = 'pane' }) {
  if (variant === 'rail') {
    return (
      <section className={['app-rail-section', className].filter(Boolean).join(' ')} title={titleAttr}>
        <div className="widget-header widget-header--rail">
          <div className="widget-header__title">
            <h2 className="section-heading">{title}</h2>
          </div>
          {actions}
        </div>
        {children}
      </section>
    );
  }

  const shellClass = ['panel-shell', className].filter(Boolean).join(' ');
  return (
    <section className={shellClass} title={titleAttr}>
      <div className="widget-header">
        <div className="widget-header__title">
          <h2 className="section-heading">{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <div className="field__row">
        <span className="field-label">{label}</span>
        {hint ? <span className="field-hint">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function ToggleRow({ id, label, checked, disabled, onChange }) {
  return (
    <div className="compact-toggle">
      <label htmlFor={id}>{label}</label>
      <div className="toggle-track">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="toggle-checkbox toggle-checkbox--styled"
        />
        <label htmlFor={id} className="toggle-label" />
      </div>
    </div>
  );
}

export function MonoStat({ label, value, note }) {
  return (
    <div className="mono-row">
      <div className="flex-row flex-row--between gap-2">
        <span className="mono-key">{label}</span>
        <span className="mono-value">{value}</span>
      </div>
      {note ? <span className="mono-note">{note}</span> : null}
    </div>
  );
}
