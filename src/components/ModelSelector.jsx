import models from '../models.js';

export function ModelSelector({ model, setModel }) {
    return (
        <select
            className="border rounded-lg p-2 mr-2"
            value={model}
            onChange={(e) => setModel(e.target.value)}
        >
            {Object.entries(models).map(([name, id]) => (
                <option key={id} value={id}>
                    {name}
                </option>
            ))}
        </select>
    );
} 