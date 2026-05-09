import React from 'react';
import { Search } from 'lucide-react';
import clsx from 'clsx';

export default function DeviceFilters({
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  vendorFilter,
  setVendorFilter,
  vendors,
  filteredCount
}) {
  return (
    <div className="px-6 py-3 bg-slate-900/40 border-b border-slate-800 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search serial, IP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-white text-sm rounded-lg pl-9 pr-3 py-1.5 focus:ring-1 focus:ring-primary focus:border-primary w-full sm:w-48 outline-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Status:</span>
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
          {['all', 'online', 'offline'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                "px-3 py-1 text-[10px] font-bold rounded-md transition-all capitalize",
                statusFilter === s ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-500 hover:text-slate-300"
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
        Found <span className="text-white font-bold">{filteredCount}</span> devices
      </div>
    </div>
  );
}
