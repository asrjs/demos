import React from 'react';
import {
  clampStreamingControlValue,
  formatStreamingControlHint,
  formatStreamingControlValue,
  normalizeStreamingControlValue,
  resolveStreamingControlConstraints,
  resolveStreamingControlStep,
} from '@asrjs/speech-recognition/realtime';

export function StreamingControlSlider({
  definition,
  value,
  onChange,
  resolvedConfig,
  compact = false,
}) {
  const resolvedControlStep = resolveStreamingControlStep(definition, resolvedConfig);
  const resolvedConstraints = resolveStreamingControlConstraints(definition, resolvedConfig);
  const clampedValue = clampStreamingControlValue(
    definition,
    typeof value === 'number' ? value : definition.min,
    resolvedConfig,
  );

  if (compact) {
    return (
      <label
        className="block rounded-[10px] border border-slate-300 bg-white px-3 py-3"
        title={`${definition.description} ${definition.guide}`}
      >
        <div className="grid items-center gap-3 md:grid-cols-[minmax(120px,150px)_minmax(0,1fr)_76px]">
          <span className="text-[11px] font-medium text-slate-700">{definition.label}</span>
          <input
            type="range"
            min={resolvedConstraints.min}
            max={resolvedConstraints.max}
            step={resolvedControlStep}
            value={clampedValue}
            onChange={(event) =>
              onChange(
                normalizeStreamingControlValue(
                  definition,
                  Number(event.target.value),
                  resolvedConfig,
                ),
              )
            }
            className="w-full accent-slate-700"
          />
          <span className="text-right font-mono text-[11px] text-slate-900">
            {formatStreamingControlValue(definition, value)}
          </span>
        </div>
        <div className="mt-2 text-[11px] leading-5 text-slate-600">
          {formatStreamingControlHint(definition, resolvedConfig)}
        </div>
      </label>
    );
  }

  return (
    <label className="demo-soft-box block" title={`${definition.description} ${definition.guide}`}>
      <div className="mb-2 flex items-center justify-between gap-2 font-mono text-[10px] text-slate-500">
        <span>{definition.label}</span>
        <span>{formatStreamingControlValue(definition, value)}</span>
      </div>
      <input
        type="range"
        min={resolvedConstraints.min}
        max={resolvedConstraints.max}
        step={resolvedControlStep}
        value={clampedValue}
        onChange={(event) =>
          onChange(
            normalizeStreamingControlValue(
              definition,
              Number(event.target.value),
              resolvedConfig,
            ),
          )
        }
        className="w-full accent-[#5d7387]"
      />
      <div className="mt-2 font-mono text-[10px] leading-4 text-slate-500">
        {formatStreamingControlHint(definition, resolvedConfig)}
      </div>
      <div className="mt-1 text-[11px] leading-4 text-slate-600">{definition.description}</div>
      <div className="mt-1 text-[10px] leading-4 text-slate-400">{definition.guide}</div>
    </label>
  );
}
