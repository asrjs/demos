import React, { useState } from 'react';
import { BufferVisualizer } from './BufferVisualizer';
import { StatsWidget } from './StatsWidget';

/**
 * Component for visualizing audio data and controls
 * @component
 * @param {Object} props
 * @param {string} props.className - CSS classes
 * @param {MediaStream} props.stream - Audio stream
 * @param {number} props.threshold - Energy threshold
 * @param {Function} props.onThresholdChange - Threshold change handler
 * @param {number} props.silenceLength - Min silence length
 * @param {Function} props.onSilenceLengthChange - Silence length change handler
 * @param {number} props.speechHangover - Speech hangover time
 * @param {Function} props.onHangoverChange - Hangover change handler
 * @param {AudioContext} props.audioContextRef - Audio context reference
 * @param {Array<Object>} props.segments - Detected segments
 * @param {number} props.energyScale - Energy scale
 * @param {Function} props.onEnergyScaleChange - Energy scale change handler
 * @param {number} props.hysteresisRatio - Hysteresis ratio
 * @param {Function} props.onHysteresisChange - Hysteresis change handler
 * @param {number} props.minSpeechDuration - Min speech duration
 * @param {Function} props.onMinSpeechDurationChange - Min speech duration change handler
 * @param {Object} props.processor - Audio processor
 * @param {number} props.minEnergyIntegral - Min energy integral
 * @param {Function} props.onMinEnergyIntegralChange - Min energy integral change handler
 */
export function AudioVisualizer({ 
    className, 
    stream, 
    threshold, 
    onThresholdChange,
    silenceLength,
    onSilenceLengthChange,
    speechHangover,
    onHangoverChange,
    audioContextRef,
    segments = [],
    energyScale,
    onEnergyScaleChange,
    hysteresisRatio,
    onHysteresisChange,
    minSpeechDuration,
    onMinSpeechDurationChange,
    processor,
    minEnergyIntegral,
    onMinEnergyIntegralChange
}) {
    return (
        <div className={className}>
            {/* BufferVisualizer */}
            <div className="mb-2">
                <BufferVisualizer 
                    threshold={threshold}
                    segments={segments}
                />
            </div>
            
            {/* Change from flex to grid layout */}
            <div className="grid grid-cols-1 gap-4">
                {/* Parameters Panel */}
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <h3 className="text-xs font-semibold mb-2">Speech Detection Parameters</h3>
                    
                    <div className="grid grid-cols-2 gap-2">
                        {/* Energy Threshold */}
                        <div className="flex flex-col">
                            <label className="text-xs mb-1">Energy Threshold: {threshold.toFixed(3)}</label>
                            <input
                                type="range"
                                min="0.01"
                                max="0.5"
                                step="0.01"
                                value={threshold}
                                onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
                                className="w-full h-4"
                            />
                        </div>

                        {/* Energy Scale */}
                        <div className="flex flex-col">
                            <label className="text-xs mb-1">Energy Scale: {energyScale.toFixed(1)}</label>
                            <input
                                type="range"
                                min="0.1"
                                max="2.0"
                                step="0.1"
                                value={energyScale}
                                onChange={(e) => onEnergyScaleChange(parseFloat(e.target.value))}
                                className="w-full h-4"
                            />
                        </div>

                        {/* Silence Length */}
                        <div className="flex flex-col">
                            <label className="text-xs mb-1">Min Silence (s): {silenceLength.toFixed(2)}</label>
                            <input
                                type="range"
                                min="0.1"
                                max="1.0"
                                step="0.05"
                                value={silenceLength}
                                onChange={(e) => onSilenceLengthChange(parseFloat(e.target.value))}
                                className="w-full h-4"
                            />
                        </div>

                        {/* Speech Hangover */}
                        <div className="flex flex-col">
                            <label className="text-xs mb-1">Speech Hangover (s): {speechHangover.toFixed(2)}</label>
                            <input
                                type="range"
                                min="0.1"
                                max="0.5"
                                step="0.05"
                                value={speechHangover}
                                onChange={(e) => onHangoverChange(parseFloat(e.target.value))}
                                className="w-full h-4"
                            />
                        </div>

                        {/* Min Speech Duration */}
                        <div className="flex flex-col">
                            <label className="text-xs mb-1">Min Speech (s): {minSpeechDuration.toFixed(2)}</label>
                            <input
                                type="range"
                                min="0.05"
                                max="0.5"
                                step="0.05"
                                value={minSpeechDuration}
                                onChange={(e) => onMinSpeechDurationChange(parseFloat(e.target.value))}
                                className="w-full h-4"
                            />
                        </div>

                        {/* Hysteresis Ratio */}
                        <div className="flex flex-col">
                            <label className="text-xs mb-1">Hysteresis: {hysteresisRatio.toFixed(2)}</label>
                            <input
                                type="range"
                                min="1.0"
                                max="2.0"
                                step="0.1"
                                value={hysteresisRatio}
                                onChange={(e) => onHysteresisChange(parseFloat(e.target.value))}
                                className="w-full h-4"
                            />
                        </div>

                        {/* Min Energy Integral */}
                        <div className="flex flex-col">
                            <label className="text-xs mb-1">Min Energy Integral: {minEnergyIntegral.toFixed(3)}</label>
                            <input
                                type="range"
                                min="5"
                                max="50"
                                step="5"
                                value={minEnergyIntegral}
                                onChange={(e) => onMinEnergyIntegralChange(parseFloat(e.target.value))}
                                className="w-full h-4"
                            />
                        </div>
                    </div>
                </div>

                {/* Stats Widget */}
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <StatsWidget />
                </div>
            </div>
        </div>
    );
}
