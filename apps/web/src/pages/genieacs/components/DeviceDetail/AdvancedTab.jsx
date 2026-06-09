import React, { useState } from 'react';
import { Search } from 'lucide-react';

export default function AdvancedTab({ fullDevice }) {
  const [search, setSearch] = useState('');

  const flattenTree = (obj, prefix = '') => {
    if (!obj) return [];
    let items = [];
    for (const key in obj) {
      if (key.startsWith('_')) continue;

      const currentPath = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      if (typeof value === 'object' && value !== null) {
        if ('_value' in value) {
          items.push({ path: currentPath, data: value, isObject: false });
        } else {
          items.push({ path: currentPath, data: value, isObject: true });
          items = items.concat(flattenTree(value, currentPath));
        }
      }
    }
    return items;
  };

  const renderParamRow = (path, value, isObject = false) => {
    if (search && !path.toLowerCase().includes(search.toLowerCase()) && !String(value._value || '').toLowerCase().includes(search.toLowerCase())) {
      return null;
    }

    return (
      <div key={path} className="flex flex-col py-1.5 border-b border-slate-border/50 last:border-0 hover:bg-slate-800/30 px-2 rounded group">
        <div className="flex justify-between items-start gap-2">
          <span className="text-[10px] font-mono text-fg-muted break-all">{path}</span>
          <span className="text-[10px] font-mono text-primary bg-primary/5 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
            {value._type || (isObject ? 'Object' : 'String')}
          </span>
        </div>
        <div className="text-sm text-slate-200 break-all mt-0.5">
          {isObject ? (
            <span className="text-fg-muted italic">Object</span>
          ) : (
            value._value === undefined || value._value === null ? 'null' : String(value._value)
          )}
        </div>
      </div>
    );
  };

  const flattenedParams = fullDevice ? flattenTree(fullDevice) : [];

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
        <input
          type="text"
          placeholder="Search TR-069 parameters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface-dark border border-slate-border rounded-lg pl-10 pr-4 py-2 text-sm text-fg focus:ring-1 focus:ring-primary outline-none"
        />
      </div>
      <div className="flex-1 bg-slate-950/50 rounded-xl border border-slate-900 p-2 custom-scrollbar overflow-auto">
        {flattenedParams.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-fg-muted font-medium italic text-sm">
            No parameters found
          </div>
        ) : (
          <div className="space-y-1">
            {flattenedParams.map(item => renderParamRow(item.path, item.data, item.isObject))}
          </div>
        )}
      </div>
    </div>
  );
}
