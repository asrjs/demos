import React from 'react';

export function SpeechSegmentsDebug({ segments = [] }) {
    return (
        <div className="w-full mt-4 p-4 border rounded-lg">
            <h3 className="font-semibold mb-2">Speech Segments Debug</h3>
            <div className="max-h-[200px] overflow-y-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left border-b">
                            <th className="p-2">#</th>
                            <th className="p-2">Start</th>
                            <th className="p-2">End</th>
                            <th className="p-2">Duration</th>
                            <th className="p-2">Energy</th>
                            <th className="p-2">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {segments.map((segment, index) => (
                            <tr key={index} className="border-b hover:bg-gray-50">
                                <td className="p-2">{index + 1}</td>
                                <td className="p-2">{segment.startTime.toFixed(2)}s</td>
                                <td className="p-2">{segment.endTime.toFixed(2)}s</td>
                                <td className="p-2">{segment.getDuration().toFixed(2)}s</td>
                                <td className="p-2">{segment.energy.toFixed(3)}</td>
                                <td className="p-2">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        segment.isProcessed 
                                            ? 'bg-green-100 text-green-800' 
                                            : 'bg-yellow-100 text-yellow-800'
                                    }`}>
                                        {segment.isProcessed ? 'Processed' : 'Pending'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {segments.length === 0 && (
                    <div className="text-center text-gray-500 py-4">
                        No speech segments detected yet
                    </div>
                )}
            </div>
        </div>
    );
} 