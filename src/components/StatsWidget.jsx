import React from 'react';
import VUMeter from './VUMeter';
import { useState, useEffect } from 'react';

export function StatsWidget({ 
    chunks, 
    audioContextRef,
    segments,
    threshold,
    processor
}) {
    const stats = processor?.getStats() || {
        silence: { avgDuration: 0, avgEnergy: 0, avgEnergyIntegral: 0 },
        speech: { avgDuration: 0, avgEnergy: 0, avgEnergyIntegral: 0 }
    };

    const [localStats, setLocalStats] = useState(stats);
    
    useEffect(() => {
        const interval = setInterval(() => {
            if (processor) {
                setLocalStats(processor.getStats());
            }
        }, 100);

        return () => clearInterval(interval);
    }, [processor]);

    return (
        <div>
            <h3 className="text-xs font-semibold mb-2">Audio Stats</h3>
            
            <div className="grid grid-cols-2 gap-4">
                {/* Silence Stats */}
                <div>
                    <h4 className="text-xs font-semibold mb-1">Silence Stats</h4>
                    <div className="text-xs space-y-1">
                        <div>Avg Duration: {localStats.silence.avgDuration.toFixed(2)}s</div>
                        <div>Avg Energy: {localStats.silence.avgEnergy.toFixed(4)}</div>
                        <div>Energy Integral: {localStats.silence.avgEnergyIntegral.toFixed(4)}</div>
                    </div>
                </div>

                {/* Speech Stats */}
                <div>
                    <h4 className="text-xs font-semibold mb-1">Speech Stats</h4>
                    <div className="text-xs space-y-1">
                        <div>Avg Duration: {localStats.speech.avgDuration.toFixed(2)}s</div>
                        <div>Avg Energy: {localStats.speech.avgEnergy.toFixed(4)}</div>
                        <div>Energy Integral: {localStats.speech.avgEnergyIntegral.toFixed(4)}</div>
                    </div>
                </div>
            </div>

            {/* Additional Stats */}
            <div className="mt-2 text-xs space-y-1">
                <div>Total Segments: {segments.length}</div>
                <div>Energy Threshold: {threshold.toFixed(4)}</div>
                <div>Buffer Duration: {(chunks.length * 1600 / 16000).toFixed(2)}s</div>
                <div>Sample Rate: {audioContextRef.current?.sampleRate || 16000}Hz</div>
            </div>
        </div>
    );
} 