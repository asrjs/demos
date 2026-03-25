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
  const hoverHint = formatStreamingControlHint(definition, resolvedConfig);
  const tooltip = [hoverHint, definition.description, definition.guide].filter(Boolean).join('\n');
  const clampedValue = clampStreamingControlValue(
    definition,
    typeof value === 'number' ? value : definition.min,
    resolvedConfig,
  );

  if (compact) {
    return (
      <label
        className="slider-control"
        title={tooltip}
      >
        <div className="slider-control__row slider-control__row--compact">
          <span className="slider-control__label">{definition.label}</span>
          <span className="slider-control__value">
            {formatStreamingControlValue(definition, value)}
          </span>
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
          className="range-input mt-2"
        />
      </label>
    );
  }

  return (
    <label className="slider-control slider-control--soft block" title={tooltip}>
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
      <div className="slider-control__desc">{definition.description}</div>
      <div className="slider-control__guide">{definition.guide}</div>
    </label>
  );
}
