import models from '../models.js';

export function ModelSelector({ model, setModel }) {
    // Debug logs
    console.log('Available models:', models);
    
    // Group models by type
    const groupedModels = {
        'Turkish Models': Object.entries(models).filter(([name, id]) => {
            const isTurkish = id.includes('ysdede') || id.includes('dsntt1');
            console.log('Turkish check:', name, id, isTurkish);
            return isTurkish;
        }),
        'English Models': Object.entries(models).filter(([name, id]) => {
            const isEnglish = id.endsWith('.en');
            console.log('English check:', name, id, isEnglish);
            return isEnglish;
        }),
        'Multilingual Models': Object.entries(models).filter(([name, id]) => {
            const isMultilingual = !id.includes('ysdede') && !id.includes('dsntt1') && !id.endsWith('.en');
            console.log('Multilingual check:', name, id, isMultilingual);
            return isMultilingual;
        })
    };

    // Debug grouped models
    console.log('Grouped models:', groupedModels);

    return (
        <select
            className="border rounded-lg p-2 mr-2"
            value={model}
            onChange={(e) => setModel(e.target.value)}
        >
            {Object.entries(groupedModels).map(([group, modelList]) => {
                console.log('Rendering group:', group, modelList);
                return (
                    <optgroup key={group} label={group}>
                        {modelList.map(([name, id]) => (
                            <option key={id} value={id}>
                                {name}
                            </option>
                        ))}
                    </optgroup>
                );
            })}
        </select>
    );
} 