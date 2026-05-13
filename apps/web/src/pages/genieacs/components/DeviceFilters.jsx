import React from 'react';
import clsx from 'clsx';

export default function DeviceFilters({
  statusFilter,
  setStatusFilter,
  vendorFilter,
  setVendorFilter,
  vendors,
  deviceCount
}) {
  return (
    <div className="px-3 sm:px-6 py-2 sm:py-3 bg-slate-900/40 border-b border-slate-800 flex flex-wrap items-center gap-2 sm:gap-4">

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Status:</span>
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
          {['all', 'online', 'offline'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                "px-3 py-1 text-[10px] font-bold rounded-md transition-all capitalize",
                statusFilter === s ? "bg-primary text-[var(--on-primary)] shadow-lg shadow-primary/20" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Vendor:</span>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 text-[10px] text-slate-300 font-bold rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary appearance-none cursor-pointer"
        >
          <option value="all">ALL VENDORS</option>
          {vendors.map(v => (
            <option key={v} value={v}>{v.toUpperCase()}</option>
          ))}
        </select>
      </div>

      <div className="ml-auto text-[10px] text-slate-500 font-medium">
        Found <span className="text-white font-bold">{deviceCount}</span> devices
      </div>
    </div>
  );
}
