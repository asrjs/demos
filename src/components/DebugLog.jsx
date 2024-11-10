import React from 'react';

export function DebugLog({ logs = [] }) {
    const logRef = React.useRef(null);

    // Auto-scroll to bottom when new logs arrive
    React.useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="w-full mt-4 p-4 border rounded-lg">
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">Debug Log</h3>
                <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('clearDebugLogs'))}
                    className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                >
                    Clear
                </button>
            </div>
            <pre 
                ref={logRef}
                className="bg-gray-50 p-2 rounded h-[200px] overflow-y-auto text-xs font-mono whitespace-pre-wrap"
            >
                {logs.map((log, i) => (
                    <div key={i} className={`${log.type === 'error' ? 'text-red-600' : ''}`}>
                        [{new Date(log.timestamp).toISOString().split('T')[1].split('.')[0]}] {log.message}
                    </div>
                ))}
            </pre>
        </div>
    );
} 