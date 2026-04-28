import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/lib/api';

/**
 * Standalone print page for a voucher batch. Three layouts:
 *   ?layout=a4       — 4 vouchers per row, A4 (default)
 *   ?layout=small    — 6 vouchers per row, denser
 *   ?layout=thermal  — single column 58/80mm thermal receipt
 *
 * Loaded outside AppLayout (no sidebar, no chrome) so window.print() captures
 * exactly what the operator sees.
 */
export default function VoucherPrint() {
    const { id } = useParams();
    const [params] = useSearchParams();
    const layout = params.get('layout') || 'a4';

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        apiClient.get(`/billing/vouchers/batches/${id}`)
            .then((r) => setData(r.data?.data || null))
            .catch((e) => setError(e?.response?.data?.error || e.message));
    }, [id]);

    if (error) return <div style={{ padding: 24, color: '#b91c1c' }}>Error: {error}</div>;
    if (!data) return <div style={{ padding: 24 }}>Memuat…</div>;

    const { batch, vouchers } = data;
    const titleText = `Cetak Voucher — ${vouchers.length} voucher`;

    return (
        <div className={`print-page layout-${layout}`}>
            <style>{voucherCss(layout)}</style>

            <div className="print-toolbar no-print">
                <h2>{titleText}</h2>
                <div className="actions">
                    <select defaultValue={layout} onChange={(e) => {
                        const url = new URL(window.location.href);
                        url.searchParams.set('layout', e.target.value);
                        window.location.href = url.toString();
                    }}>
                        <option value="a4">A4 — 4 per baris</option>
                        <option value="small">A4 kecil — 6 per baris</option>
                        <option value="thermal">Thermal 58/80mm</option>
                    </select>
                    <button onClick={() => window.print()}>Print</button>
                </div>
            </div>

            <div className="voucher-grid">
                {vouchers.map((v, idx) => (
                    <Voucher key={v.id} v={v} idx={idx + 1} batchNote={batch?.notes} />
                ))}
            </div>
        </div>
    );
}

function Voucher({ v, idx, batchNote }) {
    return (
        <div className="voucher">
            <div className="vh">
                <span className="vno">#{String(idx).padStart(3, '0')}</span>
                <span className="vp">{v.profile}</span>
            </div>
            <div className="vbody">
                <div className="vlabel">KODE VOUCHER</div>
                <div className="vcode">{v.code}</div>
                {v.pinCode && (
                    <>
                        <div className="vlabel">PASSWORD</div>
                        <div className="vcode vsmall">{v.pinCode}</div>
                    </>
                )}
                <div className="vrow">
                    <div>
                        <div className="vlabel">HARGA</div>
                        <div className="vstrong">{fmtIDR(v.price)}</div>
                    </div>
                    {batchNote && (
                        <div>
                            <div className="vlabel">PAKET</div>
                            <div className="vstrong">{batchNote}</div>
                        </div>
                    )}
                </div>
            </div>
            <div className="vfoot">login: hotspot — terima kasih</div>
        </div>
    );
}

function fmtIDR(v) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);
}

function voucherCss(layout) {
    const common = `
        body { margin: 0; background: #fff; color: #000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .print-page { padding: 8mm; }
        .print-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12mm; padding: 12px; background: #f3f4f6; border-radius: 8px; }
        .print-toolbar h2 { margin: 0; font-size: 16px; }
        .print-toolbar .actions { display: flex; gap: 8px; }
        .print-toolbar select, .print-toolbar button { padding: 8px 12px; font-size: 14px; border: 1px solid #d1d5db; background: #fff; border-radius: 6px; cursor: pointer; }
        .print-toolbar button { background: #3b82f6; color: #fff; border-color: #3b82f6; }
        .voucher { border: 1px dashed #6b7280; border-radius: 6px; padding: 8px 10px; background: #fff; page-break-inside: avoid; }
        .vh { display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #6b7280; margin-bottom: 6px; }
        .vno { font-weight: 600; }
        .vp { background: #e5e7eb; padding: 2px 6px; border-radius: 999px; }
        .vlabel { font-size: 9px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
        .vcode { font-family: ui-monospace, "Courier New", monospace; font-size: 22px; font-weight: 700; letter-spacing: 0.1em; padding: 4px 0; }
        .vsmall { font-size: 16px; }
        .vrow { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; }
        .vstrong { font-size: 13px; font-weight: 600; }
        .vfoot { font-size: 9px; color: #6b7280; text-align: center; margin-top: 6px; padding-top: 4px; border-top: 1px dashed #d1d5db; }

        @media print {
            .no-print { display: none !important; }
            .print-page { padding: 4mm; }
        }
    `;

    if (layout === 'thermal') {
        return common + `
            .voucher-grid { display: flex; flex-direction: column; gap: 4mm; max-width: 76mm; margin: 0 auto; }
            .voucher { width: 100%; }
            @page { size: 80mm auto; margin: 4mm; }
        `;
    }
    if (layout === 'small') {
        return common + `
            .voucher-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3mm; }
            .voucher { font-size: 10px; padding: 6px 8px; }
            .vcode { font-size: 16px; }
            .vsmall { font-size: 12px; }
            @page { size: A4; margin: 8mm; }
        `;
    }
    // a4 default
    return common + `
        .voucher-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; }
        @page { size: A4; margin: 10mm; }
    `;
}
