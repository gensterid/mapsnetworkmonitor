import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

function PppoeCoordinatesModal({ session, onClose, onSave, isSaving }) {
    const [formData, setFormData] = useState({
        latitude: '',
        longitude: ''
    });

    useEffect(() => {
        if (session) {
            setFormData({
                latitude: session.latitude || '',
                longitude: session.longitude || ''
            });
        }
    }, [session]);

    const handlePaste = (e) => {
        const pasteData = e.clipboardData.getData('Text');
        if (pasteData && pasteData.includes(',')) {
            const parts = pasteData.split(',').map(s => s.trim());
            if (parts.length >= 2) {
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    e.preventDefault();
                    setFormData({
                        latitude: lat.toString(),
                        longitude: lng.toString()
                    });
                }
            }
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <Modal isOpen={!!session} onClose={onClose} title={`Set Coordinates: ${session?.name}`}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Latitude"
                        name="latitude"
                        value={formData.latitude}
                        onChange={handleChange}
                        onPaste={handlePaste}
                        placeholder="e.g. -6.123"
                        required
                    />
                    <Input
                        label="Longitude"
                        name="longitude"
                        value={formData.longitude}
                        onChange={handleChange}
                        onPaste={handlePaste}
                        placeholder="e.g. 106.123"
                        required
                    />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                    <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" loading={isSaving}>Update Coordinates</Button>
                </div>
            </form>
        </Modal>
    );
}

export default PppoeCoordinatesModal;
