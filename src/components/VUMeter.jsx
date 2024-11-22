import React from 'react';

const VUMeter = ({ 
    value = 0, 
    min = 0, 
    max = 1.0, 
    label = 'VU',
    className = ''
}) => {
    // Ensure value is a number and clamp it
    const safeValue = typeof value === 'number' ? value : 0;
    const percentage = Math.min(100, Math.max(0, ((safeValue - min) / (max - min)) * 100));
    
    // Calculate color based on value
    const getColor = (percent) => {
        if (percent > 80) return 'bg-red-500';
        if (percent > 60) return 'bg-yellow-500';
        return 'bg-green-500';
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div className="text-xs w-14">{label}: {safeValue.toFixed(3)}</div>
            <div className="h-4 flex-1 bg-gray-200 rounded-full overflow-hidden">
                <div 
                    className={`h-full transition-all duration-100 ${getColor(percentage)}`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};

export default VUMeter; 