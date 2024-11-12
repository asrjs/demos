import React from 'react';

export function StatsWidget({ 
    chunks, 
    audioContextRef,
    segments,
    threshold 
}) {
    // Calculate basic stats
    const totalDuration = chunks.reduce((acc, chunk) => acc + chunk.length, 0) / (audioContextRef?.current?.sampleRate || 16000);
    const activeSegments = segments.filter(s => !s.isProcessed).length;
    const processedSegments = segments.filter(s => s.isProcessed).length;

    return (
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-semibold mb-2">Buffer Statistics</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Total Duration: {totalDuration.toFixed(1)}s</div>
                <div>Active Segments: {activeSegments}</div>
                <div>Processed Segments: {processedSegments}</div>
                <div>Total Segments: {segments.length}</div>
            </div>
        </div>
    );
} 