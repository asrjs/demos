import React from 'react';
import VUMeter from './VUMeter';
import { useState, useEffect } from 'react';

export function StatsWidget({ 
    chunks, 
    audioContextRef,
    segments,
    threshold 
}) {
    const [maxValue, setMaxValue] = useState(0);
    
    useEffect(() => {
        if (!chunks.length) return;
        const lastChunk = chunks[chunks.length - 1];
        if (!lastChunk) return;
        
        // Calculate max value from the last chunk
        const chunkMaxValue = Math.max(...Array.from(lastChunk).map(Math.abs));
        setMaxValue(chunkMaxValue);
    }, [chunks]);

    if (!audioContextRef?.current) return null;

    const totalDuration = chunks.reduce((acc, chunk) => acc + chunk.length, 0) / audioContextRef.current.sampleRate;
    const totalSegments = segments.length;
    const processedSegments = segments.filter(s => s.isProcessed).length;

    return (
        <div className="mt-4 p-4 border rounded-lg space-y-2">
            <h3 className="font-semibold mb-2">Audio Stats</h3>
            
            {/* Add VU Meter at the top */}
            <VUMeter value={maxValue} />
            
            <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span className="font-medium">Duration:</span> {totalDuration.toFixed(1)}s
                </div>
                <div>
                    <span className="font-medium">Threshold:</span> {threshold.toFixed(3)}
                </div>
                <div>
                    <span className="font-medium">Segments:</span> {totalSegments}
                </div>
                <div>
                    <span className="font-medium">Processed:</span> {processedSegments}
                </div>
            </div>
        </div>
    );
} 