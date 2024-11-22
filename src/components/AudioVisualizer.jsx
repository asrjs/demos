import React, { useState, useCallback } from 'react';
import { BufferVisualizer } from './BufferVisualizer';
import { StatsWidget } from './StatsWidget';
import VUMeter from './VUMeter';

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
    onMinSpeechDurationChange,
    processor,
    minEnergyIntegral,
    onMinEnergyIntegralChange
}) {
    // Add state for displaying current values
    const [currentEnergy, setCurrentEnergy] = useState(0);
    const [averageEnergy, setAverageEnergy] = useState(0);
    const [peakEnergy, setPeakEnergy] = useState(0);
    const [rawPeakValue, setRawPeakValue] = useState(0);

    // Enhanced energy update handler with proper scaling
    const handleEnergyUpdate = useCallback((energy, avg, peak, rawPeak) => {
        // Scale energy values based on energyScale
        const scale = energyScale || 1.0;
        setCurrentEnergy(energy * scale);
        setAverageEnergy(avg * scale);
        setPeakEnergy(peak * scale);
        setRawPeakValue(rawPeak);
    }, [energyScale]);

    return (
        <div className={className}>
            {/* BufferVisualizer */}
            <div className="mb-2">
                <BufferVisualizer 
                    chunks={chunks}
                    audioContextRef={audioContextRef}
                    segments={segments}
                    onEnergyUpdate={handleEnergyUpdate}
                />
            </div>
            
            {/* VU Meters with enhanced display */}
            <div className="mb-4 space-y-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                <VUMeter 
                    value={currentEnergy} 
                    max={energyScale || 1.0}
                    label="Current"
                    className="mb-1"
                />
                <VUMeter 
                    value={averageEnergy}
                    max={energyScale || 1.0}
                    label="Average"
                    className="mb-1"
                />
                <VUMeter 
                    value={peakEnergy} 
                    max={energyScale || 1.0}
                    label="Peak"
                />
                
                {/* Display numerical values for debugging */}
                <div className="mt-1 text-xs grid grid-cols-2 gap-1">
                    <div>Raw Peak: {rawPeakValue.toFixed(4)}</div>
                    <div>Threshold: {threshold.toFixed(4)}</div>
                </div>
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
                                min="0.05"
                                max="1.0"
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

                    {/* Current Values Display */}
                    <div className="mt-2 text-xs grid grid-cols-4 gap-1">
                        <div>Current: {currentEnergy.toFixed(4)}</div>
                        <div>Avg: {averageEnergy.toFixed(4)}</div>
                        <div>Peak: {peakEnergy.toFixed(4)}</div>
                        <div>Raw: {rawPeakValue.toFixed(4)}</div>
                    </div>
                </div>

                {/* Stats Widget */}
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <StatsWidget 
                        chunks={chunks}
                        audioContextRef={audioContextRef}
                        segments={segments}
                        threshold={threshold}
                        processor={processor}
                    />
                </div>
            </div>
        </div>
    );
}
