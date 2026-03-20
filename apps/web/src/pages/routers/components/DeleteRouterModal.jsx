import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api';

// Delete Confirmation Modal
export function DeleteRouterModal({ isOpen, onClose, router, onSuccess }) {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await apiClient.delete(`/routers/${router.id}`);
            onSuccess?.();
            onClose();
        } catch (err) {
            alert('Failed to delete: ' + (err.response?.data?.message || err.message));
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Delete Router">
            <div className="space-y-4">
                <p className="text-slate-300">
                    Are you sure you want to delete <strong className="text-white">{router?.name}</strong>?
                    This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" onClick={handleDelete} loading={isDeleting}>
                        Delete
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export default DeleteRouterModal;
