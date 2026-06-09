import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export default function EditOnuModal({ 
    isOpen, 
    onClose, 
    onu, 
    onSubmit, 
    isSubmitting 
}) {
    if (!onu) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const coords = formData.get('coordinates');

        let latitude = null;
        let longitude = null;

        if (coords && coords.includes(',')) {
            const [latPart, lngPart] = coords.split(',').map(s => s.trim());
            if (!isNaN(parseFloat(latPart)) && !isNaN(parseFloat(lngPart))) {
                latitude = latPart;
                longitude = lngPart;
            }
        }

        onSubmit({
            name: formData.get('name'),
            description: formData.get('description') || null,
            latitude: latitude,
            longitude: longitude,
            location: formData.get('location') || null,
        });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Edit ONU: ${onu.sn}`}
        >
            <form onSubmit={handleSubmit} className="space-y-5 py-2">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">ONU Name / Alias</label>
                    <input
                        name="name"
                        defaultValue={onu.name || ''}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-fg focus:ring-1 focus:ring-primary outline-none transition-all"
                        placeholder="e.g. John Doe - Home"
                        autoFocus
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">Description / Note</label>
                    <textarea
                        name="description"
                        defaultValue={onu.description || ''}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-fg focus:ring-1 focus:ring-primary outline-none transition-all h-20 resize-none"
                        placeholder="Additional details about this ONU..."
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">Maps Coordinates</label>
                    <input
                        name="coordinates"
                        defaultValue={onu.latitude && onu.longitude ? `${onu.latitude}, ${onu.longitude}` : ''}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-fg font-mono focus:ring-1 focus:ring-primary outline-none transition-all"
                        placeholder="latitude, longitude (e.g. -6.123, 106.123)"
                    />
                    <p className="text-[9px] text-fg-muted italic">Format: latitude, longitude (copy-paste from Google Maps)</p>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/50">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" loading={isSubmitting}>
                        Save Changes
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
