import React, { useState, useEffect, useMemo } from 'react';
import { FileCode2, Save, RotateCcw, Eye } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useMikhmonVoucherTemplate,
    useSaveMikhmonVoucherTemplate,
    useResetMikhmonVoucherTemplate,
    useMikhmonLogos,
    useMikhmonInfo,
} from '@/hooks/useMikhmon';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/lib/api';

/**
 * MikHMON Voucher Template Editor.
 *
 * Edit the Handlebars-style template that Cetak Cepat renders per
 * voucher. Variable cheat sheet on the right; live preview at the
 * bottom with mock voucher data so operator sees the result without
 * actually printing.
 */

const VARIABLES = [
    { name: 'logo', desc: 'URL logo (data: URL atau /api/...)' },
    { name: 'hotspotname', desc: 'Nama hotspot server' },
    { name: 'username', desc: 'Voucher username' },
    { name: 'password', desc: 'Voucher password (= username kalau vc)' },
    { name: 'validity', desc: 'Masa berlaku label (mis. "Aktif:1Hari")' },
    { name: 'timelimit', desc: 'Limit uptime label (mis. "Durasi:10Jam")' },
    { name: 'datalimit', desc: 'Quota data label' },
    { name: 'price', desc: 'Harga jual (numeric, mis. "5000")' },
    { name: 'profile', desc: 'Nama profile' },
    { name: 'comment', desc: 'Comment tag voucher (vc-NNN-mm.dd.yy-)' },
    { name: 'dnsname', desc: 'DNS hotspot untuk URL login' },
    { name: 'qrcode', desc: 'Data URL QR code (auto-generate)' },
    { name: 'num', desc: 'Nomor urut saat print batch' },
    { name: 'usermode', desc: '"vc" atau "up"' },
];

const HELPERS = [
    { syntax: '{{#if has_logo}}...{{/if}}', desc: 'Render kalau logo tersedia' },
    { syntax: '{{#if has_qr}}...{{/if}}', desc: 'Render kalau QR aktif' },
    { syntax: '{{#if usermode_vc}}...{{/if}}', desc: 'Mode vc (single code)' },
    { syntax: '{{#if usermode_up}}...{{/if}}', desc: 'Mode up (user + pass)' },
    { syntax: '{{#unless name}}...{{/unless}}', desc: 'Kebalikan dari #if' },
];

// Reverse the xss-style HTML escaping the sanitize middleware used to
// apply on PUT bodies before commit 2fc899b. Legacy templates have
// `&lt;style&gt;` literally — this restores `<style>` so they render.
function unescapeHtmlEntities(s) {
    return String(s || '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

// Render Handlebars-style template in the BROWSER for live preview.
// Mirrors the backend mikhmon-template.service exactly so what the
// operator sees here is what gets printed.
function renderTemplate(bodyIn, vars) {
    const body = unescapeHtmlEntities(bodyIn);
    const resolved = {
        ...vars,
        usermode_vc: vars.usermode === 'vc',
        usermode_up: vars.usermode === 'up',
        has_logo: !!vars.logo,
        has_qr: !!vars.qrcode,
        has_validity: !!vars.validity,
        has_timelimit: !!vars.timelimit,
        has_datalimit: !!vars.datalimit,
        has_price: !!vars.price && String(vars.price) !== '0',
    };
    let out = body;
    out = out.replace(/\{\{#unless\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/unless\}\}/g,
        (_, n, inner) => (resolved[n] ? '' : inner));
    out = out.replace(/\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (_, n, inner) => (resolved[n] ? inner : ''));
    out = out.replace(/\{\{\s*(\w+)\s*\}\}/g,
        (_, n) => (resolved[n] == null ? '' : String(resolved[n])));
    return out;
}

export default function TemplateEditor() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: tpl, isPending } = useMikhmonVoucherTemplate(selectedRouterId);
    const { data: logos = [] } = useMikhmonLogos(selectedRouterId);
    const { data: info } = useMikhmonInfo(selectedRouterId);
    const saveMutation = useSaveMikhmonVoucherTemplate(selectedRouterId);
    const resetMutation = useResetMikhmonVoucherTemplate(selectedRouterId);

    const [body, setBody] = useState('');
    const [qrEnabled, setQrEnabled] = useState(true);
    const [logoEnabled, setLogoEnabled] = useState(true);
    const [logoFilename, setLogoFilename] = useState('');

    useEffect(() => {
        if (tpl) {
            // Auto-decode any legacy &lt;/&gt; entities from rows saved
            // before the sanitize-bypass fix — operator sees clean HTML
            // and next save persists unescaped (because PUT now skips
            // xss for this route).
            setBody(unescapeHtmlEntities(tpl.body || ''));
            setQrEnabled(!!tpl.qrEnabled);
            setLogoEnabled(!!tpl.logoEnabled);
            setLogoFilename(tpl.logoFilename || '');
        }
    }, [tpl]);

    const baseURL = apiClient?.defaults?.baseURL || '/api';

    // Build a mock vars object for live preview. We use a fake logo URL
    // (the actual one if operator has picked a filename), and a small
    // inline base64 QR (placeholder — backend generates the real one
    // at print time). Selling price formatted like Reports.
    const mockVars = useMemo(() => {
        const logoUrl = logoEnabled && logoFilename
            ? `${baseURL}/mikhmon/${selectedRouterId}/logos/${encodeURIComponent(logoFilename)}`
            : '';
        return {
            logo: logoUrl,
            hotspotname: info?.router?.name || 'GENSTER',
            username: 'abc123',
            password: 'abc123',
            validity: 'Aktif:1Hari',
            timelimit: 'Durasi:10Jam',
            datalimit: '',
            price: '5000',
            profile: 'PAKET-1HARI',
            comment: 'vc-001-06.08.26-',
            dnsname: 'wifi.local',
            // Placeholder QR — backend generates the real one. Just shows
            // operator the layout when QR is enabled.
            qrcode: qrEnabled
                ? 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><rect width="60" height="60" fill="black"/><text x="30" y="34" text-anchor="middle" fill="white" font-size="10" font-family="monospace">QR</text></svg>'
                : '',
            num: 1,
            usermode: 'vc',
        };
    }, [logoEnabled, logoFilename, qrEnabled, info, selectedRouterId, baseURL]);

    const previewHtml = useMemo(() => {
        try {
            return renderTemplate(body || '', mockVars);
        } catch (e) {
            return `<div style="color:red">Render error: ${e?.message || e}</div>`;
        }
    }, [body, mockVars]);

    // Live preview rendered inside an iframe via srcDoc — gives the
    // template its own document so <style> blocks get parsed as CSS,
    // exactly like the print window. We chose srcDoc over the
    // contentDocument.write() approach because srcDoc is set as the
    // iframe's source attribute, so the browser builds a fresh
    // document with full HTML parsing (including style/script handling).
    // contentDocument.write() AFTER React mounts the iframe sometimes
    // races and the <style> inside the body doesn't get registered as
    // a real <style> element in some browsers.
    const previewDoc = useMemo(() => {
        return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;font-family:system-ui,sans-serif;background:#fff;color:#000;}</style></head><body>${previewHtml}</body></html>`;
    }, [previewHtml]);

    const handleSave = () => {
        if (!body?.trim() || body.length < 10) {
            toast.error('Body template terlalu pendek');
            return;
        }
        saveMutation.mutate({
            body,
            qrEnabled,
            logoEnabled,
            logoFilename: logoFilename || null,
        }, {
            onSuccess: () => toast.success('Template disimpan'),
            onError: (e) => toast.error(e?.response?.data?.message || 'Gagal simpan'),
        });
    };

    const handleReset = () => {
        if (!confirm('Reset ke template default? Perubahan kustom akan hilang.')) return;
        resetMutation.mutate(undefined, {
            onSuccess: () => toast.success('Template direset ke default'),
        });
    };

    const insertAtCursor = (token) => {
        const el = document.getElementById('tpl-body');
        if (!el) {
            setBody((b) => b + token);
            return;
        }
        const start = el.selectionStart ?? body.length;
        const end = el.selectionEnd ?? body.length;
        setBody(body.slice(0, start) + token + body.slice(end));
        // Restore cursor after the inserted token (next tick — state update is async)
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = start + token.length;
        });
    };

    return (
        <div className="space-y-4 max-w-7xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <FileCode2 className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">Template Editor</h1>
                        <p className="text-xs text-slate-500">Edit template HTML voucher pakai variable Handlebars <code className="text-slate-400">{'{{var}}'}</code>.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={handleReset} disabled={resetMutation.isPending}>
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Reset
                    </Button>
                    <Button onClick={handleSave} loading={saveMutation.isPending}>
                        <Save className="w-4 h-4 mr-1" />
                        Save
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Editor + config */}
                <div className="lg:col-span-2 space-y-3">
                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <label className="flex items-center gap-2 text-xs text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={qrEnabled}
                                    onChange={(e) => setQrEnabled(e.target.checked)}
                                    className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                                />
                                <span>Aktifkan QR Code</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={logoEnabled}
                                    onChange={(e) => setLogoEnabled(e.target.checked)}
                                    className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                                />
                                <span>Tampilkan Logo</span>
                            </label>
                            <select
                                value={logoFilename}
                                onChange={(e) => setLogoFilename(e.target.value)}
                                disabled={!logoEnabled || logos.length === 0}
                                className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs rounded-lg px-2 py-1.5 disabled:opacity-50"
                            >
                                <option value="">— Pilih logo —</option>
                                {logos.map((l) => <option key={l.filename} value={l.filename}>{l.filename}</option>)}
                            </select>
                        </div>

                        <textarea
                            id="tpl-body"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            spellCheck={false}
                            className="w-full h-[480px] font-mono text-xs bg-slate-950/80 border border-slate-700/60 text-slate-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                            placeholder="<table>...</table>"
                        />
                    </div>

                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-800/60 text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                            <Eye className="w-3.5 h-3.5" />
                            Live Preview
                            <span className="ml-2 normal-case text-[10px] text-slate-600 font-normal">
                                (mock voucher: abc123 · PAKET-1HARI · 1Hari · Rp 5.000)
                            </span>
                        </div>
                        <iframe
                            title="Voucher Preview"
                            className="w-full h-[360px] bg-white"
                            sandbox=""
                            srcDoc={previewDoc}
                        />
                    </div>
                </div>

                {/* Cheat sheet */}
                <div className="space-y-3">
                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Variables</div>
                        <div className="space-y-1">
                            {VARIABLES.map((v) => (
                                <button
                                    key={v.name}
                                    type="button"
                                    onClick={() => insertAtCursor(`{{${v.name}}}`)}
                                    className="w-full text-left px-2 py-1.5 rounded hover:bg-white/5 transition-colors group"
                                    title="Klik untuk insert ke cursor"
                                >
                                    <div className="font-mono text-[11px] text-primary">{`{{${v.name}}}`}</div>
                                    <div className="text-[10px] text-slate-500 group-hover:text-slate-400">{v.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Block Helpers</div>
                        <div className="space-y-1.5">
                            {HELPERS.map((h) => (
                                <button
                                    key={h.syntax}
                                    type="button"
                                    onClick={() => insertAtCursor(h.syntax)}
                                    className="w-full text-left px-2 py-1.5 rounded hover:bg-white/5 transition-colors group"
                                >
                                    <div className="font-mono text-[10px] text-amber-300 leading-tight">{h.syntax}</div>
                                    <div className="text-[10px] text-slate-500 group-hover:text-slate-400 mt-0.5">{h.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {isPending && (
                        <div className="text-xs text-slate-500 text-center">Memuat template…</div>
                    )}
                </div>
            </div>
        </div>
    );
}
