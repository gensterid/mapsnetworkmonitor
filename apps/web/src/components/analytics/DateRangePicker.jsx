import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Calendar, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

/**
 * Accessible DateRangePicker with ARIA support and glassmorphism design.
 */
function DateRangePicker({ value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    
    const presets = [
        { label: '7 Hari', days: 7 },
        { label: '30 Hari', days: 30 },
        { label: '90 Hari', days: 90 },
    ];

    // Close on escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    return (
        <div className="relative" ref={dropdownRef}>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-label={`Pilih rentang waktu: ${value.label || 'Kustom'}`}
            >
                <Calendar className="w-4 h-4 mr-2" aria-hidden="true" />
                {value.label || 'Pilih Periode'}
                <ChevronDown className={clsx("w-4 h-4 ml-2 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
            </Button>
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} aria-hidden="true" />
                    <div 
                        className="absolute right-0 top-full mt-2 z-20 w-72 rounded-lg bg-slate-800 border border-slate-700 shadow-xl p-4 focus:outline-none"
                        role="dialog"
                        aria-label="Pilih Rentang Waktu"
                    >
                        <div className="flex gap-2 mb-4" role="group" aria-label="Preset Rentang Waktu">
                            {presets.map((preset) => (
                                <button
                                    key={preset.days}
                                    onClick={() => {
                                        const end = new Date();
                                        const start = new Date();
                                        start.setDate(start.getDate() - preset.days);
                                        onChange({
                                            startDate: start.toISOString().split('T')[0],
                                            endDate: end.toISOString().split('T')[0],
                                            label: preset.label,
                                        });
                                        setIsOpen(false);
                                    }}
                                    className={clsx(
                                        "flex-1 px-3 py-2 rounded-lg text-sm transition-colors focus:ring-2 focus:ring-primary/50 outline-none",
                                        value.label === preset.label
                                            ? "bg-primary text-[var(--on-primary)]"
                                            : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                    )}
                                    aria-current={value.label === preset.label ? 'true' : 'false'}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label id="label-start-date" className="text-xs text-slate-400 block mb-1">Dari Tanggal</label>
                                <input
                                    type="date"
                                    value={value.startDate}
                                    onChange={(e) => onChange({ ...value, startDate: e.target.value, label: 'Custom' })}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:border-primary focus:outline-none"
                                    aria-labelledby="label-start-date"
                                />
                            </div>
                            <div>
                                <label id="label-end-date" className="text-xs text-slate-400 block mb-1">Sampai Tanggal</label>
                                <input
                                    type="date"
                                    value={value.endDate}
                                    onChange={(e) => onChange({ ...value, endDate: e.target.value, label: 'Custom' })}
                                    className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:border-primary focus:outline-none"
                                    aria-labelledby="label-end-date"
                                />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default DateRangePicker;
