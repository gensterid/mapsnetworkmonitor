import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useRebootGenieACSDevice } from '@/hooks';

export default function RebootModal({ isOpen, onClose, device }) {
  const rebootMutation = useRebootGenieACSDevice();

  const handleReboot = () => {
    if (!device) return;
    rebootMutation.mutate({ id: device._id, routerId: device.routerId }, {
      onSuccess: () => onClose()
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reboot Device">
      <div className="space-y-4">
        <p className="text-slate-300">
          Are you sure you want to reboot <strong className="text-white">{device?._id}</strong>?
          This will temporarily interrupt service for the customer.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleReboot} loading={rebootMutation.isPending}>
            Reboot
          </Button>
        </div>
      </div>
    </Modal>
  );
}
