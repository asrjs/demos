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
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-semibold mb-2">Audio Stats</h3>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <h4 className="font-medium">Silence Stats</h4>
                    <p>Avg Duration: {localStats.silence.avgDuration.toFixed(2)}s</p>
                    <p>Avg Energy: {localStats.silence.avgEnergy.toFixed(4)}</p>
                    <p>Energy Integral: {localStats.silence.avgEnergyIntegral.toFixed(4)}</p>
                </div>
                <div>
                    <h4 className="font-medium">Speech Stats</h4>
                    <p>Avg Duration: {localStats.speech.avgDuration.toFixed(2)}s</p>
                    <p>Avg Energy: {localStats.speech.avgEnergy.toFixed(4)}</p>
                    <p>Energy Integral: {localStats.speech.avgEnergyIntegral.toFixed(4)}</p>
                </div>
                <div className="col-span-2">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p>Total Segments: {segments.length}</p>
                            <p>Energy Threshold: {threshold.toFixed(4)}</p>
                        </div>
                        <div>
                            <p>Buffer Duration: {(chunks.length * 1600 / 16000).toFixed(2)}s</p>
                            <p>Sample Rate: {audioContextRef.current?.sampleRate || 16000}Hz</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 