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
        className="slider-control"
        title={`${definition.description} ${definition.guide}`}
      >
        <div className="slider-control__grid">
          <span className="slider-control__label">{definition.label}</span>
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
            className="range-input"
          />
          <span className="slider-control__value">
            {formatStreamingControlValue(definition, value)}
          </span>
        </div>
        <div className="slider-control__hint">
          {formatStreamingControlHint(definition, resolvedConfig)}
        </div>
      </label>
    );
  }

  return (
    <label className="slider-control slider-control--soft block" title={`${definition.description} ${definition.guide}`}>
      <div className="slider-control__row">
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
        className="range-input"
      />
      <div className="slider-control__meta">
        {formatStreamingControlHint(definition, resolvedConfig)}
      </div>
      <div className="slider-control__desc">{definition.description}</div>
      <div className="slider-control__guide">{definition.guide}</div>
    </label>
  );
}
