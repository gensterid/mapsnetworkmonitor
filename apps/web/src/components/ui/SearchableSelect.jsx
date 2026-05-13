import React, { useState, useEffect, useRef, useId } from 'react';

export default function SearchableSelect({
    options = [], // Array of { value, label }
    value = '',
    onChange,
    name = '', // Added name prop
    placeholder = 'Select an option',
    disabled = false,
    className = '',
    clearable = true,           // Allow user to reset value back to empty
    clearLabel = '— Kosongkan —', // Label shown for the empty option in dropdown
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef(null);
    const inputRef = useRef(null);
    const listboxId = useId();

    // Get selected label
    const selectedOption = options.find(opt => opt.value === value);
    const displayValue = selectedOption ? selectedOption.label : '';

    // Filter options
    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
            setActiveIndex(-1);
        }
    }, [isOpen]);

    const handleSelect = (option) => {
        onChange({ target: { name: name, value: option.value } });
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleClear = (e) => {
        e.stopPropagation();
        onChange({ target: { name: name, value: '' } });
        setSearchTerm('');
    };

    const hasValue = value !== '' && value !== null && value !== undefined;
    const showClearButton = clearable && hasValue && !disabled;

    const handleKeyDown = (e) => {
        if (disabled) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (!isOpen) {
                    setIsOpen(true);
                } else {
                    setActiveIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
                break;
            case 'Enter':
                e.preventDefault();
                if (isOpen && activeIndex >= 0) {
                    handleSelect(filteredOptions[activeIndex]);
                } else if (!isOpen) {
                    setIsOpen(true);
                }
                break;
            case 'Escape':
                if (isOpen) {
                    e.preventDefault();
                    setIsOpen(false);
                }
                break;
            case 'Tab':
                if (isOpen) setIsOpen(false);
                break;
        }
    };

    return (
        <div className={`relative ${className}`} ref={containerRef} onKeyDown={handleKeyDown}>
            {/* Trigger Button */}
            <div
                role="combobox"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-controls={listboxId}
                aria-label={placeholder}
                tabIndex={disabled ? -1 : 0}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`
                    w-full px-3 py-2 text-left bg-slate-800/80 border rounded-md cursor-pointer flex items-center justify-between
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-500'}
                    ${isOpen ? 'border-blue-500 ring-1 ring-blue-500 outline-none' : 'border-slate-700/50'}
                `}
            >
                <span className={`block truncate ${!displayValue ? 'text-slate-500' : 'text-slate-200'}`}>
                    {displayValue || placeholder}
                </span>
                <span className="flex items-center gap-0.5 shrink-0">
                    {showClearButton && (
                        <button
                            type="button"
                            onClick={handleClear}
                            aria-label="Kosongkan pilihan"
                            title="Kosongkan pilihan"
                            className="text-slate-400 hover:text-red-400 hover:bg-slate-700/60 rounded p-0.5 transition-colors leading-none"
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    )}
                    <span className="material-symbols-outlined text-slate-400 text-[20px]">
                        arrow_drop_down
                    </span>
                </span>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div
                    id={listboxId}
                    role="listbox"
                    className="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-lg max-h-60 overflow-hidden flex flex-col"
                >
                    {/* Search Input */}
                    <div className="p-2 border-b border-slate-700">
                        <input
                            ref={inputRef}
                            type="text"
                            className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                            placeholder="Search..."
                            aria-label="Filter options"
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setActiveIndex(-1);
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* Options List */}
                    <div className="overflow-y-auto flex-1">
                        {clearable && hasValue && searchTerm === '' && (
                            <div
                                role="option"
                                aria-selected={false}
                                onClick={() => {
                                    onChange({ target: { name: name, value: '' } });
                                    setIsOpen(false);
                                    setSearchTerm('');
                                }}
                                className="px-3 py-2 text-sm cursor-pointer text-slate-400 italic hover:bg-slate-700 hover:text-red-300 border-b border-slate-700/50"
                            >
                                {clearLabel}
                            </div>
                        )}
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option, index) => (
                                <div
                                    key={option.value}
                                    role="option"
                                    aria-selected={option.value === value}
                                    onClick={() => handleSelect(option)}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    className={`
                                        px-3 py-2 text-sm cursor-pointer truncate
                                        ${option.value === value ? 'bg-blue-600/30 text-blue-400' : ''}
                                        ${index === activeIndex ? 'bg-slate-700 text-white' : 'text-slate-300'}
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
