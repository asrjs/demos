import React, { useState } from 'react';
import { BufferVisualizer } from './BufferVisualizer';

/**
 * Component for visualizing audio data and controls
 * @component
 * @param {Object} props
 * @param {string} props.className - CSS classes
 * @param {MediaStream} props.stream - Audio stream
 * @param {number} props.threshold - Energy threshold
 * @param {Function} props.onThresholdChange - Threshold change handler
 * @param {Array<Float32Array>} props.chunks - Audio chunks
 * @param {Array<Object>} props.segments - Detected segments
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
    chunks = [],
    audioContextRef,
    segments = [],
    energyScale,
    onEnergyScaleChange,
    hysteresisRatio,
    onHysteresisChange,
    minSpeechDuration,
    onMinSpeechDurationChange
}) {
    // Add state for displaying current values
    const [currentEnergy, setCurrentEnergy] = useState(0);
    const [averageEnergy, setAverageEnergy] = useState(0);
    const [peakEnergy, setPeakEnergy] = useState(0);
    const [rawPeakValue, setRawPeakValue] = useState(0);

    return (
        <div className={className}>
            {/* Single BufferVisualizer */}
            <div className="mb-4">
                <BufferVisualizer 
                    chunks={chunks}
                    audioContextRef={audioContextRef}
                    segments={segments}
                    onEnergyUpdate={(energy, avg, peak, rawPeak) => {
                        setCurrentEnergy(energy);
                        setAverageEnergy(avg);
                        setPeakEnergy(peak);
                        setRawPeakValue(rawPeak);
                    }}
                />
            </div>
            
            {/* Parameters Panel */}
            <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <h3 className="font-semibold mb-2">Speech Detection Parameters</h3>
                
                <div className="grid grid-cols-2 gap-4">
                    {/* Energy Threshold */}
                    <div className="flex flex-col">
                        <label className="text-sm">Energy Threshold: {threshold.toFixed(3)}</label>
                        <input
                            type="range"
                            min="0.001"
                            max="0.1"
                            step="0.001"
                            value={threshold}
                            onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    {/* Energy Scale */}
                    <div className="flex flex-col">
                        <label className="text-sm">Energy Scale: {energyScale.toFixed(1)}</label>
                        <input
                            type="range"
                            min="0.1"
                            max="2.0"
                            step="0.1"
                            value={energyScale}
                            onChange={(e) => onEnergyScaleChange(parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    {/* Silence Length */}
                    <div className="flex flex-col">
                        <label className="text-sm">Min Silence (s): {silenceLength.toFixed(2)}</label>
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={silenceLength}
                            onChange={(e) => onSilenceLengthChange(parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    {/* Speech Hangover */}
                    <div className="flex flex-col">
                        <label className="text-sm">Speech Hangover (s): {speechHangover.toFixed(2)}</label>
                        <input
                            type="range"
                            min="0.1"
                            max="0.5"
                            step="0.05"
                            value={speechHangover}
                            onChange={(e) => onHangoverChange(parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    {/* Min Speech Duration */}
                    <div className="flex flex-col">
                        <label className="text-sm">Min Speech (s): {minSpeechDuration.toFixed(2)}</label>
                        <input
                            type="range"
                            min="0.05"
                            max="0.5"
                            step="0.05"
                            value={minSpeechDuration}
                            onChange={(e) => onMinSpeechDurationChange(parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>

                    {/* Hysteresis Ratio */}
                    <div className="flex flex-col">
                        <label className="text-sm">Hysteresis: {hysteresisRatio.toFixed(2)}</label>
                        <input
                            type="range"
                            min="1.0"
                            max="2.0"
                            step="0.1"
                            value={hysteresisRatio}
                            onChange={(e) => onHysteresisChange(parseFloat(e.target.value))}
                            className="w-full"
                        />
                    </div>
                </div>

                {/* Current Values Display */}
                <div className="mt-4 text-sm grid grid-cols-4 gap-2">
                    <div>Current Energy: {currentEnergy.toFixed(4)}</div>
                    <div>Average Energy: {averageEnergy.toFixed(4)}</div>
                    <div>Peak Energy: {peakEnergy.toFixed(4)}</div>
                    <div>Raw Peak: {rawPeakValue.toFixed(4)}</div>
                </div>
            </div>
        </div>
    );
}
