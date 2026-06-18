/**
 * Panels barrel — quick-view side panels untuk map context.
 *
 * Brief user (Step 4):
 *   - Panel detail router (CPU/RAM/uptime/netwatch/PPPoE count)
 *   - Panel detail netwatch host (IP/status/latency/packet loss/last seen)
 *   - Panel alert (list dengan filter severity)
 *   - Setiap panel punya tombol tutup (X) yang jelas
 *   - Panel tidak menumpuk (parent state manage single active panel)
 */
export { SidePanel, default as SidePanelDefault } from './SidePanel';
export { AlertPanel } from './AlertPanel';
