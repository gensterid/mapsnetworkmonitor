
const dateStr = "2026-03-19 06:11:10.849+08";
const formatTs = dateStr.replace(' ', 'T');
console.log('Original:', dateStr);
console.log('Formatted:', formatTs);
const d = new Date(formatTs);
console.log('Date object:', d.toString());
console.log('Is valid:', !isNaN(d.getTime()));
console.log('Locale string (id-ID):', d.toLocaleString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric',
    hour: '2-digit', 
    minute: '2-digit' 
}));
