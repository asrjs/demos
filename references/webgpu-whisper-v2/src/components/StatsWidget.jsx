import React from 'react';
import VUMeter from './VUMeter';
import { useState, useEffect } from 'react';
import { audioManager } from '../AudioManager';

export function StatsWidget() {
    const [metrics, setMetrics] = useState(audioManager.getMetrics());
    
    useEffect(() => {
        const interval = setInterval(() => {
            setMetrics(audioManager.getMetrics());
        }, 100);
        
        return () => clearInterval(interval);
    }, []);

    return (
        <div>
            <h3 className="text-xs font-semibold mb-2">Audio Stats</h3>
            <div className="text-xs space-y-1">
                <div>Current Energy: {metrics.currentEnergy.toFixed(4)}</div>
                <div>Average Energy: {metrics.averageEnergy.toFixed(4)}</div>
                <div>Peak Energy: {metrics.peakEnergy.toFixed(4)}</div>
                <div>Buffer Duration: {metrics.bufferDuration.toFixed(2)}s</div>
            </div>
        </div>
    );
} 