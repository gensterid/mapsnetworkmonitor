import React, { useState, useEffect, useRef } from 'react';

export default function SearchableSelect({
    options = [], // Array of { value, label }
    value = '',
    onChange,
    placeholder = 'Select an option',
    disabled = false,
    className = '',
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    // Get selected label
    const selectedOption = options.find(opt => opt.value === value);
    const displayValue = selectedOption ? selectedOption.label : '';

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Filter options
    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSelect = (option) => {
        onChange({ target: { name: 'connectedToId', value: option.value } }); // Mimic event for compatibility
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            {/* Trigger Button */}
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`
                    w-full px-3 py-2 text-left bg-slate-800/80 border rounded-md cursor-pointer flex items-center justify-between
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-500'}
                    ${isOpen ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-700/50'}
                `}
            >
                <span className={`block truncate ${!displayValue ? 'text-slate-500' : 'text-slate-200'}`}>
                    {displayValue || placeholder}
                </span>
                <span className="material-symbols-outlined text-slate-400 text-[20px]">
                    arrow_drop_down
                </span>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg max-h-60 overflow-hidden flex flex-col">
                    {/* Search Input */}
                    <div className="p-2 border-b border-slate-700">
                        <input
                            ref={inputRef}
                            type="text"
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                            placeholder="Search..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* Options List */}
                    <div className="overflow-y-auto flex-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => (
                                <div
                                    key={option.value}
                                    onClick={() => handleSelect(option)}
                                    className={`
                                        px-3 py-2 text-sm cursor-pointer truncate
                                        ${option.value === value ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300 hover:bg-slate-700'}
                                    `}
                                >
                                    {option.label}
                                </div>
                            ))
                        ) : (
                            <div className="px-3 py-2 text-sm text-slate-500 text-center">
                                No results found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
